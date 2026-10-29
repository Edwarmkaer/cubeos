import {test,expect,vi,afterEach} from 'vitest';
import {convexTest} from 'convex-test';
import rateLimiter from '@convex-dev/rate-limiter/test';
import {makeFunctionReference} from 'convex/server';
import snapshot from '../../contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json';
import {parseCloudReplica} from '@cubeos/contracts/cloud-replica';
const modules=import.meta.glob('../convex/**/*.ts');
const schemaModule=await import('../convex/schema').catch(()=>({default:undefined}));
const provision=makeFunctionReference<'mutation'>('channels:provision');
const revoke=makeFunctionReference<'mutation'>('channels:revoke');
const latest=makeFunctionReference<'query'>('replicas:latest');
const channel='11111111-1111-4111-8111-111111111111';
const device='22222222-2222-4222-8222-222222222222';
const publishToken='a'.repeat(64),readToken='b'.repeat(64);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
async function setup(){
 expect(schemaModule.default,'cloud schema missing').toBeDefined();
 const t=convexTest(schemaModule.default,modules);rateLimiter.register(t);
 await t.mutation(provision,{channelId:channel,deviceId:device,protocolDeviceId:'CS01',publishHash:await hash(publishToken),readHash:await hash(readToken),expiresAt:Date.now()+8*3600000});return t;
}
const replica=(revisionId='9007199254740993')=>({replicaVersion:1,channelId:channel,deviceId:device,revisionId,snapshot,freshnessByGroup:{}});
const post=(t:ReturnType<typeof convexTest>,body:unknown=replica(),token=publishToken)=>t.fetch('/telemetry/v1/snapshot',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
afterEach(()=>vi.useRealTimers());
test('browser and Convex fixture satisfies the canonical cloud contract',()=>{expect(()=>parseCloudReplica(replica())).not.toThrow();});
test('publish and read capabilities are isolated and never returned',async()=>{
 const t=await setup();expect((await post(t,replica(),readToken)).status).toBe(403);
 expect((await post(t)).status).toBe(200);
 await expect(t.query(latest,{channelId:channel,readToken:publishToken})).rejects.toThrow();
 await expect(t.query(latest,{channelId:'33333333-3333-4333-8333-333333333333',readToken})).rejects.toThrow();
 const result=await t.query(latest,{channelId:channel,readToken});expect(result.revisionId).toBe('9007199254740993');
 expect(JSON.stringify(result)).not.toContain(publishToken);expect(JSON.stringify(result)).not.toContain(readToken);expect(JSON.stringify(result)).not.toContain('Hash');
});
test('duplicates are idempotent, older/conflicting replicas cannot replace latest',async()=>{
 const t=await setup();expect((await post(t)).status).toBe(200);expect((await post(t)).status).toBe(200);
 expect((await post(t,replica('9007199254740992'))).status).toBe(409);
 expect((await post(t,{...replica(),snapshot:{...snapshot,lastSequence:99}})).status).toBe(409);
 expect((await t.query(latest,{channelId:channel,readToken})).snapshot.lastSequence).toBe(2003);
});
test('invalid and oversized input never creates a replica',async()=>{
 const t=await setup();for(const input of [{...replica(),deviceId:channel},{...replica(),snapshot:{}},{...replica(),revisionId:'9223372036854775808'}])expect((await post(t,input)).status).toBe(400);
 expect((await post(t,{padding:'x'.repeat(66000)})).status).toBe(413);
 expect(await t.query(latest,{channelId:channel,readToken})).toBeNull();
});
test('per-channel throttling preserves last accepted data',async()=>{
 vi.useFakeTimers();const t=await setup();expect((await post(t,replica('1'))).status).toBe(200);
 expect((await post(t,replica('2'))).status).toBe(429);
 vi.advanceTimersByTime(1100);expect((await post(t,replica('2'))).status).toBe(200);
});
test('revocation and expiry deny both publishers and readers',async()=>{
 vi.useFakeTimers();const t=await setup();expect((await post(t)).status).toBe(200);
 vi.advanceTimersByTime(8*3600000+1);expect((await post(t)).status).toBe(403);
 await expect(t.query(latest,{channelId:channel,readToken})).rejects.toThrow();
 vi.useRealTimers();const other=await setup();await other.mutation(revoke,{channelId:channel});
 expect((await post(other)).status).toBe(403);await expect(other.query(latest,{channelId:channel,readToken})).rejects.toThrow();
});
