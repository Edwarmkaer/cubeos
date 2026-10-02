import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createStore } from "zustand/vanilla";
import { useTelemetryStore } from "../src/lib/telemetry-store.ts";
import { startMedia, useMediaStore } from "../src/lib/media-store.ts";
import { setPublicTokenGetter } from "../src/lib/telemetry-source.ts";

test("media device/account/logout changes discard lists, bytes and delayed tokens",async()=>{
 const d1="11111111-1111-4111-8111-111111111111",d2="22222222-2222-4222-8222-222222222222";
 let release!:()=>void,seen!:()=>void;const hold=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>seen=r);let requests=0;
 const server=createServer(async(req,res)=>{requests++;const isA=req.url?.includes(d1);if(isA){seen();await hold}res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:[],nextCursor:""}));});server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();assert.ok(address && typeof address==="object");const base=`http://127.0.0.1:${address.port}`;
 const source=createStore(()=>useTelemetryStore.getState());const select=(deviceId:string,mode:"local"|"public"="local")=>source.setState(s=>({generation:s.generation+1,selection:{mode,apiURL:base,deviceId,deviceName:"Fixture",offline:true}}));let session:ReturnType<typeof startMedia>|undefined;
 try{
  select(d1);session=startMedia(source);await requested;select(d2);assert.deepEqual(useMediaStore.getState().frames,[]);release();
  for(let i=0;i<100 && useMediaStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));assert.equal(useMediaStore.getState().generation,source.getState().generation);
  session.stop();let tokenRelease!:()=>void;const tokenHold=new Promise<void>(r=>tokenRelease=r);setPublicTokenGetter(async()=>{await tokenHold;return "old.jwt.token"});select(d1,"public");session=startMedia(source);const before=requests;select("");setPublicTokenGetter(()=>"new.jwt.token");tokenRelease();await new Promise(r=>setTimeout(r,30));assert.equal(requests,before);assert.deepEqual(useMediaStore.getState().photos,[]);assert.equal(useMediaStore.getState().selected,null);
 }finally{release();session?.stop();setPublicTokenGetter(null);server.closeAllConnections();server.close();await once(server,"close")}
});

// Exercises genuine binary HTTP bodies and revocable URLs, not an already-empty list.
test("private thumbnail URLs are revoked and a late byte body cannot repopulate the next device",async()=>{
 const a="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",b="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",photo="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
 let holdBytes=false,release!:()=>void,seen!:()=>void;
 const held=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>seen=r);
 const server=createServer(async(req,res)=>{
  if(req.url?.includes("/thumbnail")){res.setHeader("Content-Type","image/png");if(holdBytes){res.writeHead(200);res.write(Uint8Array.of(137,80));seen();await held}res.end(Uint8Array.of(78,71));return}
  res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:req.url?.includes(a)?[{id:photo,deviceId:a,status:"ready",hasThumbnail:true}]:[],nextCursor:""}));
 });server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr && typeof addr==="object");const base=`http://127.0.0.1:${addr.port}`;
 const source=createStore(()=>useTelemetryStore.getState());const select=(deviceId:string)=>source.setState(s=>({generation:s.generation+1,selection:{mode:"local",apiURL:base,deviceId,deviceName:"Fixture",offline:true}}));
 select(a);const session=startMedia(source);
 try {
  for(let i=0;i<100 && useMediaStore.getState().frames.length!==1;i++)await new Promise(r=>setTimeout(r,10));const url=useMediaStore.getState().frames[0]?.src;assert.ok(url);assert.equal((await fetch(url)).status,200);
  select(b);assert.deepEqual(useMediaStore.getState().frames,[]);assert.deepEqual(useMediaStore.getState().photos,[]);await assert.rejects(fetch(url));
  holdBytes=true;select(a);await requested;select(b);release();
  for(let i=0;i<100 && useMediaStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));assert.deepEqual(useMediaStore.getState().frames,[]);assert.deepEqual(useMediaStore.getState().photos,[]);
  select("");assert.equal(useMediaStore.getState().selected,null);
 }finally{release();session.stop();server.closeAllConnections();server.close();await once(server,"close")}
});
