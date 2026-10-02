import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { APIClient } from "../src/client.ts";

test("construction client sends stable IDs and an exact boolean body; HTTP errors never become demo progress", async () => {
 const d="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", s="11111111-1111-4111-8111-111111111111";
 const calls: {method:string;path:string;body:string;auth:string|undefined}[]=[];
 const server=createServer(async(req,res)=>{
  let body="";for await(const chunk of req)body+=chunk;
  calls.push({method:req.method!,path:req.url!,body,auth:req.headers.authorization});
  res.setHeader("Content-Type","application/json");
  if(req.url?.includes("bbbbbbbb")){res.statusCode=404;res.end('{"error":{"code":"not_found"}}');return;}
  res.end(req.url==="/api/v1/steps" ? "[]" : JSON.stringify({deviceId:d,total:0,completed:0,percentage:0,steps:[]}));
 });
 server.listen(0,"127.0.0.1");await once(server,"listening");
 try{
  const addr=server.address();assert.ok(addr && typeof addr==="object");
  const client=new APIClient("http://127.0.0.1:"+addr.port),signal=new AbortController().signal;
  assert.deepEqual(await client.listSteps("signed",signal),[]);
  assert.equal((await client.getProgress(d,"signed",signal)).percentage,0);
  await client.setStepCompleted(d,s,true,"signed",signal);
  await client.setStepCompleted(d,s,false,"signed",signal);
  assert.deepEqual(calls.map(c=>[c.method,c.path,c.body,c.auth]),[
   ["GET","/api/v1/steps","","Bearer signed"],
   ["GET","/api/v1/devices/"+d+"/progress","","Bearer signed"],
   ["PUT","/api/v1/devices/"+d+"/steps/"+s,'{"completed":true}',"Bearer signed"],
   ["PUT","/api/v1/devices/"+d+"/steps/"+s,'{"completed":false}',"Bearer signed"],
  ]);
  await assert.rejects(client.getProgress("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","signed",signal),{status:404});
  await assert.rejects(async()=>client.setStepCompleted(d,"bad",true,"signed",signal));
 }finally{server.close();await once(server,"close")}
});
