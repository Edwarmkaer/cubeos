import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { mediaPNG } from "./media-test-png.mjs";

// Actual Next runtime, bundled CSS, private Go API and PostgreSQL. Synthetic
// in-memory camera image is test-only and never mixed with DEMO/NASA assets.
export async function mediaRuntime({page,base,device,evidence}) {
 const original=mediaPNG();
 const upload=async()=>{const body=new FormData();body.append("file",new File([original],"camera-copied.png",{type:"image/png"}));const r=await fetch(`${base}/api/v1/devices/${device.id}/photos`,{method:"POST",body});assert.equal(r.status,201);return r.json()};
 let newest;
 for(let i=0;i<25;i++)newest=await upload();
 await page.getByRole("link",{name:"Configurar fuente",exact:true}).click();await page.getByLabel("Importar fotografía").setInputFiles({name:"usb-copy.png",mimeType:"image/png",buffer:original});await page.getByText("Fotografía importada.",{exact:true}).waitFor();
 await page.getByRole("link",{name:"Visor",exact:true}).first().click();
 const gallery=page.getByRole("region",{name:"Galería de capturas desplazable"});const buttons=gallery.getByRole("button",{name:/Descargar captura original/});await page.waitForFunction(()=>document.querySelectorAll('button[aria-label^="Descargar captura original"]').length===24);
 const style=await gallery.evaluate(e=>({overflow:getComputedStyle(e).overflowX,scroll:e.scrollWidth,width:e.clientWidth,scrollbar:getComputedStyle(e).scrollbarWidth}));assert.equal(style.overflow,"auto");assert.ok(style.scroll>style.width);assert.equal(style.scrollbar,"none");
 await gallery.evaluate(e=>{e.scrollLeft=e.scrollWidth;e.dispatchEvent(new Event("scroll"))});await page.waitForFunction(()=>document.querySelectorAll('button[aria-label^="Descargar captura original"]').length===26);
 assert.equal(await gallery.locator('img[src^="/demo/"]').count(),0);
 assert.equal(await gallery.locator("figcaption").count(),0);
 await buttons.last().scrollIntoViewIfNeeded();const [download]=await Promise.all([page.waitForEvent("download"),buttons.last().click()]);const got=await readFile(await download.path());assert.deepEqual(got,original);assert.equal(createHash("sha256").update(got).digest("hex"),newest.sha256);
 await page.screenshot({path:`${evidence}/media-desktop.png`});
 const dimensions=()=>page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,panels:document.querySelector('[aria-label="Paneles de telemetría"]')?.clientWidth,bento:document.querySelector('.dashboard-bento')?.scrollWidth,overflow:[...document.querySelectorAll('body *')].map(e=>({tag:e.tagName,class:e.getAttribute('class')??'',right:e.getBoundingClientRect().right,left:e.getBoundingClientRect().left,overflow:getComputedStyle(e).overflowX,position:getComputedStyle(e).position,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,scrollLeft:e.scrollLeft})).filter(e=>e.right>innerWidth+1 && (e.position==='absolute'||!e.class.includes('camera'))).slice(0,20)}));
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>innerWidth===390 && document.querySelector('[aria-label="Paneles de telemetría"]')?.clientWidth===366 && getComputedStyle(document.querySelector('.dashboard-bento')).minWidth==='1152px');const before=await dimensions();assert.equal(before.document,before.viewport);await gallery.scrollIntoViewIfNeeded();const after=await dimensions();console.log("Media mobile layout",JSON.stringify({before,after}));assert.equal(after.document,after.viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:`${evidence}/media-mobile.png`});await page.setViewportSize({width:1440,height:900});
 console.log("PASS: actual Next gallery/import, 24/26 pagination, hidden scrollbar, image-only DOM and byte-exact downloaded original desktop/mobile");
}
