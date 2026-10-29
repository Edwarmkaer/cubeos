import {test} from 'node:test';import assert from 'node:assert/strict';
import {useTelemetryStore} from '../src/lib/telemetry-store.ts';
import {validateSelection,startTelemetry} from '../src/lib/telemetry-source.ts';
import snapshot from '../../../packages/contracts/fixtures/chasqui-v2/backend-snapshot-example-v2.json' with {type:'json'};
import type {SubscriptionOptions} from '@cubeos/api-client';
import {parseCloudReplica} from '@cubeos/contracts/cloud-replica';
const cloud={mode:'cloud' as const,apiURL:'https://test-123.convex.cloud',deviceId:'',deviceName:'Canal cloud',offline:false,cloudChannelId:'11111111-1111-4111-8111-111111111111',cloudReadToken:'b'.repeat(64)};
test('cloud capability is explicit and constrained to the exact secure origin',()=>{
 assert.doesNotThrow(()=>validateSelection(cloud));
 for(const change of [{cloudReadToken:''},{cloudChannelId:'bad'},{apiURL:'https://test.convex.cloud.evil.com'},{apiURL:'http://localhost:3210'}])assert.throws(()=>validateSelection({...cloud,...change}));
});
test('cloud revocation clears retained data and read credential; later data is ignored',async()=>{
 const store=useTelemetryStore;store.getState().select(cloud);
 let denied:((state:'unauthorized')=>void)|undefined;
 let emit:SubscriptionOptions['onSnapshot']|undefined;
 const stop=startTelemetry(store,()=>({subscribeTelemetry:async(_id,options)=>{denied=options.onConnection;emit=options.onSnapshot;await new Promise<void>(r=>options.signal.addEventListener('abort',()=>r()));}}));
 const checked=parseCloudReplica({replicaVersion:1,channelId:cloud.cloudChannelId,deviceId:'22222222-2222-4222-8222-222222222222',revisionId:'1',snapshot,freshnessByGroup:{}}).snapshot;
 assert.ok(denied,'cloud subscription did not start');assert.ok(emit);emit({revisionId:'1',snapshot:checked,freshnessByGroup:{}});assert.ok(store.getState().event);denied('unauthorized');
 emit({revisionId:'2',snapshot:checked,freshnessByGroup:{}});
 assert.equal(store.getState().selection.cloudReadToken,'');assert.equal(store.getState().event,null);assert.equal(store.getState().connection,'unauthorized');stop();
});
