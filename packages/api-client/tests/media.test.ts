import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { APIClient } from "../src/client.ts";

// Catches omitted bearer, multipart JSON coercion, wrong device and transformed downloads.
test("media client sends cancellable multipart and returns exact private bytes",async()=>{
 const device="11111111-1111-4111-8111-111111111111",photo="22222222-2222-4222-8222-222222222222";
 const bytes=Buffer.from([0,255,13,10,22]);
 const server=createServer(async(req,res)=>{
  assert.equal(req.headers.authorization,"Bearer fixture.jwt.token");
  if(req.method==="POST") {assert.equal(req.url,`/api/v1/devices/${device}/photos`);assert.match(req.headers["content-type"]??"",/^multipart\/form-data; boundary=/);const body:Buffer[]=[];for await(const b of req)body.push(b);const text=Buffer.concat(body).toString("latin1");assert.match(text,/name="file"/);assert.ok(Buffer.concat(body).includes(bytes));res.setHeader("Content-Type","application/json");res.end(JSON.stringify({id:photo,deviceId:device,status:"ready"}));}
  else if(req.url?.includes("/photos?")){assert.equal(req.url,`/api/v1/devices/${device}/photos?limit=24&cursor=opaque`);res.setHeader("Content-Type","application/json");res.end(JSON.stringify({items:[],nextCursor:""}));}
  else {assert.equal(req.url,`/api/v1/photos/${photo}/original`);res.setHeader("Content-Type","image/png");res.end(bytes);}
 });server.listen(0,"127.0.0.1");await once(server,"listening");const address=server.address();assert.ok(address && typeof address==="object");const client=new APIClient(`http://127.0.0.1:${address.port}`),signal=new AbortController().signal;
 try {
  assert.equal((await client.uploadPhoto(device,new File([bytes],"camera.png",{type:"image/png"}),null,"fixture.jwt.token",signal)).id,photo);
  assert.deepEqual(await client.listPhotos(device,{limit:24,cursor:"opaque"},"fixture.jwt.token",signal),{items:[],nextCursor:""});
  assert.deepEqual(Buffer.from(await (await client.photoBlob(photo,"original","fixture.jwt.token",signal)).arrayBuffer()),bytes);
  const cancel=new AbortController();cancel.abort();await assert.rejects(client.photoBlob(photo,"original","fixture.jwt.token",cancel.signal));
 }finally{server.closeAllConnections();server.close();await once(server,"close")}
});
