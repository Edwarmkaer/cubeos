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

test("one missing thumbnail retains healthy neighbors and cursor across pages",async()=>{
 const device="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
 const photo=(id:string)=>({id,deviceId:device,contentType:"image/png",sizeBytes:4,widthPx:1,heightPx:1,sha256:"0".repeat(64),capturedAt:null,importedAt:"2026-10-02T00:00:00Z",importMethod:"manual",status:"ready",hasThumbnail:true});
 const server=createServer((req,res)=>{
  if(req.url?.endsWith("/thumbnail")){if(req.url.includes(ids[1])){res.writeHead(404);res.end();return}res.setHeader("Content-Type","image/jpeg");res.end(Buffer.from([1,2,3,4]));return}
  const next=req.url?.includes("cursor=next");res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:(next?[ids[3]]:ids.slice(0,3)).map(photo),nextCursor:next?"":"next"}));
 });server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr && typeof addr==="object");const source=createStore(()=>useTelemetryStore.getState());source.setState(s=>({generation:s.generation+1,selection:{mode:"local",apiURL:`http://127.0.0.1:${addr.port}`,deviceId:device,deviceName:"Fixture",offline:true}}));const session=startMedia(source);let urls:string[]=[];
 try{
  for(let i=0;i<100 && useMediaStore.getState().status==="loading";i++)await new Promise(r=>setTimeout(r,10));
  assert.equal(useMediaStore.getState().status,"ready");assert.deepEqual(useMediaStore.getState().frames.map(f=>f.id),[ids[0],ids[2]]);assert.equal(useMediaStore.getState().nextCursor,"next");assert.equal(useMediaStore.getState().photos.length,3);
  await session.more();assert.deepEqual(useMediaStore.getState().frames.map(f=>f.id),[ids[0],ids[2],ids[3]]);assert.equal(useMediaStore.getState().nextCursor,"");urls=useMediaStore.getState().frames.map(f=>f.src);for(const url of urls)assert.equal((await fetch(url)).status,200);
 }finally{session.stop();for(const url of urls)await assert.rejects(fetch(url));server.closeAllConnections();server.close();await once(server,"close")}
});

test("thumbnail authorization or storage failures stay visible and revoke committed and partial URLs",async()=>{
 for(const code of [401,403,500]){
  const device="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333"];
  const photo=(id:string)=>({id,deviceId:device,contentType:"image/png",sizeBytes:4,widthPx:1,heightPx:1,sha256:"0".repeat(64),capturedAt:null,importedAt:"2026-10-02T00:00:00Z",importMethod:"manual",status:"ready",hasThumbnail:true});
  const server=createServer((req,res)=>{if(req.url?.endsWith("/thumbnail")){if(req.url.includes(ids[2])){res.writeHead(code);res.end();return}res.setHeader("Content-Type","image/jpeg");res.end(Buffer.from([1,2,3,4]));return}const next=req.url?.includes("cursor=next");res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:(next?ids.slice(1):ids.slice(0,1)).map(photo),nextCursor:next?"":"next"}));});server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr && typeof addr==="object");const source=createStore(()=>useTelemetryStore.getState());source.setState(s=>({generation:s.generation+1,selection:{mode:"local",apiURL:`http://127.0.0.1:${addr.port}`,deviceId:device,deviceName:"Fixture",offline:true}}));
  const create=URL.createObjectURL,urls:string[]=[];URL.createObjectURL=blob=>{const url=create(blob);urls.push(url);return url};const session=startMedia(source);
  try{
   for(let i=0;i<100 && useMediaStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));assert.equal(useMediaStore.getState().frames.length,1);
   await session.more();assert.equal(useMediaStore.getState().status,"error");assert.ok(useMediaStore.getState().error);assert.deepEqual(useMediaStore.getState().frames,[]);assert.deepEqual(useMediaStore.getState().photos,[]);assert.equal(useMediaStore.getState().nextCursor,"");assert.equal(urls.length,2);for(const url of urls)await assert.rejects(fetch(url));
  }finally{session.stop();URL.createObjectURL=create;server.closeAllConnections();server.close();await once(server,"close")}
 }
});

test("a revoked download aborts a concurrent thumbnail page before late bytes can restore private frames",async()=>{
 const device="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",one="11111111-1111-4111-8111-111111111111",two="22222222-2222-4222-8222-222222222222";
 const photo=(id:string)=>({id,deviceId:device,contentType:"image/png",sizeBytes:4,widthPx:1,heightPx:1,sha256:"0".repeat(64),capturedAt:null,importedAt:"2026-10-02T00:00:00Z",importMethod:"manual",status:"ready",hasThumbnail:true});
 let release!:()=>void,seen!:()=>void;const held=new Promise<void>(r=>release=r),requested=new Promise<void>(r=>seen=r);
 const server=createServer(async(req,res)=>{
  if(req.url?.endsWith("/original")){res.writeHead(401);res.end();return}
  if(req.url?.endsWith("/thumbnail")){res.setHeader("Content-Type","image/jpeg");if(req.url.includes(two)){res.write(Buffer.from([1,2]));seen();await held}res.end(Buffer.from([3,4]));return}
  const next=req.url?.includes("cursor=next");res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:[photo(next?two:one)],nextCursor:next?"":"next"}));
 });server.listen(0,"127.0.0.1");await once(server,"listening");const addr=server.address();assert.ok(addr && typeof addr==="object");const source=createStore(()=>useTelemetryStore.getState());source.setState(s=>({generation:s.generation+1,selection:{mode:"local",apiURL:`http://127.0.0.1:${addr.port}`,deviceId:device,deviceName:"Fixture",offline:true}}));const session=startMedia(source);
 try{
  for(let i=0;i<100 && useMediaStore.getState().status!=="ready";i++)await new Promise(r=>setTimeout(r,10));const old=useMediaStore.getState().frames[0].src;assert.equal((await fetch(old)).status,200);
  const paging=session.more();await requested;await session.download(one);assert.equal(useMediaStore.getState().status,"error");await assert.rejects(fetch(old));release();await paging;
  assert.equal(useMediaStore.getState().status,"error");assert.deepEqual(useMediaStore.getState().frames,[]);assert.deepEqual(useMediaStore.getState().photos,[]);assert.equal(useMediaStore.getState().selected,null);
 }finally{release();session.stop();server.closeAllConnections();server.close();await once(server,"close")}
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
