import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
const module=await import('./channel.mjs').catch(()=>({}));
test('channel provisioning writes separate private capabilities and sends only hashes to admin CLI',async t=>{
 assert.equal(typeof module.provisionChannel,'function');
 const root=await mkdtemp(join(tmpdir(),'cubeos-channel-'));t.after(()=>rm(root,{recursive:true,force:true}));
 let args;
 const result=await module.provisionChannel({directory:join(root,'channel'),deviceId:'22222222-2222-4222-8222-222222222222',endpoint:'https://test-123.convex.site/telemetry/v1/snapshot',convexURL:'https://test-123.convex.cloud'},async input=>{args=input;});
 const publish=JSON.parse(await readFile(result.publishFile,'utf8')),read=JSON.parse(await readFile(result.readFile,'utf8'));
 assert.notEqual(publish.publishToken,read.readToken);assert.equal(publish.readToken,undefined);assert.equal(read.publishToken,undefined);
 assert.equal((await stat(result.publishFile)).mode&0o777,0o600);assert.equal((await stat(result.readFile)).mode&0o777,0o600);
 assert.equal((await stat(join(root,'channel'))).mode&0o777,0o700);
 assert.ok(!JSON.stringify(args).includes(publish.publishToken));assert.ok(!JSON.stringify(args).includes(read.readToken));
 assert.match(args.publishHash,/^[a-f0-9]{64}$/);assert.equal(args.deviceId,publish.deviceId);
 await assert.rejects(module.provisionChannel({directory:join(root,'channel'),deviceId:args.deviceId,endpoint:publish.endpoint,convexURL:read.convexURL},async()=>{}));
 assert.deepEqual(JSON.parse(await readFile(result.publishFile,'utf8')),publish);
});
test('invalid destinations never provision or create capability files',async t=>{
 assert.equal(typeof module.provisionChannel,'function');const root=await mkdtemp(join(tmpdir(),'cubeos-channel-bad-'));t.after(()=>rm(root,{recursive:true,force:true}));
 for(const endpoint of ['http://localhost:8080/telemetry/v1/snapshot','https://test.convex.site.evil.com/telemetry/v1/snapshot','https://user:pass@test.convex.site/telemetry/v1/snapshot']){
  await assert.rejects(module.provisionChannel({directory:join(root,'channel'),deviceId:'22222222-2222-4222-8222-222222222222',endpoint,convexURL:'https://test.convex.cloud'},async()=>{throw Error('should not call');}));
 }
 await assert.rejects(stat(join(root,'channel')));
});
