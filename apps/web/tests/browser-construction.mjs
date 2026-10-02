import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
let input="";for await(const chunk of process.stdin)input+=chunk;const f=JSON.parse(input);input="";
const root=fileURLToPath(new URL("../",import.meta.url));
const bundle=await build({absWorkingDir:root,entryPoints:["tests/construction-browser-fixture.tsx"],bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'}});
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/fixture.js"?"text/javascript":"text/html");res.end(req.url==="/fixture.js"?bundle.outputFiles[0].text:'<!doctype html><html><div id="root"></div><script src="/fixture.js"></script></html>')});
server.listen(Number(new URL(f.origin).port),"127.0.0.1");await once(server,"listening");let browser;
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true});await context.addInitScript(v=>{window.constructionFixture=v},f);
 const page=await context.newPage();const errors=[];page.on("pageerror",e=>{errors.push(e.message);console.error("Fixture page error:",e.message)});
 const request=async(path,token,method="GET",data)=>{const r=await context.request.fetch(f.apiURL+path,{method,headers:{Authorization:"Bearer "+token},...(data&&{data})});assert.ok(r.ok(),"API HTTP "+r.status());return r.json()};
 const a=await request("/api/v1/devices",f.a,"POST",{name:"Test construction A",protocolDeviceId:"CS01"});
 const second=await request("/api/v1/devices",f.a,"POST",{name:"Test construction second",protocolDeviceId:"CS01"});
 const b=await request("/api/v1/devices",f.b,"POST",{name:"Test construction B",protocolDeviceId:"CS01"});
 const choose=id=>page.evaluate(id=>window.constructionSelect(id),id);
 await page.goto(f.origin);await page.waitForFunction(()=>typeof window.constructionAccount==="function");
 await choose(a.id);const mark=page.getByRole("checkbox",{name:"Completar Fixture one",exact:true});await mark.waitFor({timeout:5000});
 assert.equal(await mark.isChecked(),false);await mark.click();await page.getByText("1 / 2 pasos · 50%").waitFor();assert.equal(await mark.isChecked(),true);
 await page.reload();await page.waitForFunction(()=>typeof window.constructionAccount==="function");await choose(a.id);await mark.waitFor();assert.equal(await mark.isChecked(),true);
 await choose(second.id);await mark.waitFor();await page.waitForFunction(()=>document.querySelector('input[type="checkbox"]')?.checked===false);
 await choose(a.id);await page.waitForFunction(()=>document.querySelector('input[type="checkbox"]')?.checked===true);
 // Hold real successful A write, then switch account and device.
 let release,seen;const held=new Promise(r=>{release=r}),written=new Promise(r=>{seen=r});
 const hold=async route=>{if(route.request().method()!=="PUT")return route.continue();const response=await route.fetch();assert.equal(response.status(),200);seen();await held;await route.fulfill({response}).catch(()=>{})};
 await context.route(f.apiURL+"/api/v1/devices/"+a.id+"/steps/*",hold);await mark.click();await written;
 let generation=await page.evaluate(()=>window.constructionGeneration());await page.evaluate(()=>window.constructionAccount("b"));await page.waitForFunction(g=>window.constructionGeneration()>g,generation);
 assert.equal(await page.getByRole("checkbox").count(),0);await choose(b.id);release();await mark.waitFor();assert.equal(await mark.isChecked(),false);await context.unroute(f.apiURL+"/api/v1/devices/"+a.id+"/steps/*",hold);
 // Hold real A progress read. No A result may replace B's progress.
 generation=await page.evaluate(()=>window.constructionGeneration());await page.evaluate(()=>window.constructionAccount("a"));await page.waitForFunction(g=>window.constructionGeneration()>g,generation);
 let releaseGet,seenGet;const heldGet=new Promise(r=>{releaseGet=r}),read=new Promise(r=>{seenGet=r});
 const holdGet=async route=>{const response=await route.fetch();seenGet();await heldGet;await route.fulfill({response}).catch(()=>{})};
 await context.route(f.apiURL+"/api/v1/devices/"+a.id+"/progress",holdGet);await choose(a.id);await read;
 generation=await page.evaluate(()=>window.constructionGeneration());await page.evaluate(()=>window.constructionAccount("b"));await page.waitForFunction(g=>window.constructionGeneration()>g,generation);await choose(b.id);releaseGet();await mark.waitFor();assert.equal(await mark.isChecked(),false);
 assert.equal((await context.request.get(f.apiURL+"/api/v1/devices/"+a.id+"/progress",{headers:{Authorization:"Bearer "+f.b}})).status(),404);
 await mark.click();await page.getByText("1 / 2 pasos · 50%").waitFor();await mark.click();await page.getByText("0 / 2 pasos · 0%").waitFor();
 generation=await page.evaluate(()=>window.constructionGeneration());await page.evaluate(()=>window.constructionAccount(null));await page.waitForFunction(g=>window.constructionGeneration()>g,generation);assert.equal(await page.getByRole("checkbox").count(),0);
 assert.deepEqual(errors,[]);console.log("Construction browser: signed A/B, saved reload, two devices, late GET/PUT and logout PASS");
}finally{await browser?.close();server.close();await once(server,"close")}
