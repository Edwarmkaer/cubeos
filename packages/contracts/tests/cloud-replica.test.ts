import {test} from 'node:test';
import assert from 'node:assert/strict';
import snapshot from '../fixtures/chasqui-v2/backend-snapshot-example-v2.json' with {type:'json'};
const module=await import('../src/cloud-replica.ts').catch(()=>({}));
const fixture=()=>({replicaVersion:1,channelId:'11111111-1111-4111-8111-111111111111',deviceId:'22222222-2222-4222-8222-222222222222',revisionId:'9007199254740993',snapshot:structuredClone(snapshot),freshnessByGroup:{E:{receivedAt:'2026-10-29T18:00:00Z',sequence:1,uptimeMs:10,receptionEpoch:0,fields:{'sensors.bme680.temperatureC':{receivedAt:'2026-10-29T18:00:00Z',sequence:1,uptimeMs:10,receptionEpoch:0}}}}});
test('cloud replica retains int64 precision and rejects malformed revisions',()=>{
 assert.ok('parseCloudReplica' in module,'cloud parser missing');
 const parse=(module as {parseCloudReplica:(v:unknown)=>ReturnType<typeof fixture>}).parseCloudReplica;
 for(const revisionId of ['9007199254740993','9223372036854775807'])assert.equal(parse({...fixture(),revisionId}).revisionId,revisionId);
 for(const revisionId of ['0','01','9223372036854775808','1e2',42])assert.throws(()=>parse({...fixture(),revisionId}));
});
test('cloud rejects corrupt snapshot, freshness, identities, extra fields and versions',()=>{
 assert.ok('parseCloudReplica' in module);
 const parse=(module as {parseCloudReplica:(v:unknown)=>unknown}).parseCloudReplica;
 for(const change of [{replicaVersion:2},{channelId:'CS01'},{deviceId:'bad'},{extra:true},{freshnessByGroup:{E:{receivedAt:'bad'}}},{snapshot:{...snapshot,unexpected:1}}])assert.throws(()=>parse({...fixture(),...change}));
 const bad=fixture();bad.snapshot.sensors.bme680.relativeHumidityPct=101;assert.throws(()=>parse(bad));
 assert.doesNotThrow(()=>parse(fixture()));
});
