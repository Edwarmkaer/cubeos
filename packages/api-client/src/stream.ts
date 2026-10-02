export type SSEMessage = {
    id: string;
    event: string;
    data: string;
};
export class SSETransportError extends Error {
}
/** Incremental UTF8/SSE decoder. Only complete, blank-line-terminated events
 * dispatch. Comments and retry hints cannot change the client's retry policy. */
export class SSEParser {
    private decoder = new TextDecoder("utf-8", { fatal: true });
    private line = "";
    private cr = false;
    private id = "";
    private event = "";
    private data: string[] = [];
    private size = 0;
    private emit: (message: SSEMessage) => void;
    private limit: number;
    constructor(emit: (message: SSEMessage) => void, limit = 1 << 20) { this.emit = emit; this.limit = limit; }
    push(bytes: Uint8Array) {
        for (let offset = 0; offset < bytes.length; offset += 4096)
            this.characters(this.decoder.decode(bytes.subarray(offset, offset + 4096), { stream: true }));
    }
    finish() { this.characters(this.decoder.decode()); /* incomplete final frame is discarded */ }
    private characters(text: string) {
        for (const character of text) {
            if (this.cr) {
                this.cr = false;
                if (character === "\n")
                    continue;
            }
            if (character === "\r" || character === "\n") {
                this.processLine();
                this.cr = character === "\r";
            }
            else {
                this.line += character;
                if (this.line.length + this.size > this.limit)
                    throw new Error("SSE event memory limit exceeded");
            }
        }
    }
    private processLine() {
        const line = this.line;
        this.line = "";
        if (line === "") {
            if (this.data.length > 0)
                this.emit({ id: this.id, event: this.event || "message", data: this.data.join("\n") });
            this.id = "";
            this.event = "";
            this.data = [];
            this.size = 0;
            return;
        }
        if (line.startsWith(":"))
            return;
        const colon = line.indexOf(":");
        const field = colon < 0 ? line : line.slice(0, colon);
        let value = colon < 0 ? "" : line.slice(colon + 1);
        if (value.startsWith(" "))
            value = value.slice(1);
        if (field === "data") {
            this.data.push(value);
            this.size += value.length + 1;
        }
        if (field === "id" && !value.includes("\0")) {
            this.size += value.length;
            this.id = value;
        }
        if (field === "event") {
            this.size += value.length;
            this.event = value;
        }
        if (this.size > this.limit)
            throw new Error("SSE event memory limit exceeded");
    }
}
export async function readSSE(body: ReadableStream<Uint8Array>, onMessage: (message: SSEMessage) => void, signal: AbortSignal, limit = 1 << 20, idleTimeoutMs = 45000) {
    const reader = body.getReader();
    const timeout = new AbortController();
    const readingSignal = AbortSignal.any([signal, timeout.signal]);
    const parser = new SSEParser(message => { readingSignal.throwIfAborted(); onMessage(message); }, limit);
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => { clearTimeout(timer); timer = setTimeout(() => timeout.abort(new SSETransportError("SSE idle timeout")), idleTimeoutMs); };
    const aborted = () => { void reader.cancel(readingSignal.reason).catch(() => { }); };
    readingSignal.addEventListener("abort", aborted, { once: true });
    reset();
    try {
        readingSignal.throwIfAborted();
        while (true) {
            let result: ReadableStreamReadResult<Uint8Array>;
            try {
                result = await reader.read();
            }
            catch {
                readingSignal.throwIfAborted();
                throw new SSETransportError("SSE connection interrupted");
            }
            readingSignal.throwIfAborted();
            if (result.done) {
                parser.finish();
                return;
            }
            reset();
            parser.push(result.value);
        }
    }
    finally {
        clearTimeout(timer!);
        readingSignal.removeEventListener("abort", aborted);
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
