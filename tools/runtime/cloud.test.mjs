import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,chmod,symlink,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {loadRuntime,saveRuntime} from './config.mjs';import {main} from './index.mjs';
const module=await import('./cloud.mjs').catch(()=>({}));
const deviceId='22222222-2222-4222-8222-222222222222';
const fixture=()=>({schemaVersion:1,channelId:'11111111-1111-4111-8111-111111111111',deviceId,endpoint:'https://test-123.convex.site/telemetry/v1/snapshot',publishToken:'a'.repeat(64),expiresAt:Date.now()+3600000});
test('cloud importer refuses shared files, symlinks, wrong device and token in URL',async t=>{
 assert.equal(typeof module.readCloudConfig,'function');const root=await mkdtemp(join(tmpdir(),'cubeos-cloud-config-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const path=join(root,'publish.json');await writeFile(path,JSON.stringify(fixture()),{mode:0o600});assert.equal((await module.readCloudConfig(path,deviceId)).deviceId,deviceId);
 await chmod(path,0o644);await assert.rejects(module.readCloudConfig(path,deviceId));await chmod(path,0o600);
 const link=join(root,'link');await symlink(path,link);await assert.rejects(module.readCloudConfig(link,deviceId));
 await assert.rejects(module.readCloudConfig(path,'33333333-3333-4333-8333-333333333333'));
});
test('runtime enable sends only private stdin and disable preserves device and local data',async t=>{
 const root=await mkdtemp(join(tmpdir(),'cubeos-cloud-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const c=await loadRuntime(root,true);c.images={api:'api:test',web:'web:test',revision:'a'.repeat(40)};
 c.binding={bindingId:c.bindingId,deviceId,sourceId:'33333333-3333-4333-8333-333333333333',protocolDeviceId:'CS01'};await saveRuntime(root,c);
 const file=join(root,'publish.json');await writeFile(file,JSON.stringify(fixture()),{mode:0o600});const calls=[],lines=[];
 const runner=async(command,args,options)=>{calls.push({args,options});if(args.includes('ps'))return{stdout:'api\nweb\ndb'};if(args.includes('prepare-receiver'))return{stdout:JSON.stringify(c.binding)};return{stdout:''};};
 const deps={root,runner,print:s=>lines.push(s),checkTools:async()=>{},checkImages:async()=>{},ready:async()=>{}};
 assert.equal(await main(['cloud-enable','--config',file],deps),0);assert.equal((await loadRuntime(root,false)).cloudEnabled,true);
 const prepare=calls.find(v=>v.args.includes('prepare-relay'));assert.ok(prepare);assert.ok(prepare.options.input.includes('publishToken'));
 assert.ok(!calls.some(v=>v.args.join(' ').includes('a'.repeat(64))));assert.ok(!lines.join(' ').includes('a'.repeat(64)));
 assert.equal(await main(['cloud-disable'],deps),0);assert.equal((await loadRuntime(root,false)).cloudEnabled,false);
 assert.deepEqual((await loadRuntime(root,false)).binding,c.binding);assert.ok(!calls.some(v=>v.args.includes('down')||v.args.includes('-v')));
});
