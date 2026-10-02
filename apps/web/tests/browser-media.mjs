import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
let input="";for await(const chunk of process.stdin)input+=chunk;const f=JSON.parse(input);input="";
const root=fileURLToPath(new URL("../",import.meta.url));
const bundle=await build({absWorkingDir:root,entryPoints:["tests/media-browser-fixture.tsx"],bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},alias:{"next/image":fileURLToPath(new URL("./media-test-image.tsx",import.meta.url))}});
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/fixture.js"?"text/javascript":"text/html");res.end(req.url==="/fixture.js"?bundle.outputFiles[0].text:'<!doctype html><html><div id="root"></div><script src="/fixture.js"></script></html>')});
server.listen(3134,"127.0.0.1");await once(server,"listening");let browser;
const original=Buffer.from(f.original,"base64");
try{
 browser=await chromium.launch({headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,acceptDownloads:true});await context.addInitScript(v=>{window.mediaFixture=v},f);
 const page=await context.newPage(),errors=[];page.on("pageerror",e=>errors.push(e.message));
 const request=async(path,token,method="GET",data)=>{const r=await context.request.fetch(f.apiURL+path,{method,headers:{Authorization:"Bearer "+token},...(data&&{data})});assert.ok(r.ok(),"API HTTP "+r.status());return r.json()};
 const a=await request("/api/v1/devices",f.a,"POST",{name:"Media A",protocolDeviceId:"CS01"}),b=await request("/api/v1/devices",f.b,"POST",{name:"Media B",protocolDeviceId:"CS01"});
 // 25 genuine API imports cross the first 24-row page, never demo/NASA fixtures.
 let first;
 for(let i=0;i<25;i++){const r=await context.request.post(`${f.apiURL}/api/v1/devices/${a.id}/photos`,{headers:{Authorization:"Bearer "+f.a},multipart:{file:{name:"camera.png",mimeType:"image/png",buffer:original}}});assert.equal(r.status(),201);first=await r.json();}
 const choose=id=>page.evaluate(id=>window.mediaSelect(id),id);
 await page.goto(f.origin);await page.waitForFunction(()=>typeof window.mediaAccount==="function");await choose(a.id);await page.waitForFunction(()=>window.mediaState().frames.length===24);
 await page.getByRole("region",{name:"Galería de capturas desplazable"}).evaluate(e=>{e.scrollLeft=e.scrollWidth;e.dispatchEvent(new Event("scroll"))});await page.waitForFunction(()=>window.mediaState().frames.length===25);
 const downloads=page.getByRole("button",{name:/Descargar captura original/});assert.equal(await downloads.count(),25);
 // This signed-session fixture has no Tailwind layout; trigger the native DOM
 // button directly. Pointer hit testing and responsive CSS run in media-runtime.
 const [download]=await Promise.all([page.waitForEvent("download"),downloads.first().evaluate(button=>button.click())]);const bytes=await readFile(await download.path());assert.deepEqual(bytes,original);assert.equal(createHash("sha256").update(bytes).digest("hex"),first.sha256);
 const upload=page.getByLabel("Importar fotografía");await upload.setInputFiles({name:"usb-copied.png",mimeType:"image/png",buffer:original});await page.waitForFunction(()=>window.mediaState().status==="ready" && window.mediaState().photos.length===24);assert.equal((await request(`/api/v1/devices/${a.id}/photos?limit=100`,f.a)).items.length,26);
 // Hold a real thumbnail response; switch A -> B, and release A after B is ready.
 let release,seen;const held=new Promise(r=>release=r),requested=new Promise(r=>seen=r);
 const hold=async route=>{const response=await route.fetch();assert.equal(response.status(),200);seen();await held;await route.fulfill({response}).catch(()=>{})};
 await context.route(`${f.apiURL}/api/v1/photos/*/thumbnail`,hold);
 await choose(a.id);await requested;let generation=await page.evaluate(()=>window.mediaGeneration());await page.evaluate(()=>window.mediaAccount("b"));await page.waitForFunction(g=>window.mediaGeneration()>g,generation);await choose(b.id);release();await page.waitForFunction(()=>window.mediaState().status==="ready");assert.equal(await downloads.count(),0);assert.equal((await page.evaluate(()=>window.mediaState().photos)).length,0);
 await context.unroute(`${f.apiURL}/api/v1/photos/*/thumbnail`,hold);
 assert.equal((await context.request.get(`${f.apiURL}/api/v1/photos/${first.id}/original`,{headers:{Authorization:"Bearer "+f.b}})).status(),404);
 // B may upload, but a late original download must not survive logout.
 await upload.setInputFiles({name:"B.png",mimeType:"image/png",buffer:original});await page.waitForFunction(()=>window.mediaState().frames.length===1);
 let releaseOriginal,seenOriginal;const heldOriginal=new Promise(r=>releaseOriginal=r),originalRequested=new Promise(r=>seenOriginal=r);
 const holdOriginal=async route=>{const response=await route.fetch();seenOriginal();await heldOriginal;await route.fulfill({response}).catch(()=>{})};
 await context.route(`${f.apiURL}/api/v1/photos/*/original`,holdOriginal);let downloadAfterLogout=false;page.on("download",()=>downloadAfterLogout=true);await downloads.first().evaluate(button=>button.click());await originalRequested;
 generation=await page.evaluate(()=>window.mediaGeneration());await page.evaluate(()=>window.mediaAccount(null));await page.waitForFunction(g=>window.mediaGeneration()>g,generation);releaseOriginal();await page.waitForTimeout(100);assert.equal(downloadAfterLogout,false);assert.equal(await downloads.count(),0);assert.equal(await page.evaluate(()=>window.mediaState().selected),null);
 assert.deepEqual(errors,[]);console.log("Media signed browser: A/B upload, 24/25 pagination, exact original/SHA, thumbnail account race, original/logout race PASS");
}finally{await browser?.close();server.close();await once(server,"close")}
