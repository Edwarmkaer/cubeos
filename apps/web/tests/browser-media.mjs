import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { build } from "esbuild";
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { readFile, unlink } from "node:fs/promises";
import { createHash } from "node:crypto";
let input="";for await(const chunk of process.stdin)input+=chunk;const f=JSON.parse(input);input="";
const root=fileURLToPath(new URL("../",import.meta.url));
const bundle=await build({absWorkingDir:root,entryPoints:["tests/media-browser-fixture.tsx"],bundle:true,write:false,platform:"browser",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},alias:{"next/image":fileURLToPath(new URL("./media-test-image.tsx",import.meta.url))}});
const server=createServer((req,res)=>{res.setHeader("Content-Type",req.url==="/fixture.js"?"text/javascript":"text/html");res.end(req.url==="/fixture.js"?bundle.outputFiles[0].text:'<!doctype html><html><div id="root"></div><script src="/fixture.js"></script></html>')});
server.listen(Number(new URL(f.origin).port),"127.0.0.1");await once(server,"listening");let browser;
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
 // Lose an actual derivative only AFTER list metadata was read, so its cached
 // hasThumbnail=true races the GET. Healthy neighbors/cursor must still commit.
 const lostPath=`${f.apiURL}/api/v1/photos/${first.id}/thumbnail`;let removed=false;
 const lose=async route=>{if(!removed){await unlink(`${f.mediaRoot}/photos/${first.id}/thumbnail`);removed=true}const response=await route.fetch();assert.equal(response.status(),404);await route.fulfill({response})};
 await context.route(lostPath,lose);await choose(a.id);await page.waitForFunction(()=>["ready","error"].includes(window.mediaState().status));
 assert.equal(removed,true);assert.equal(await page.evaluate(()=>window.mediaState().status),"ready");assert.equal(await downloads.count(),23);assert.equal(await page.evaluate(()=>window.mediaState().photos.length),24);assert.ok(await page.evaluate(()=>window.mediaState().nextCursor));
 await page.getByRole("region",{name:"Galería de capturas desplazable"}).evaluate(e=>{e.scrollLeft=e.scrollWidth;e.dispatchEvent(new Event("scroll"))});await page.waitForFunction(()=>window.mediaState().photos.length===25);assert.equal(await downloads.count(),24);
 const listed=(await request(`/api/v1/devices/${a.id}/photos?limit=100`,f.a)).items.find(p=>p.id===first.id);assert.equal(listed.status,"ready");assert.equal(listed.hasThumbnail,false);
 const retained=await context.request.get(`${f.apiURL}/api/v1/photos/${first.id}/original`,{headers:{Authorization:"Bearer "+f.a}});assert.equal(retained.status(),200);assert.deepEqual(await retained.body(),original);assert.equal(createHash("sha256").update(await retained.body()).digest("hex"),first.sha256);
 await context.unroute(lostPath,lose);const repaired=await context.request.post(f.apiURL+"/fixture/media-reconcile",{headers:{Authorization:"Bearer "+f.a}});assert.equal(repaired.status(),204);
 await choose(a.id);await page.waitForFunction(()=>window.mediaState().frames.length===24);const recovered=(await request(`/api/v1/devices/${a.id}/photos?limit=100`,f.a)).items.find(p=>p.id===first.id);assert.equal(recovered.status,"ready");assert.equal(recovered.hasThumbnail,true);assert.equal(recovered.sha256,first.sha256);assert.equal((await context.request.get(lostPath,{headers:{Authorization:"Bearer "+f.a}})).status(),200);
 const upload=page.getByLabel("Importar fotografía");await upload.setInputFiles({name:"usb-copied.png",mimeType:"image/png",buffer:original});await page.getByText("Fotografía importada.",{exact:true}).waitFor();await page.waitForFunction(()=>window.mediaState().status==="ready" && window.mediaState().photos.length===24);assert.equal((await request(`/api/v1/devices/${a.id}/photos?limit=100`,f.a)).items.length,26);
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
 await context.unroute(`${f.apiURL}/api/v1/photos/*/original`,holdOriginal);
 // Real signed session revocation must invalidate already-readable private blobs,
 // not just reject new API bytes. Provider fixture replaces only external Clerk.
 generation=await page.evaluate(()=>window.mediaGeneration());await page.evaluate(()=>window.mediaAccount("a"));await page.waitForFunction(g=>window.mediaGeneration()>g,generation);await choose(a.id);await page.waitForFunction(()=>window.mediaState().frames.length===24);
 const oldURL=await page.evaluate(()=>window.mediaState().frames[0].src);assert.equal(await page.evaluate(async url=>(await fetch(url)).status,oldURL),200);
 const remaining=(await request(`/api/v1/devices/${a.id}/photos?limit=100`,f.a)).items[24];let releaseLate,seenLate,doneLate;const lateHeld=new Promise(r=>releaseLate=r),lateRequested=new Promise(r=>seenLate=r),lateDone=new Promise(r=>doneLate=r);
 const latePath=`${f.apiURL}/api/v1/photos/${remaining.id}/thumbnail`;const lateThumbnail=async route=>{const response=await route.fetch();assert.equal(response.status(),200);seenLate();await lateHeld;await route.fulfill({response}).catch(()=>{});doneLate()};await context.route(latePath,lateThumbnail);
 await page.getByRole("region",{name:"Galería de capturas desplazable"}).evaluate(e=>{e.scrollLeft=e.scrollWidth;e.dispatchEvent(new Event("scroll"))});await lateRequested;
 const revoke=await context.request.post(f.apiURL+"/fixture/media-revoke-session",{headers:{Authorization:"Bearer "+f.a}});assert.equal(revoke.status(),204);
 const [unauthorized]=await Promise.all([page.waitForResponse(r=>r.url().endsWith("/original") && r.status()===401),downloads.first().evaluate(button=>button.click())]);assert.equal(unauthorized.status(),401);await page.waitForFunction(()=>window.mediaState().status==="error");await page.getByRole("alert").waitFor();
 releaseLate();await lateDone;await page.waitForTimeout(100);await context.unroute(latePath,lateThumbnail);
 assert.equal(await page.evaluate(async url=>{try{await fetch(url);return true}catch{return false}},oldURL),false);assert.deepEqual(await page.evaluate(()=>({frames:window.mediaState().frames,photos:window.mediaState().photos,selected:window.mediaState().selected,cursor:window.mediaState().nextCursor})),{frames:[],photos:[],selected:null,cursor:""});
 assert.deepEqual(errors,[]);console.log("Media signed browser: A/B upload, 24/25 pagination, missing derivative keeps healthy neighbors/cursor and repairs without original/SHA change, thumbnail account race, original/logout race, real revoked session401 revokes readable old blobs PASS");
}finally{await browser?.close();server.close();await once(server,"close")}
