import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cameraDemoFrames } from "../src/components/visor/camera-demo.ts";

test("the six existing gallery photos resolve to bundled JPEGs without a remote origin", async () => {
  assert.deepEqual(cameraDemoFrames.map((frame) => frame.id), [
    "demo-peru-coast", "demo-pacific-clouds", "demo-andes-snow",
    "demo-toquepala-mine", "demo-lake-titicaca", "demo-amazon-source",
  ]);
  for (const frame of cameraDemoFrames) {
    assert.ok(frame.src.startsWith("/demo/camera/"), `remote dependency: ${frame.src}`);
    const bytes = await readFile(new URL(`../public${frame.src}`, import.meta.url));
    assert.equal(bytes.readUInt16BE(0), 0xffd8, `not a JPEG: ${frame.src}`);
    assert.ok(bytes.length > 1000, `incomplete photo: ${frame.src}`);
  }
});
