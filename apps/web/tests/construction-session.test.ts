import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { createStore } from "zustand/vanilla";
import { startConstruction, useConstructionStore } from "../src/lib/construction-store.ts";
import { useTelemetryStore } from "../src/lib/telemetry-store.ts";
import { setPublicTokenGetter } from "../src/lib/telemetry-source.ts";

test("switching devices discards in-flight progress and saves; a delayed previous identity token starts no request",async()=>{
 let release!:()=>void,seen!:()=>void;
 let hold=new Promise<void>(r=>{release=r}),requested=new Promise<void>(r=>{seen=r});
 let requests=0;
 const d1="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",d2="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",step="11111111-1111-4111-8111-111111111111";
 const server=createServer(async(req,res)=>{
  requests++; if(req.url?.includes(d1)){seen();await hold}
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({deviceId:req.url?.includes(d1)?d1:d2,total:1,completed:0,percentage:0,steps:[{id:step,title:"Fixture",instructions:"Test",displayOrder:1,completed:false,completedAt:null}]}));
 });server.listen(0,"127.0.0.1");await once(server,"listening");
 const addr=server.address();assert.ok(addr && typeof addr==="object");
 const base="http://127.0.0.1:"+addr.port;
 const store=createStore(()=>useTelemetryStore.getState());
 const select=(deviceId:string,mode:"local"|"public"="local")=>store.setState(s=>({generation:s.generation+1,selection:{mode,apiURL:base,deviceId,deviceName:"Fixture",offline:true}}));
 let session:ReturnType<typeof startConstruction>|undefined;
 try{
  select(d1);session=startConstruction(store);await requested;select(d2);
  assert.equal(useConstructionStore.getState().progress,null);release();
  for(let i=0;i<100 && useConstructionStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(useConstructionStore.getState().progress?.deviceId,d2);
  hold=new Promise(r=>{release=r});requested=new Promise(r=>{seen=r});
  select(d1);release();
  for(let i=0;i<100 && useConstructionStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));
  hold=new Promise(r=>{release=r});requested=new Promise(r=>{seen=r});
  const saving=session.save(step,true);await requested;select(d2);release();await saving;
  for(let i=0;i<100 && useConstructionStore.getState().progress?.deviceId!==d2;i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(useConstructionStore.getState().progress?.deviceId,d2);
  session.stop();let tokenRelease!:()=>void;const tokenHold=new Promise<void>(r=>{tokenRelease=r});
  setPublicTokenGetter(async()=>{await tokenHold;return "old"});
  select(d1,"public");session=startConstruction(store);
  const before=requests;select("");setPublicTokenGetter(()=>"new");tokenRelease();
  await new Promise(r=>setTimeout(r,30));assert.equal(requests,before);
  assert.equal(useConstructionStore.getState().progress,null);
 }finally{release();session?.stop();setPublicTokenGetter(null);server.closeAllConnections();server.close();await once(server,"close")}
});
