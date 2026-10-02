import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { once } from "node:events";
import example from "../../contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json" with { type: "json" };
import { APIClient, APIError } from "../src/client.ts";
const device = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const projection = { revision: 1, snapshot: example, freshnessByGroup: {}, projectionState: { frontierEpoch: 0, minimumEpoch: 0, statusEvidence: {} } };
async function serving(handler: (r: IncomingMessage, w: ServerResponse) => void, run: (base: string) => Promise<void>) {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
        await run(`http://127.0.0.1:${address.port}`);
    }
    finally {
        server.closeAllConnections();
        await new Promise<void>(resolve => server.close(() => resolve()));
    }
}
test("typed REST and reconnect refresh tokens, deduplicate and keep exact int64 IDs", async () => {
    let connections = 0;
    let tokens = 0;
    const received: string[] = [];
    const auth: string[] = [];
    const abort = new AbortController();
    await serving((r, w) => {
        auth.push(r.headers.authorization ?? "");
        assert.ok(!r.url?.includes("token"));
        if (r.url?.endsWith("/snapshot")) {
            w.setHeader("Content-Type", "application/json");
            w.end(JSON.stringify(projection));
            return;
        }
        connections++;
        w.setHeader("Content-Type", "text/event-stream");
        const revision = connections === 1 ? "9007199254740992" : "9007199254740993";
        const data = JSON.stringify({ revision: 1, snapshot: example, freshnessByGroup: {} }).replace('"revision":1', '"revision":' + revision);
        const frame = `id: ${device}:${revision}\nevent: snapshot\ndata: ${data}\n\n`;
        w.end(frame + frame);
    }, async (base) => {
        const client = new APIClient(base, { retryDelayMs: 10 });
        await client.subscribeTelemetry(device, { getToken: () => `session-${++tokens}`, signal: abort.signal, onConnection: () => { }, onSnapshot(value) { received.push(value.revisionId); if (received.length === 3)
                abort.abort(); } });
    });
    assert.deepEqual(received, ["1", "9007199254740992", "9007199254740993"]);
    assert.equal(connections, 2);
    assert.equal(tokens, 2);
    assert.deepEqual(auth, ["Bearer session-1", "Bearer session-1", "Bearer session-2", "Bearer session-2"]);
});
test("401 stops retries, content type and snapshot contract failures surface", async () => {
    for (const mode of ["unauthorized", "html", "invalid"]) {
        let calls = 0;
        await serving((_r, w) => { calls++; if (mode === "unauthorized") {
            w.writeHead(401);
            w.end();
        }
        else {
            w.setHeader("Content-Type", mode === "html" ? "text/html" : "application/json");
            w.end('{}');
        } }, async (base) => {
            await assert.rejects(new APIClient(base).subscribeTelemetry(device, { signal: AbortSignal.timeout(1000), getToken: () => null, onSnapshot: () => { }, onConnection: () => { } }), APIError);
        });
        assert.equal(calls, 1);
    }
});
test("consumer cancellation during retry and token retrieval returns promptly", async () => {
    const abort = new AbortController();
    let calls = 0;
    await serving((_r, w) => { calls++; w.writeHead(503); w.end(); }, async (base) => {
        const promise = new APIClient(base, { retryDelayMs: 10000 }).subscribeTelemetry(device, { signal: abort.signal, getToken: () => null, onSnapshot: () => { }, onConnection(state) { if (state === "reconnecting")
                abort.abort(); } });
        await promise;
        assert.equal(calls, 1);
    });
    const stop = new AbortController();
    const waiting = new APIClient("http://localhost:8080").subscribeTelemetry(device, { signal: stop.signal, getToken: () => new Promise(() => { }), onSnapshot: () => { }, onConnection: () => { } });
    stop.abort();
    await waiting;
});
test("SSE ID mismatch and malformed JSON end subscription", async () => {
    await serving((r, w) => { if (r.url?.endsWith("/snapshot")) {
        w.setHeader("Content-Type", "application/json");
        w.end(JSON.stringify(projection));
    }
    else {
        w.setHeader("Content-Type", "text/event-stream");
        w.end(`id: ${device}:3\nevent: snapshot\ndata: ${JSON.stringify({ revision: 2, snapshot: example, freshnessByGroup: {} })}\n\n`);
    } }, async (base) => {
        await assert.rejects(new APIClient(base).subscribeTelemetry(device, { signal: AbortSignal.timeout(1000), getToken: () => null, onSnapshot: () => { }, onConnection: () => { } }), /revision/i);
    });
});

