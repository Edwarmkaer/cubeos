import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const api=await import('./index.mjs').catch(()=>({}));
test('missing status/stop is harmless and unknown commands cannot create configuration',async t=>{
 assert.equal(typeof api.main,'function','runtime entrypoint missing');
 const root=await mkdtemp(join(tmpdir(),'reader-cli-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const lines=[];const deps={root,print:s=>lines.push(s)};
 assert.equal(await api.main(['status'],deps),0);
 assert.equal(await api.main(['stop'],deps),0);
 assert.equal(await api.main(['unknown'],deps),2);
 await assert.rejects(stat(join(root,'.cubeos')));
});
test('setup prepares images and migrations once; start does not rebuild or lose its binding',async t=>{
 assert.equal(typeof api.main,'function');
 const root=await mkdtemp(join(tmpdir(),'reader-lifecycle-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const calls=[];const lines=[];let running=false;
 const runner=async(command,args,opts)=>{
  calls.push({command,args});
  if(command==='git')return {stdout:'a'.repeat(40)};
  if(command==='docker'&&args[0]==='inspect')return {stdout:'[]'};
  if(args.includes('prepare-receiver')){const request=JSON.parse(opts.input);return {stdout:JSON.stringify({bindingId:request.bindingId,deviceId:'11111111-1111-4111-8111-111111111111',sourceId:'22222222-2222-4222-8222-222222222222',protocolDeviceId:'CS01'})};}
  if(args.includes('ps'))return {stdout:running?'api\nweb\ndb':''};
  if(args.includes('up')&&args.includes('api'))running=true;
  if(args.includes('stop'))running=false;
  return {stdout:''};
 };
 const deps={root,runner,print:s=>lines.push(s),checkTools:async()=>{},checkImages:async()=>{},assertPorts:async()=>{},ready:async()=>{}};
 assert.equal(await api.main(['setup','--build'],deps),0);
 const initial=await readFile(join(root,'.cubeos/runtime/config.json'),'utf8');
 assert.equal(await api.main(['setup'],deps),0);
 assert.equal(await readFile(join(root,'.cubeos/runtime/config.json'),'utf8'),initial);
 calls.length=0;
 assert.equal(await api.main(['start'],deps),0);
 const a=JSON.parse(await readFile(join(root,'.cubeos/runtime/config.json'),'utf8'));
 assert.ok(a.binding?.sourceId);
 assert.equal(await api.main(['start'],deps),0);
 assert.equal(JSON.parse(await readFile(join(root,'.cubeos/runtime/config.json'),'utf8')).binding.sourceId,a.binding.sourceId);
 assert.ok(!calls.some(c=>c.args.includes('build')||c.args.includes('pull')));
 assert.ok(calls.filter(c=>c.args.includes('up')&&c.args.includes('api')).every(c=>c.args.includes('--no-build')&&c.args.includes('never')));
 assert.ok(!lines.join('\n').includes(a.password));
 assert.equal(await api.main(['stop'],deps),0);
 assert.ok(!calls.some(c=>c.args.includes('down')||c.args.includes('-v')||c.args.includes('prune')));
});
test('partially failed start stops only newly requested services and preserves the binding',async t=>{
 assert.equal(typeof api.main,'function');
 const {loadRuntime,saveRuntime}=await import('./config.mjs');
 const root=await mkdtemp(join(tmpdir(),'reader-failure-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const c=await loadRuntime(root,true);c.images={api:'reader-api:test',web:'reader-web:test',revision:'a'.repeat(40)};await saveRuntime(root,c);
 const calls=[];
 const runner=async(command,args,opts)=>{
  calls.push(args);
  if(args.includes('ps'))return{stdout:'db'};
  if(args.includes('prepare-receiver'))return{stdout:JSON.stringify({bindingId:c.bindingId,deviceId:'11111111-1111-4111-8111-111111111111',sourceId:'22222222-2222-4222-8222-222222222222',protocolDeviceId:'CS01'})};
  if(args.includes('up')&&args.includes('api'))throw Error('partial Docker failure');
  return{stdout:''};
 };
 assert.equal(await api.main(['start'],{root,runner,print:()=>{},checkTools:async()=>{},checkImages:async()=>{},assertPorts:async()=>{}}),1);
 const stops=calls.filter(a=>a.includes('stop'));
 assert.equal(stops.length,1);assert.ok(stops[0].includes('api'));assert.ok(stops[0].includes('web'));assert.ok(!stops[0].includes('db'));
 assert.ok((await loadRuntime(root,false)).binding);
});
test('doctor reports missing Docker and absent serial without creating devices or starting services',async t=>{
 const {loadRuntime,saveRuntime}=await import('./config.mjs');
 const root=await mkdtemp(join(tmpdir(),'reader-doctor-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const c=await loadRuntime(root,true);c.serial={path:'/dev/ttyACM_DOES_NOT_EXIST',baud:115200};await saveRuntime(root,c);
 const lines=[];let calls=0;
 assert.equal(await api.main(['doctor'],{root,print:s=>lines.push(s),checkTools:async()=>{throw Error('Docker no disponible');},runner:async()=>{calls++;throw Error('must not start');}}),1);
 const report=JSON.parse(lines.at(-1));
 assert.equal(report.ready,false);
 assert.ok(report.checks.some(v=>v.name==='serial'&&v.state==='error'));
 assert.ok(report.checks.some(v=>v.name==='herramientas'&&v.state==='error'));
 assert.equal(calls,0);assert.equal((await loadRuntime(root,false)).binding,null);
});
test('status treats an owned device without its first snapshot as waiting, not an API failure',async t=>{
 const {loadRuntime,saveRuntime}=await import('./config.mjs');
 const root=await mkdtemp(join(tmpdir(),'reader-status-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const c=await loadRuntime(root,true);c.images={api:'reader-api:test',web:'reader-web:test',revision:'a'.repeat(40)};
 c.binding={bindingId:c.bindingId,deviceId:'11111111-1111-4111-8111-111111111111',sourceId:'22222222-2222-4222-8222-222222222222',protocolDeviceId:'CS01'};await saveRuntime(root,c);
 t.mock.method(globalThis,'fetch',async()=>({ok:false,status:404}));
 const lines=[];
 assert.equal(await api.main(['status'],{root,print:s=>lines.push(s),runner:async()=>({stdout:'api\nweb\ndb'})}),0);
 assert.match(lines.join('\n'),/Esperando primera muestra/);
});
