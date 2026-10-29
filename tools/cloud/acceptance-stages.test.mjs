import {test} from 'node:test';import assert from 'node:assert/strict';
const module=await import('./acceptance-stages.mjs').catch(()=>({}));
test('acceptance requires real runtime and expiry stages and propagates expiry failure',async()=>{
 assert.equal(typeof module.runAcceptanceStages,'function');const calls=[];
 await module.runAcceptanceStages(async stage=>calls.push(stage));assert.deepEqual(calls,['tools/runtime/smoke.mjs','tools/cloud/expiry-smoke.mjs']);
 await assert.rejects(module.runAcceptanceStages(async stage=>{if(stage.includes('expiry'))throw Error('expiry broken');}),/expiry broken/);
});
