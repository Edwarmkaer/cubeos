import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {loadRuntime,saveRuntime,parseStartArgs,inspectSerial,projectName,runtimeEnv,withRuntimeLock,lockStatus,recoverRuntimeLock} from './config.mjs';
import {runProcess,runCompose} from './compose.mjs';
import {assertPortFree} from '../dev/local.mjs';

const defaultRoot=resolve(fileURLToPath(new URL('../..',import.meta.url)));
const actions=['setup','start','status','stop','doctor'];
async function checkTools(root,runner){
 if(process.platform!=='linux')throw Error('Este runtime inicial requiere Linux.');
 const expected=(await readFile(join(root,'.node-version'),'utf8')).trim().replace(/^v/,'');
 if(process.versions.node!==expected)throw Error(`Usa Node.js ${expected} según .node-version.`);
 const expectedPnpm=JSON.parse(await readFile(join(root,'package.json'),'utf8')).packageManager.split('@')[1];
 const env=runtimeEnv({password:'',webPort:3000,apiPort:8080,images:null});
 if((await runner('pnpm',['--version'],{cwd:root,env})).stdout.trim()!==expectedPnpm)throw Error(`Usa pnpm ${expectedPnpm}.`);
 await runner('docker',['compose','version'],{cwd:root,env});
 await runner('docker',['info','--format','{{.ServerVersion}}'],{cwd:root,env});
}
async function checkImages(c,runner){
 const pinned={...c.images};
 for(const part of ['api','web']){
  const name=c.images[part];
  const result=await runner('docker',['image','inspect','--format','{{json .Config.Labels}}',name],{cwd:c.root,env:runtimeEnv(c)});
  const labels=JSON.parse(result.stdout);
  if(labels?.['org.opencontainers.image.revision']!==c.images.revision)throw Error('Imagen de revisión distinta. Repite local:setup con imágenes confiables.');
  const id=(await runner('docker',['image','inspect','--format','{{.Id}}',name],{cwd:c.root,env:runtimeEnv(c)})).stdout.trim();
  if(!/^sha256:[a-f0-9]{64}$/.test(id))throw Error('Identidad de imagen inválida.');
  pinned[part]=id;
 }
 return pinned;
}
export async function ready(c,runner,signal){
 for(let n=0;n<90;n++){
  signal?.throwIfAborted();
  try{
   await runCompose(c,['exec','-T','api','wget','-T','2','-q','-O','/dev/null',`http://127.0.0.1:${c.apiPort}/readyz`],{runner});
   const r=await fetch(`http://localhost:${c.webPort}/healthz`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(2000)]):AbortSignal.timeout(2000)});
   if(r.ok)return;
  }catch(e){signal?.throwIfAborted();if(e.name==='AbortError')throw e;}
  await delay(1000,undefined,{signal});
 }
 throw Error('Servicios iniciados pero no listos; revisa local:doctor. No se borraron datos.');
}
const list=out=>out.stdout.trim().split(/\s+/).filter(Boolean);
export async function main(args,deps={}){
 const root=deps.root??defaultRoot,print=deps.print??console.log,baseRunner=deps.runner??runProcess;
 const runner=(command,args,options)=>{deps.signal?.throwIfAborted();return baseRunner(command,args,{...options,signal:deps.signal});};
 const [action,...options]=args.filter(a=>a!=='--');
 if(!actions.includes(action)){print('Usa pnpm local:setup/start/status/stop/doctor.');return 2;}
 let startOptions;
 try{
  if(action==='start')startOptions=parseStartArgs(options);
  else if(options.length&&!(action==='setup'&&new Set(options).size===options.length&&options.every(o=>['--build','--recover-lock'].includes(o))))throw Error('Argumentos inválidos para esta acción.');
 }catch(e){print(e.message);return 2;}
 try{
  let c=await loadRuntime(root,action==='setup');
  if(!c){print('Runtime no preparado. Ejecuta pnpm local:setup.');return action==='start'?1:0;}
  const compose=(a,o={})=>runCompose(c,a,{runner,...o});
  if(action==='doctor')return await doctor(c,{runner,print,check:deps.checkTools});
  if(action==='status'){
   if(!c.images){print('Runtime configurado; imágenes pendientes. Ejecuta local:setup.');return 1;}
   const running=list(await compose(['ps','--status','running','--services']));
   print(`Instalación ${projectName(root)} · activos: ${running.join(', ')||'ninguno'}`);
   if(c.binding){
    print(`Dispositivo ${c.binding.deviceId} · fuente ${c.binding.sourceId} · CS01 · datos sintéticos`);
    if(running.includes('api')){
     try{
      const r=await fetch(`http://localhost:${c.apiPort}/api/v1/devices/${c.binding.deviceId}/snapshot`,{signal:AbortSignal.timeout(2000)});
      if(r.status===404){print('Esperando primera muestra; API activa no confirma recepción USB.');return 0;}
      if(!r.ok)throw Error();const p=await r.json();
      const fields=Object.values(p.freshnessByGroup??{}).map(v=>Date.parse(v.receivedAt)).filter(Number.isFinite);
      print(fields.length?`Última recepción hace ${Math.max(0,Math.floor((Date.now()-Math.max(...fields))/1000))} s.`:'Esperando primera muestra; API activa no confirma recepción USB.');
     }catch{print('API no lista o recepción no consultable.');return 1;}
    }
   }
   return 0;
  }
  if(action==='stop'){
   if(!c.images){print('No hay servicios preparados que detener.');return 0;}
   return await withRuntimeLock(root,async()=>{c=await loadRuntime(root,false);await compose(['stop','web','api','db']);print('Runtime detenido; dispositivos, historial y fotos conservados.');return 0;});
  }
  await (deps.checkTools??checkTools)(root,runner);
  if(action==='setup'&&options.includes('--recover-lock'))await recoverRuntimeLock(root);
  return await withRuntimeLock(root,async()=>{
   c=await loadRuntime(root,false);
   deps.signal?.throwIfAborted();
   const previous=c.images?list(await compose(['ps','--status','running','--services'])):[];
   if(action==='setup'){
    if(options.includes('--build')&&previous.length)throw Error('Detén el runtime antes de reconstruir sus imágenes.');
    if(!c.images||options.includes('--build')){
     const revision=(await runner('git',['rev-parse','HEAD'],{cwd:root,env:runtimeEnv(c)})).stdout.trim();
     if(!/^[a-f0-9]{40}$/.test(revision))throw Error('Se requiere revisión Git completa para preparar imágenes.');
     const local=options.includes('--build');
     if(local)await runner('docker',['buildx','version'],{cwd:root,env:runtimeEnv(c)});
     const images={revision,api:local?`cubeos-reader-api:local-${c.bindingId}`:`ghcr.io/edwarmkaer/cubeos-api:sha-${revision}`,web:local?`cubeos-reader-web:local-${c.bindingId}`:`ghcr.io/edwarmkaer/cubeos-web:sha-${revision}`};
     const updated={...c,images};
     print(local?'Preparando imágenes locales (solo esta vez)…':'Descargando imágenes de la revisión seleccionada…');
     for(const part of ['api','web']){
      const a=local?['build','--label',`org.opencontainers.image.revision=${revision}`,'-f',`infra/docker/Dockerfile.${part}`,'-t',images[part],'.']:['pull',images[part]];
      await runner('docker',a,{cwd:root,env:runtimeEnv(updated)});
     }
     c=updated;
     const pinned=await (deps.checkImages??checkImages)(c,runner);if(pinned)c={...c,images:pinned};
     await saveRuntime(root,c);
    }else {const pinned=await (deps.checkImages??checkImages)(c,runner);if(pinned){c={...c,images:pinned};await saveRuntime(root,c);}}
    try{await compose(['up','--wait','--wait-timeout','90','--no-build','-d','db']);await compose(['run','--rm','-T','--no-deps','migrate']);}
    finally{if(!previous.includes('db'))await compose(['stop','db'],{runner:baseRunner});}
    print('Preparación lista. Inicia con pnpm local:start [-- --serial PUERTO --baud 115200].');
    return 0;
   }
   if(!c.images)throw Error('Primero ejecuta pnpm local:setup.');
   await (deps.checkImages??checkImages)(c,runner);
   if(!previous.includes('api'))await (deps.assertPorts??(async()=>assertPortFree(c.apiPort)))();
   if(!previous.includes('web'))await (deps.assertPorts??(async()=>assertPortFree(c.webPort)))();
   const selected=startOptions.serialPath?{path:startOptions.serialPath,baud:startOptions.baud}:c.serial;
   let serial;
   if(selected){serial=await inspectSerial(selected.path);c={...c,serial:selected};}
   const started=[];
   try{
    if(!previous.includes('db'))started.push('db');
    await compose(['up','--wait','--wait-timeout','90','--no-build','-d','db']);
    await compose(['run','--rm','-T','--no-deps','migrate']);
    const result=await compose(['run','--rm','-T','--no-deps','migrate','prepare-receiver'],{input:JSON.stringify({bindingId:c.bindingId,...(c.binding?{expectedDeviceId:c.binding.deviceId,expectedSourceId:c.binding.sourceId}:{})})});
    const binding=JSON.parse(result.stdout);const updated={...c,binding};
    // Persist the installation identity before starting reception. Validation is strict.
    await saveRuntime(root,updated);c=updated;
    for(const name of ['api','web'])if(!previous.includes(name))started.push(name);
    // Recreate only API: a reattached USB can have the same path/GID but a new inode.
    await compose(['up','--no-build','--pull','never','--force-recreate','--no-deps','-d','api'],{serial});
    await compose(['up','--no-build','--pull','never','--no-deps','-d','web']);
    await (deps.ready??ready)(c,runner,deps.signal);
    deps.signal?.throwIfAborted();
   }catch(e){if(started.length)await compose(['stop',...started],{runner:baseRunner}).catch(()=>{});throw e;}
   print(`Web http://localhost:${c.webPort} · API http://localhost:${c.apiPort}`);
   print(`Selecciona en Configuración el dispositivo ${c.binding.deviceId} (CS01 · datos sintéticos).`);
   print(serial?'Lector serial iniciado; confirma recepción con local:status y el Visor.':'Esperando placa: vuelve a iniciar con --serial PUERTO --baud 115200.');
   return 0;
  });
 }catch(e){print(e.message);return 1;}
}
async function doctor(c,{runner,print,check}){
 const checks=[];
 try{const lock=await lockStatus(c.root);if(lock)checks.push({name:'operación',state:'error',message:lock.active?`Operación activa (PID ${lock.pid}); espera su finalización.`:'Operación interrumpida. Recupera explícitamente con pnpm local:setup -- --recover-lock.'});}catch(e){checks.push({name:'operación',state:'error',message:e.message});}
 try{await (check??checkTools)(c.root,runner);checks.push({name:'herramientas',state:'ok',message:'Node, pnpm y Docker accesibles.'});}
 catch(e){checks.push({name:'herramientas',state:'error',message:e.message});}
 if(!c.images)checks.push({name:'imágenes',state:'error',message:'Ejecuta local:setup.'});
 else try{await checkImages(c,runner);checks.push({name:'imágenes',state:'ok',message:'Imágenes preparadas.'});}catch(e){checks.push({name:'imágenes',state:'error',message:e.message});}
 if(c.serial){try{await inspectSerial(c.serial.path);checks.push({name:'serial',state:'ok',message:'TTY presente; no acredita recepción ni disponibilidad exclusiva. Cierra Serial Monitor.'});}catch(e){checks.push({name:'serial',state:'error',message:e.message});}}
 else checks.push({name:'serial',state:'pending',message:'Sin puerto elegido. Conecta ESP32-C3 y utiliza --serial.'});
 print(JSON.stringify({checks,ready:checks.every(v=>v.state!=='error')},null,2));
 return checks.some(v=>v.state==='error')?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const controller=new AbortController(),cancel=()=>controller.abort(new DOMException('Operación cancelada.','AbortError'));
 process.on('SIGINT',cancel);process.on('SIGTERM',cancel);
 try{process.exitCode=await main(process.argv.slice(2),{signal:controller.signal});}
 finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);}
}