test("TCP cut inside REST snapshot body retries with a fresh token and deduplicates SSE", async () => {
    const auth: string[] = [];
    const received: string[] = [];
    let tokens = 0;
    const abort = new AbortController();
    await serving((r, w) => {
        auth.push(r.headers.authorization ?? "");
        if (auth.length === 1) {
            w.writeHead(200, { "Content-Type": "application/json", "Content-Length": "10000" });
            w.write('{"revision":');
            setTimeout(() => w.destroy(), 10);
        } else if (r.url?.endsWith("/snapshot")) {
            w.setHeader("Content-Type", "application/json");
            w.end(JSON.stringify({ ...projection, revision: 2 }));
        } else {
            w.setHeader("Content-Type", "text/event-stream");
            const frame = (revision: number) => `id: ${device}:${revision}\nevent: snapshot\ndata: ${JSON.stringify({ revision, snapshot: example, freshnessByGroup: {} })}\n\n`;
            w.end(frame(2) + frame(3));
        }
    }, async base => {
        await new APIClient(base, { retryDelayMs: 10 }).subscribeTelemetry(device, {
            getToken: () => `fresh-${++tokens}`, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(2000)]),
            onConnection: () => {}, onSnapshot: event => { received.push(event.revisionId); if (event.revisionId === "3") abort.abort(); },
        });
    });
    assert.deepEqual(received, ["2", "3"]);
    assert.deepEqual(auth, ["Bearer fresh-1", "Bearer fresh-2", "Bearer fresh-2"]);
    assert.equal(tokens, 2);
});

test("direct REST body network failure is retryable, invalid UTF8 remains terminal", async () => {
    await serving((_r, w) => {
        w.writeHead(200, { "Content-Type": "application/json", "Content-Length": "10000" });
        w.write('{"revision":'); setTimeout(() => w.destroy(), 10);
    }, async base => {
        await assert.rejects(new APIClient(base).getSnapshot(device, null, AbortSignal.timeout(1000)), error => error instanceof APIError && error.retryable);
    });
    let calls = 0;
    await serving((_r, w) => { calls++; w.setHeader("Content-Type", "application/json"); w.end(Buffer.from([0xff])); }, async base => {
        await assert.rejects(new APIClient(base, { retryDelayMs: 10 }).subscribeTelemetry(device, {
            signal: AbortSignal.timeout(1000), getToken: () => null, onSnapshot: () => {}, onConnection: () => {},
        }), TypeError);
    });
    assert.equal(calls, 1);
});

test("cancellation interrupts a pending REST body without retrying", async () => {
    const abort = new AbortController(); let calls = 0; let tokens = 0; let closed = false;
    await serving((_r, w) => {
        calls++; w.on("close", () => { closed = true; });
        w.writeHead(200, { "Content-Type": "application/json", "Content-Length": "10000" });
        w.write('{"revision":'); setTimeout(() => abort.abort(), 10);
    }, async base => {
        await new APIClient(base, { retryDelayMs: 10 }).subscribeTelemetry(device, {
            signal: abort.signal, getToken: () => { tokens++; return null; }, onSnapshot: () => {}, onConnection: () => {},
        });
        for (let i = 0; i < 10 && !closed; i++) await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(closed, true, "cancelled REST reader left TCP response open");
    });
    assert.equal(calls, 1); assert.equal(tokens, 1);
});
