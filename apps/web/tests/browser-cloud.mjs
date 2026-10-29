import assert from 'node:assert/strict';
import {chromium} from 'playwright';
export async function verifyCloudBrowser({web,access,directory,advance,revoke}){
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(web+'/configuracion');await page.getByLabel('Origen',{exact:true}).selectOption('cloud');
  await page.getByLabel('URL de Convex',{exact:true}).fill(access.convexURL);
  await page.getByLabel('Canal de la práctica',{exact:true}).fill(access.channelId);
  await page.getByLabel('Clave de consulta',{exact:true}).fill(access.readToken);
  await page.getByRole('button',{name:'Conectar canal',exact:true}).click();
  await page.getByRole('link',{name:'Visor',exact:true}).first().click();
  await page.getByText('26.15',{exact:false}).first().waitFor({timeout:30000});
  assert.equal(await page.locator('img[src*="demo/camera"]').count(),0);
  await advance(async value=>{await page.getByText(value,{exact:false}).first().waitFor({timeout:30000});});
  await page.screenshot({path:directory+'/cloud-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByText('28.55',{exact:false}).first().waitFor({timeout:10000});
  await page.screenshot({path:directory+'/cloud-mobile.png'});
  assert.deepEqual(errors,[]);
  await revoke();await page.getByText('Sin autorización',{exact:false}).first().waitFor({timeout:20000});
  assert.equal(await page.getByText('28.55',{exact:false}).count(),0,'revocation retained private readings');
 }catch{throw Error('Cloud browser acceptance failed; inspect private screenshots and scoped service logs.');}
 finally{await browser.close();}
}
