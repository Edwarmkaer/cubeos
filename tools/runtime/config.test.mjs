import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,stat,chmod,symlink,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const api=await import('./config.mjs').catch(()=>({}));
async function temp(t){const root=await mkdtemp(join(tmpdir(),'cubeos-runtime-test-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}
test('private setup is repeatable and absent inspection makes no files',async t=>{
 assert.equal(typeof api.loadRuntime,'function','runtime config missing');
 const root=await temp(t);
 assert.equal(await api.loadRuntime(root,false),null);
 await assert.rejects(stat(join(root,'.cubeos')));
 const first=await api.loadRuntime(root,true),second=await api.loadRuntime(root,true);
 assert.deepEqual(second,first);assert.match(first.password,/^[a-f0-9]{48}$/);
 assert.match(first.bindingId,/^[a-f0-9-]{36}$/);
 assert.equal((await stat(join(root,'.cubeos/runtime/config.json'))).mode&0o777,0o600);
 assert.equal(first.apiPort,8080);assert.equal(first.webPort,3000);
});
test('unsafe or copied configuration is rejected without replacement',async t=>{
 assert.equal(typeof api.loadRuntime,'function');
 const root=await temp(t);await api.loadRuntime(root,true);
 const file=join(root,'.cubeos/runtime/config.json'),original=await readFile(file,'utf8');
 for(const changes of [{unknown:true},{apiPort:0},{password:'short'},{root:'/tmp/other-installation'},{images:{api:'evil;echo unsafe',web:'bad'}}]){
  const raw=JSON.stringify({...JSON.parse(original),...changes});await writeFile(file,raw);
  await assert.rejects(api.loadRuntime(root,false));assert.equal(await readFile(file,'utf8'),raw);
 }
 await writeFile(file,original);await chmod(file,0o644);await assert.rejects(api.loadRuntime(root,false),/privad|0600/);
 await chmod(file,0o600);
 const other=join(root,'elsewhere');await writeFile(other,original);await rm(file);await symlink(other,file);
 await assert.rejects(api.loadRuntime(root,false),/simb|symlink/);
});
test('serial requires an explicit TTY and validates baud and duplicate arguments',async t=>{
 assert.equal(typeof api.parseStartArgs,'function');
 assert.deepEqual(api.parseStartArgs([]),{serialPath:null,baud:115200});
 assert.deepEqual(api.parseStartArgs(['--serial','/dev/ttyACM0','--baud','57600']),{serialPath:'/dev/ttyACM0',baud:57600});
 for(const args of [['--baud','0'],['--serial'],['--oops'],['--serial','/dev/ttyACM0','--serial','/dev/ttyACM1'],['--serial','/dev/ttyACM0','--baud','1e5'],['--baud','115200']])assert.throws(()=>api.parseStartArgs(args));
 const root=await temp(t);const plain=join(root,'fake');await writeFile(plain,'');
 await assert.rejects(api.inspectSerial(plain));
 await assert.rejects(api.inspectSerial('/dev/ttyACM_DOES_NOT_EXIST'));
 await assert.rejects(api.inspectSerial('/dev/null'));
});
test('different roots do not share projects and exported cloud values cannot alter local runtime',async t=>{
 assert.equal(typeof api.runtimeEnv,'function');
 const root=await temp(t),c=await api.loadRuntime(root,true);
 assert.notEqual(api.projectName(root),api.projectName(root+'/copy'));
 const e=api.runtimeEnv(c,{MEDIA_STORAGE:'s3',DEPLOYMENT_MODE:'public',AUTH_MODE:'clerk',SERIAL_PORT:'/dev/bad',CLERK_SECRET_KEY:'DO-NOT-LEAK',COMPOSE_FILE:'other.yml',DOCKER_HOST:'tcp://untrusted:2375',PATH:process.env.PATH});
 assert.equal(e.DEPLOYMENT_MODE,'local');assert.equal(e.AUTH_MODE,'local');
 assert.equal(e.MEDIA_STORAGE,'local');assert.equal(e.SERIAL_PORT,'');
 assert.equal(e.CLERK_SECRET_KEY,undefined);assert.equal(e.COMPOSE_FILE,undefined);assert.equal(e.DOCKER_HOST,undefined);
 assert.equal(e.POSTGRES_PASSWORD,c.password);
});
test('active lock prevents a second operation and is released after errors',async t=>{
 const root=await temp(t);await api.loadRuntime(root,true);
 let release;const wait=new Promise(r=>release=r);
 const first=api.withRuntimeLock(root,()=>wait);
 // Await the actual lock creation rather than guessing disk timing.
 for(let i=0;i<100;i++){try{await stat(join(root,'.cubeos/runtime/operation.lock'));break;}catch{await new Promise(r=>setTimeout(r,5));}}
 await assert.rejects(api.withRuntimeLock(root,async()=>{}),/operación/);
 release();await first;
 await assert.rejects(api.withRuntimeLock(root,async()=>{throw Error('failure');}),/failure/);
 await api.withRuntimeLock(root,async()=>{});
});
