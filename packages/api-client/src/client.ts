import { validateSnapshotV2 } from "@cubeos/contracts";
import type { SnapshotProjectionV2, SnapshotV2, GroupFreshness, FieldFreshness, IngestionSourceInput, IngestionSource, ProvisionedIngestionSource, TelemetryPage, MessageType } from "@cubeos/contracts";
import { readSSE, SSETransportError } from "./stream.ts";
export type ConnectionState = "connecting" | "connected" | "reconnecting" | "unauthorized" | "error" | "closed";
export type SnapshotEvent = {
    revision: number;
    revisionId: string;
    snapshot: SnapshotV2;
    freshnessByGroup: SnapshotProjectionV2["freshnessByGroup"];
};
export type SubscriptionOptions = {
    getToken: () => string | null | Promise<string | null>;
    onSnapshot: (snapshot: SnapshotEvent) => void;
    onConnection: (state: ConnectionState) => void;
    signal: AbortSignal;
};
export type Device = {
    id: string;
    name: string;
    protocolDeviceId: string;
};
export class APIError extends Error {
    readonly status: number;
    readonly retryable: boolean;
    constructor(message: string, status = 0, retryable = false) { super(message); this.name = "APIError"; this.status = status; this.retryable = retryable; }
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const uint32 = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 4294967295;
const timestamp = (v: unknown) => typeof v === "string" && Number.isFinite(Date.parse(v));
function field(v: unknown): v is FieldFreshness { return object(v) && timestamp(v.receivedAt) && uint32(v.sequence) && uint32(v.uptimeMs) && typeof v.receptionEpoch === "number" && Number.isInteger(v.receptionEpoch) && v.receptionEpoch >= 0; }
function freshness(v: unknown): v is SnapshotProjectionV2["freshnessByGroup"] {
    return object(v) && Object.entries(v).every(([k, g]) => ["H", "E", "O", "I", "G"].includes(k) && field(g) && object((g as GroupFreshness).fields) && Object.values((g as GroupFreshness).fields).every(field));
}
/** Read the top-level integer lexeme before JSON.parse rounds int64. Strings
 * and nested keys are skipped by tokenization; duplicated root keys fail. */
function revisionLexeme(raw: string): string {
    const tokens = /\s*("(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}[\],:])/gy;
    let depth = 0;
    let key = "";
    let revision = "";
    const keys = new Set<string>();
    let token: RegExpExecArray | null;
    while ((token = tokens.exec(raw)) !== null) {
        const value = token[1];
        if (depth === 1 && value.startsWith('"') && raw.slice(tokens.lastIndex).trimStart().startsWith(":")) {
            key = JSON.parse(value) as string;
            if (keys.has(key))
                throw new APIError("Duplicate snapshot key");
            keys.add(key);
        }
        else if (depth === 1 && key === "revision" && value !== ":") {
            revision = value;
            key = "";
        }
        if (value === "{" || value === "[")
            depth++;
        if (value === "}" || value === "]")
            depth--;
    }
    if (!/^[1-9]\d{0,18}$/.test(revision) || BigInt(revision) > 9223372036854775807n)
        throw new APIError("Invalid snapshot revision");
    return revision;
}
export function parseSnapshot(raw: string): SnapshotEvent {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    }
    catch {
        throw new APIError("Invalid snapshot JSON");
    }
    const revisionId = revisionLexeme(raw);
    if (!object(value) || typeof value.revision !== "number" || value.revision !== Number(revisionId) || !validateSnapshotV2(value.snapshot) || !freshness(value.freshnessByGroup))
        throw new APIError("Invalid snapshot contract");
    return { revision: value.revision, revisionId, snapshot: value.snapshot, freshnessByGroup: value.freshnessByGroup };
}
function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    return new Promise((resolve, reject) => {
        const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
        signal.addEventListener("abort", abort, { once: true });
        promise.then(value => { signal.removeEventListener("abort", abort); resolve(value); }, error => { signal.removeEventListener("abort", abort); reject(error); });
    });
}
async function pause(ms: number, signal: AbortSignal) { let timer: ReturnType<typeof setTimeout> | undefined; try {
    await cancellable(new Promise<void>(resolve => { timer = setTimeout(resolve, ms); }), signal);
}
finally {
    clearTimeout(timer);
} }
function devicePath(id: string) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    throw new APIError("Invalid device UUID"); return `/api/v1/devices/${encodeURIComponent(id)}`; }
async function boundedText(response: Response, signal: AbortSignal): Promise<string> {
    if (!response.body)
        throw new APIError("Missing response body");
    const reader = response.body.getReader();
    let size = 0;
    let text = "";
    const decoder = new TextDecoder("utf-8", { fatal: true });
    try {
        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>;
            try {
                result = await cancellable(reader.read(), signal);
            } catch {
                signal.throwIfAborted();
                throw new APIError("REST response body interrupted", 0, true);
            }
            if (result.done)
                return text + decoder.decode();
            size += result.value.byteLength;
            if (size > 1 << 20)
                throw new APIError("Response memory limit exceeded");
            text += decoder.decode(result.value, { stream: true });
        }
    }
    finally {
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
export class APIClient {
    private base: string;
    private retryDelay: number;
    constructor(baseURL: string, options: {
        retryDelayMs?: number;
    } = {}) {
        const url = new URL(baseURL);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
            throw new APIError("Invalid API URL");
        this.base = url.toString().replace(/\/$/, "");
        this.retryDelay = options.retryDelayMs ?? 250;
        if (!Number.isFinite(this.retryDelay) || this.retryDelay < 1 || this.retryDelay > 10000)
            throw new APIError("Invalid retry delay");
    }
    private async response(path: string, token: string | null, signal: AbortSignal, init: RequestInit = {}): Promise<Response> {
        signal.throwIfAborted();
        const headers = new Headers(init.headers);
        if (token !== null) {
            if (!token || /[\r\n]/.test(token))
                throw new APIError("Invalid session token", 401);
            headers.set("Authorization", `Bearer ${token}`);
        }
        let response: Response;
        try {
            response = await fetch(this.base + path, { ...init, headers, signal, credentials: "omit", redirect: "error" });
        }
        catch (error) {
            if (signal.aborted)
                throw signal.reason;
            throw new APIError(error instanceof Error ? error.message : "Network failure", 0, true);
        }
        if (!response.ok) {
            await response.body?.cancel();
            throw new APIError(`API HTTP ${response.status}`, response.status, response.status === 408 || response.status === 429 || response.status >= 500);
        }
        return response;
    }
    private async json<T>(path: string, token: string | null, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
        const response = await this.response(path, token, signal, init);
        if (response.status === 204)
            return undefined as T;
        if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
            await response.body?.cancel();
            throw new APIError("Expected application/json");
        }
        try {
            return JSON.parse(await boundedText(response, signal)) as T;
        }
        catch (error) {
            if (error instanceof APIError || signal.aborted)
                throw error;
            throw new APIError("Invalid API JSON");
        }
    }
    listDevices(token: string | null, signal: AbortSignal) { return this.json<Device[]>("/api/v1/devices", token, signal); }
    getDevice(id: string, token: string | null, signal: AbortSignal) { return this.json<Device>(devicePath(id), token, signal); }
    createDevice(input: {
        name: string;
        protocolDeviceId: string;
    }, token: string | null, signal: AbortSignal) { return this.json<Device>("/api/v1/devices", token, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); }
    renameDevice(id: string, name: string, token: string | null, signal: AbortSignal) { return this.json<Device>(devicePath(id), token, signal, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }); }
    deleteDevice(id: string, token: string | null, signal: AbortSignal) { return this.json<void>(devicePath(id), token, signal, { method: "DELETE" }); }
    provisionSource(id: string, input: IngestionSourceInput, token: string | null, signal: AbortSignal) { return this.json<ProvisionedIngestionSource>(devicePath(id) + "/sources", token, signal, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) }); }
    listSources(id: string, token: string | null, signal: AbortSignal) { return this.json<IngestionSource[]>(devicePath(id) + "/sources", token, signal); }
    revokeSource(id: string, sourceId: string, token: string | null, signal: AbortSignal) { devicePath(sourceId); return this.json<void>(devicePath(id) + "/sources/" + encodeURIComponent(sourceId), token, signal, { method: "DELETE" }); }
    listPackets(id: string, filter: {
        m?: MessageType;
        from?: string;
        to?: string;
        cursor?: string;
        limit?: number;
    }, token: string | null, signal: AbortSignal) {
        const query = new URLSearchParams();
        for (const [key, value] of Object.entries(filter)) {
            if (value !== undefined)
                query.set(key, String(value));
        }
        return this.json<TelemetryPage>(devicePath(id) + "/packets?" + query, token, signal);
    }
    async getSnapshot(id: string, token: string | null, signal: AbortSignal): Promise<SnapshotEvent> {
        const response = await this.response(devicePath(id) + "/snapshot", token, signal);
        if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
            await response.body?.cancel();
            throw new APIError("Expected application/json");
        }
        return parseSnapshot(await boundedText(response, signal));
    }
    async subscribeTelemetry(id: string, options: SubscriptionOptions): Promise<void> {
        const path = devicePath(id);
        const { signal, getToken, onSnapshot, onConnection } = options;
        let latest = 0n;
        let attempt = 0;
        const deliver = (event: SnapshotEvent) => { const revision = BigInt(event.revisionId); if (revision > latest) {
            latest = revision;
            onSnapshot(event);
        } };
        try {
            while (!signal.aborted) {
                onConnection(attempt === 0 ? "connecting" : "reconnecting");
                signal.throwIfAborted();
                try {
                    const token = await cancellable(Promise.resolve().then(getToken), signal);
                    try {
                        deliver(await this.getSnapshot(id, token, signal));
                    }
                    catch (error) {
                        if (!(error instanceof APIError) || error.status !== 404)
                            throw error;
                    }
                    signal.throwIfAborted();
                    const response = await this.response(path + "/events", token, signal, { headers: { Accept: "text/event-stream", ...(latest > 0n && { "Last-Event-ID": `${id}:${latest}` }) } });
                    if (response.headers.get("Content-Type")?.split(";")[0].trim() !== "text/event-stream" || !response.body) {
                        await response.body?.cancel();
                        throw new APIError("Expected text/event-stream");
                    }
                    onConnection("connected");
                    await readSSE(response.body, message => {
                        if (message.event !== "snapshot")
                            return;
                        const event = parseSnapshot(message.data);
                        if (message.id !== `${id}:${event.revisionId}`)
                            throw new APIError("SSE revision ID mismatch");
                        const value: unknown = JSON.parse(message.data);
                        if (!object(value) || Object.keys(value).some(k => !["revision", "snapshot", "freshnessByGroup"].includes(k)))
                            throw new APIError("Invalid SSE snapshot contract");
                        deliver(event);
                        attempt = 0;
                    }, signal);
                }
                catch (error) {
                    if (signal.aborted)
                        break;
                    if (!(error instanceof SSETransportError) && (!(error instanceof APIError) || !error.retryable)) {
                        onConnection(error instanceof APIError && [401, 403].includes(error.status) ? "unauthorized" : "error");
                        throw error;
                    }
                }
                if (signal.aborted)
                    break;
                onConnection("reconnecting");
                await pause(Math.min(10000, this.retryDelay * 2 ** Math.min(attempt++, 6)), signal);
            }
        }
        catch (error) {
            if (!signal.aborted)
                throw error;
        }
        finally {
            onConnection("closed");
        }
    }
}
