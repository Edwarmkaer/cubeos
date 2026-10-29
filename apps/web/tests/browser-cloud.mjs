import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFile,lstat} from 'node:fs/promises';
export async function verifyCloudBrowser({web,access,directory,advance,revoke,requireCloudMode=false}){
 const browser=await chromium.launch({headless:true});
 let stage='browser';
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  if(requireCloudMode&&process.env.CUBEOS_VERCEL_ACCESS_FILE){
   stage='preview access';
   const file=process.env.CUBEOS_VERCEL_ACCESS_FILE,info=await lstat(file);
   assert.ok(info.isFile()&&!info.isSymbolicLink()&&(info.mode&0o777)===0o600,'private Vercel access file required');
   const {url}=JSON.parse(await readFile(file,'utf8')),u=new URL(url);
   assert.equal(u.origin,web);assert.ok(u.searchParams.has('_vercel_share'));assert.deepEqual([...u.searchParams.keys()],['_vercel_share']);
   await page.goto(url);
  }
  stage='cloud health';if(requireCloudMode){const health=await page.request.get(web+'/healthz');assert.equal(health.status(),200);assert.equal((await health.json()).mode,'cloud');}
  stage='configuration';
  await page.goto(web+'/configuracion');await page.getByLabel('Origen',{exact:true}).selectOption('cloud');
  await page.getByLabel('URL de Convex',{exact:true}).fill(access.convexURL);
  await page.getByLabel('Canal de la práctica',{exact:true}).fill(access.channelId);
  await page.getByLabel('Clave de consulta',{exact:true}).fill(access.readToken);
  await page.getByRole('button',{name:'Conectar canal',exact:true}).click();
  await page.getByRole('link',{name:'Visor',exact:true}).first().click();
  stage='initial snapshot';
  await page.getByText('26.15',{exact:false}).first().waitFor({timeout:30000});
  assert.equal(await page.locator('img[src*="demo/camera"]').count(),0);
  stage='fresh snapshot and network recovery';await advance(async value=>{await page.getByText(value,{exact:false}).first().waitFor({timeout:30000});});
  await page.screenshot({path:directory+'/cloud-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByText('28.55',{exact:false}).first().waitFor({timeout:10000});
  await page.screenshot({path:directory+'/cloud-mobile.png'});
  assert.deepEqual(errors,[]);
  stage='revocation';await revoke();await page.getByText('Sin autorización',{exact:false}).first().waitFor({timeout:20000});
  assert.equal(await page.getByText('28.55',{exact:false}).count(),0,'revocation retained private readings');
 }catch{throw Error('Cloud browser acceptance failed at '+stage+'; inspect private screenshots and scoped service logs.');}
 finally{await browser.close();}
}
