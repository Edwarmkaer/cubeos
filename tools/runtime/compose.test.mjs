import {test} from 'node:test';
import assert from 'node:assert/strict';
const api=await import('./compose.mjs').catch(()=>({}));
test('Compose targets a private project and uses argv/stdin rather than shell or secret arguments',async()=>{
 assert.equal(typeof api.runCompose,'function','Compose runtime adapter missing');
 const c={root:'/tmp/cubeos unit',password:'a'.repeat(48),webPort:3000,apiPort:8080,images:{api:'cubeos-reader-api:local',web:'cubeos-reader-web:local',revision:'a'.repeat(40)}};
 let invocation;
 const result=await api.runCompose(c,['run','--rm','-T','--no-deps','migrate','prepare-receiver'],{input:'{"bindingId":"id"}',runner:async(command,args,opts)=>{invocation={command,args,opts};return {stdout:'{"deviceId":"test"}'};}});
 assert.equal(result.stdout,'{"deviceId":"test"}');
 assert.equal(invocation.command,'docker');
 assert.match(invocation.args[2],/^cubeos-runtime-[a-f0-9]{12}$/);
 assert.equal(invocation.opts.input,'{"bindingId":"id"}');
 assert.equal(invocation.opts.env.POSTGRES_PASSWORD,c.password);
 assert.ok(!invocation.args.join(' ').includes(c.password));
 assert.equal(invocation.opts.cwd,c.root);
});
test('Docker failures do not echo captured output containing credentials',async()=>{
 assert.equal(typeof api.runCompose,'function');
 const c={root:'/tmp/reader',password:'a'.repeat(48),apiPort:8080,webPort:3000,images:null};
 await assert.rejects(api.runCompose(c,['ps'],{runner:async()=>{throw Error('private database password');}}),e=>!e.message.includes('private database password'));
});
