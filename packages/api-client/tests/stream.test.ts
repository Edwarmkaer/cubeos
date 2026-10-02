import test from "node:test";
import assert from "node:assert/strict";
import { SSEParser, readSSE, SSETransportError } from "../src/stream.ts";
test("UTF8 byte splits, CRLF and multiline events exclude comments/heartbeat", async () => {
    const raw = new TextEncoder().encode(': heartbeat\r\nid: device:7\r\nevent: snapshot\r\ndata: {"name":"Perú",\r\ndata: "revision":7}\r\n\r\n');
    const messages: unknown[] = [];
    const parser = new SSEParser(message => messages.push(message));
    for (const byte of raw)
        parser.push(new Uint8Array([byte]));
    parser.finish();
    assert.deepEqual(messages, [{ id: "device:7", event: "snapshot", data: '{"name":"Perú",\n"revision":7}' }]);
});
test("unterminated and multiline event memory is bounded", () => {
    const parser = new SSEParser(() => { }, 64);
    assert.throws(() => parser.push(new TextEncoder().encode("data: " + "a".repeat(100))), /limit/i);
    const multiline = new SSEParser(() => { }, 64);
    assert.throws(() => multiline.push(new TextEncoder().encode("data: 1234567890\n".repeat(20))), /limit/i);
});
test("cancellation interrupts a pending read and cleans reader", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    const controller = new AbortController();
    const reading = readSSE(body, () => { }, controller.signal);
    controller.abort();
    await assert.rejects(reading, { name: "AbortError" });
    assert.equal(cancelled, true);
});
test("invalid UTF8 and incomplete final event never masquerade as telemetry", () => {
    const messages: unknown[] = [];
    const p = new SSEParser(m => messages.push(m));
    p.push(new TextEncoder().encode("data: incomplete"));
    p.finish();
    assert.deepEqual(messages, []);
    assert.throws(() => new SSEParser(() => { }).push(new Uint8Array([0xff])));
});
test("silent connection times out and releases pending reader", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
    await assert.rejects(readSSE(body, () => { }, new AbortController().signal, 1024, 10), SSETransportError);
    assert.equal(cancelled, true);
});
test("cancel from consumer prevents subsequent events in the same chunk", async () => {
    const stop = new AbortController();
    let delivered = 0;
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("data: first\n\ndata: second\n\n")); } });
    await assert.rejects(readSSE(body, () => { delivered++; stop.abort(); }, stop.signal), { name: "AbortError" });
    assert.equal(delivered, 1);
});
