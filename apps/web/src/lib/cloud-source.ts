import {parseCloudReplica} from '@cubeos/contracts/cloud-replica';
import type {SubscriptionOptions} from '@cubeos/api-client';
import type {SourceSelection} from './telemetry-store.ts';
export function createCloudSubscriber(selection:SourceSelection){
 return {async subscribeTelemetry(_deviceId:string,options:SubscriptionOptions):Promise<void>{
  options.signal.throwIfAborted();
  const [{ConvexClient},{makeFunctionReference}]=await Promise.all([import('convex/browser'),import('convex/server')]);
  if(options.signal.aborted)return;
  const client=new ConvexClient(selection.apiURL,{logger:false});
  options.onConnection('connecting');
  await new Promise<void>(resolve=>{
   let closed=false;let stopQuery=()=>{};let stopConnection=()=>{};
   const finish=()=>{if(closed)return;closed=true;options.signal.removeEventListener('abort',finish);stopQuery();stopConnection();void client.close();resolve();};
   options.signal.addEventListener('abort',finish,{once:true});
   stopConnection=client.subscribeToConnectionState(state=>{if(!closed)options.onConnection(state.isWebSocketConnected?'connected':'reconnecting');});
   stopQuery=client.onUpdate(makeFunctionReference<'query'>('replicas:latest'),{channelId:selection.cloudChannelId,readToken:selection.cloudReadToken},value=>{
    if(closed||options.signal.aborted||value===null)return;
    try{
     const r=parseCloudReplica(value);
     if(r.channelId!==selection.cloudChannelId||(selection.deviceId&&r.deviceId!==selection.deviceId))throw Error('Cloud identity mismatch');
     options.onSnapshot({revisionId:r.revisionId,snapshot:r.snapshot,freshnessByGroup:r.freshnessByGroup});
    }catch{options.onConnection('error');finish();}
   },()=>{if(!closed){options.onConnection('unauthorized');finish();}});
  });
 }};
}
