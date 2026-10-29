import assert from "node:assert/strict";
import { test } from "node:test";
import { authConfig } from "../src/lib/auth-config.ts";
test('cloud deployment needs a valid Convex URL, not Clerk credentials',()=>{
 assert.equal(authConfig('cloud',undefined,'https://test-123.convex.cloud').mode,'cloud');
 for(const url of [undefined,'http://localhost:3210','https://test.convex.cloud.evil.com','https://test.convex.cloud?token=x'])assert.equal(authConfig('cloud',undefined,url).mode,'invalid');
});

test("local deployment never exposes a remote provider key; public errors fail closed", () => {
  assert.deepEqual(authConfig(undefined, "ignored"), { mode: "local", publishableKey: "" });
  assert.deepEqual(authConfig("local", "ignored"), { mode: "local", publishableKey: "" });
  for (const [mode, key] of [["public", undefined], ["public", "broken"], ["typo", "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk"]]) {
    assert.equal(authConfig(mode, key).mode, "invalid");
    assert.equal(authConfig(mode, key).publishableKey, "");
  }
  assert.equal(authConfig("public", "pk_test_Zml4dHVyZS5jbGVyay5hY2NvdW50cy5kZXYk").mode, "public");
});
