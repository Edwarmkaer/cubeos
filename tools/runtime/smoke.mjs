// Creates ONLY a new, disposable temporary installation. Never accepts a student DB.
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,mkdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';
import {loadRuntime,saveRuntime,projectName,runtimeEnv} from './config.mjs';
import {runProcess,runCompose} from './compose.mjs';
import {verifySerialBrowser} from '../../apps/web/tests/browser-serial.mjs';

assert.equal(process.env.CUBEOS_RUNTIME_SMOKE,'1','explicit CUBEOS_RUNTIME_SMOKE=1 required');
const source=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const prepared=await loadRuntime(source,false);
assert.ok(prepared?.images,'prepare images once with local:setup --build before smoke');
const helper=process.env.CUBEOS_SERIAL_HELPER;
assert.ok(helper,'compiled test-only serial helper required');
assert.ok((await stat(helper)).isFile(),'compile the test-only helper first');
const root=await mkdtemp(join(tmpdir(),'cubeos-reader-smoke-'));
console.log('Disposable runtime:',root);
for(const file of ['package.json','.node-version','tools/runtime','tools/dev/local.mjs','infra/docker/compose.runtime.yaml','infra/docker/compose.serial.yaml']){
 await mkdir(join(root,file,'..'),{recursive:true});await cp(join(source,file),join(root,file),{recursive:true});
}
// This fixture intentionally has no JS dependencies. pnpm 11 otherwise attempts
// an unrelated install before running the pure-Node runtime scripts.
// CLI option takes precedence over pnpm defaults and CI/user environment.
// Deliberately hostile env verifies this fixture never installs dependencies.
const env={...process.env,npm_config_verify_deps_before_run:'error'};
async function cli(...args){
 console.log('Check:',args.join(' '));
 try{return await runProcess('pnpm',['--config.verify-deps-before-run=false',...args],{cwd:root,env});}
 catch(e){
  // Disposable fixture only. Redact its generated credential before CI output.
  for(const command of ['pnpm','docker']){const log=await readFile(join(root,`.cubeos/runtime/last-error-${command}.log`),'utf8').catch(()=>'');console.error(log.replaceAll(c.password,'[REDACTED]'));}
  throw e;
 }
}
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
let c=await loadRuntime(root,true);c.images=prepared.images;c.webPort=await freePort();c.apiPort=await freePort();await saveRuntime(root,c);
const web=`http://localhost:${c.webPort}`,api=`http://localhost:${c.apiPort}`;
async function request(path,options={}){
 const r=await fetch(api+path,{signal:AbortSignal.timeout(5000),headers:{Origin:web,...options.headers},...options});
 assert.ok(r.ok,`HTTP ${r.status} on ${path}`);return r;
}
async function json(path){return(await request(path)).json();}
let writer;
async function openPTY(){
 const child=spawn(helper,[],{stdio:['pipe','pipe','inherit']});const lines=createInterface({input:child.stdout});
 const firstLine=once(lines,'line');
 await once(child,'spawn');
 const timeout=delay(5000).then(()=>{throw Error('PTY helper timeout')});
 const [path]=await Promise.race([firstLine,timeout]);lines.close();
 assert.match(path,/^\/dev\/pts\/[0-9]+$/);return {child,path};
}
async function closePTY(){if(writer){const child=writer.child;writer=null;child.stdin.end();if(child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await Promise.race([done,delay(3000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);}}}
async function waitForFrames(deviceId,previousRevision=0,temperature=2465){
 const frames=JSON.parse(await readFile(join(source,'packages/contracts/fixtures/chasqui-v2/uplink-examples-v2.json'),'utf8'));
 for(let n=0;n<40;n++){
  for(const original of frames){const payload={...original,n:original.n+(previousRevision?10000:0)+n*5,u:original.u+(previousRevision?5000:0)+n*1000};if(payload.m==='E')payload.t1=temperature;writer.child.stdin.write(JSON.stringify({envelopeVersion:1,payload})+'\n');}
  const response=await fetch(api+`/api/v1/devices/${deviceId}/snapshot`,{headers:{Origin:web}});
  if(response.status===404){await delay(250);continue;}
  assert.ok(response.ok);const snapshot=await response.json();
  if(Number(snapshot.revision)>previousRevision&&snapshot.snapshot?.sensors?.bme680?.temperatureC===temperature/100)return snapshot;
  await delay(250);
 }
 throw Error('serial fixtures did not reach persisted snapshot');
}
try{
 await cli('local:setup');const before=await readFile(join(root,'.cubeos/runtime/config.json'),'utf8');
 await assert.rejects(stat(join(root,'node_modules')),{code:'ENOENT'});
 await cli('local:setup');assert.equal(await readFile(join(root,'.cubeos/runtime/config.json'),'utf8'),before);
 const occupied=createServer();await new Promise(r=>occupied.listen(c.webPort,'127.0.0.1',r));
 try{await assert.rejects(cli('local:start'));assert.equal((await loadRuntime(root,false)).binding,null);}
 finally{await new Promise(r=>occupied.close(r));}
 await cli('local:start');c=await loadRuntime(root,false);assert.ok(c.binding);
 assert.equal((await fetch(api+`/api/v1/devices/${c.binding.deviceId}/snapshot`,{headers:{Origin:web}})).status,404,'start seeded fake readings');
 writer=await openPTY();
 await cli('local:start','--','--serial',writer.path,'--baud','115200');
 await waitForFrames(c.binding.deviceId);
 assert.equal((await json('/api/v1/devices')).length,1,'duplicate receiver created');
 // The image generator is binary, so read its output separately without UTF-8 conversion.
 const chunks=[];const png=spawn(process.execPath,[join(source,'apps/web/tests/media-test-png.mjs')],{stdio:['ignore','pipe','inherit']});
 png.stdout.on('data',b=>chunks.push(b));assert.deepEqual(await once(png,'exit'),[0,null]);
 const bytes=Buffer.concat(chunks),form=new FormData();form.append('file',new Blob([bytes],{type:'image/png'}),'serial-smoke.png');
 const photo=await(await request(`/api/v1/devices/${c.binding.deviceId}/photos`,{method:'POST',body:form})).json();
 await verifySerialBrowser({web,api,deviceId:c.binding.deviceId,reconnect:async()=>{
  await cli('local:status');
  const revision=Number((await json(`/api/v1/devices/${c.binding.deviceId}/snapshot`)).revision);
  await closePTY();writer=await openPTY();await cli('local:start','--','--serial',writer.path,'--baud','115200');
  await waitForFrames(c.binding.deviceId,revision,2615);
 }});
 await cli('local:stop');await closePTY();
 // Runtime without serial is explicit for a disconnected device. Preserve binding.
 c=await loadRuntime(root,false);c.serial=null;await saveRuntime(root,c);
 await cli('local:start');const restored=await loadRuntime(root,false);assert.deepEqual(restored.binding,c.binding);
 const original=Buffer.from(await(await request(`/api/v1/photos/${photo.id}/original`)).arrayBuffer());assert.deepEqual(original,bytes);
 assert.ok(Number((await json(`/api/v1/devices/${c.binding.deviceId}/snapshot`)).revision)>0);
 await cli('local:stop');await runCompose(c,['down','--remove-orphans']);
 const offlineArgs=['compose','--project-name',projectName(root),'--file',join(root,'infra/docker/compose.runtime.yaml'),'--file',join(source,'infra/docker/compose.offline.yaml')];
 const offline=(...a)=>runProcess('docker',[...offlineArgs,...a],{cwd:root,env:runtimeEnv(c)});
 await offline('up','--wait','--wait-timeout','90','--no-build','--pull','never','-d','db','api','web');
 const net=await runProcess('docker',['network','inspect',projectName(root)+'_local','--format','{{.Internal}}'],{cwd:root,env:runtimeEnv(c)});assert.equal(net.stdout.trim(),'true');
 let offlineSnapshot;
 for(let i=0;i<60;i++){
  try{offlineSnapshot=JSON.parse((await offline('exec','-T','api','wget','-T','2','-q','-O','-',`http://127.0.0.1:${c.apiPort}/api/v1/devices/${c.binding.deviceId}/snapshot`)).stdout);break;}
  catch{await delay(500);}
 }
 assert.ok(Number(offlineSnapshot?.revision)>0,'offline snapshot lost');
 await offline('exec','-T','api','wget','-T','3','-q','-O','/tmp/cubeos-reader-original.png',`http://127.0.0.1:${c.apiPort}/api/v1/photos/${photo.id}/original`);
 const digest=(await offline('exec','-T','api','sha256sum','/tmp/cubeos-reader-original.png')).stdout.split(' ')[0];
 const {createHash}=await import('node:crypto');assert.equal(digest,createHash('sha256').update(bytes).digest('hex'));
 await offline('exec','-T','web','wget','-T','3','-q','-O','/dev/null','http://127.0.0.1:3000/healthz');
 console.log('PASS: repeated setup, real PTY→Go→PostgreSQL→SSE/browser, reconnect and exact photo persistence.');
}finally{
 await closePTY();await cli('local:stop').catch(()=>{});
 // Only this freshly-created test installation: release scarce Docker subnets.
 // No -v: database/photo volumes stay recoverable, production stop is unchanged.
 const own=await loadRuntime(root,false);
 if(own?.images)await runCompose(own,['down','--remove-orphans']).catch(()=>{});
 console.log('Stopped only disposable runtime. Volumes/photos retained:',root);
}
