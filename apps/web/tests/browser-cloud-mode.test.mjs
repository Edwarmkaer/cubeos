import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

test('fresh cloud deployment starts with cloud inputs and no local management', {skip:process.env.CUBEOS_CLOUD_MODE_BROWSER!=='1'},async()=>{
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,DEPLOYMENT_MODE:'cloud',NEXT_PUBLIC_CONVEX_URL:'https://adamant-antelope-864.convex.cloud'},stdio:'ignore'});
 let browser;
 try{
  const base=`http://127.0.0.1:${port}`;let ready=false;
  for(let i=0;i<100;i++){try{if((await fetch(base+'/healthz')).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'cloud server did not become ready');
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  await page.goto(base+'/configuracion');
  await page.getByLabel('Clave de consulta',{exact:true}).waitFor({timeout:5000});
  assert.equal(await page.getByLabel('Origen',{exact:true}).inputValue(),'cloud');
  assert.equal(await page.getByLabel('URL de API',{exact:true}).count(),0);
  assert.equal(await page.getByRole('button',{name:'Registrar dispositivo',exact:true}).count(),0);
 }finally{await browser?.close();server.kill('SIGTERM');}
});
