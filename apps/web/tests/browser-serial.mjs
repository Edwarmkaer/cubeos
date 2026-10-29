import assert from 'node:assert/strict';
import {chromium} from 'playwright';

export async function verifySerialBrowser({web,api,deviceId}){
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const external=[],errors=[];
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(!['localhost','127.0.0.1'].includes(url.hostname)){external.push(url.origin);return route.abort();}return route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(web+'/configuracion');
  await page.getByLabel('URL de API').fill(api);
  await page.getByRole('button',{name:'Consultar dispositivos'}).click();
  await page.getByLabel('Dispositivo',{exact:true}).selectOption(deviceId);
  await page.getByRole('link',{name:'Visor',exact:true}).first().click();
  // 2465 centi-degrees in the supplied serial E fixture becomes 24.65 Celsius.
  await page.getByText('24.65',{exact:false}).first().waitFor({timeout:20000});
  const text=await page.locator('main').innerText();
  assert.doesNotMatch(text,/Roll|Pitch|Yaw|7\.62/);
  assert.equal(await page.locator('img[src*="demo/camera"]').count(),0);
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
  // Age advances without another reception; no fake heartbeat refresh.
  await page.getByText('Antigua',{exact:false}).first().waitFor({timeout:20000});
  await context.close();
 }finally{await browser.close();}
}
