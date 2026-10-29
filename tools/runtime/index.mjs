import {readFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {loadRuntime,saveRuntime,parseStartArgs,inspectSerial,projectName,runtimeEnv,withRuntimeLock} from './config.mjs';
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
 for(const name of [c.images.api,c.images.web]){
  const result=await runner('docker',['image','inspect','--format','{{json .Config.Labels}}',name],{cwd:c.root,env:runtimeEnv(c)});
  const labels=JSON.parse(result.stdout);
  if(labels?.['org.opencontainers.image.revision']!==c.images.revision)throw Error('Imagen de revisión distinta. Repite local:setup con imágenes confiables.');
 }
}
async function ready(c,runner){
 for(let n=0;n<90;n++){
  try{
   await runCompose(c,['exec','-T','api','wget','-T','2','-q','-O','/dev/null',`http://127.0.0.1:${c.apiPort}/readyz`],{runner});
   const r=await fetch(`http://localhost:${c.webPort}/healthz`,{signal:AbortSignal.timeout(2000)});
   if(r.ok)return;
  }catch{}
  await delay(1000);
 }
 throw Error('Servicios iniciados pero no listos; revisa local:doctor. No se borraron datos.');
}
const list=out=>out.stdout.trim().split(/\s+/).filter(Boolean);
export async function main(args,deps={}){
 const root=deps.root??defaultRoot,print=deps.print??console.log,runner=deps.runner??runProcess;
 const [action,...options]=args.filter(a=>a!=='--');
 if(!actions.includes(action)){print('Usa pnpm local:setup/start/status/stop/doctor.');return 2;}
 let startOptions;
 try{
  if(action==='start')startOptions=parseStartArgs(options);
  else if(options.length&&!(action==='setup'&&options.length===1&&options[0]==='--build'))throw Error('Argumentos inválidos para esta acción.');
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
   return await withRuntimeLock(root,async()=>{await compose(['stop','web','api','db']);print('Runtime detenido; dispositivos, historial y fotos conservados.');return 0;});
  }
  await (deps.checkTools??checkTools)(root,runner);
  return await withRuntimeLock(root,async()=>{
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
     await (deps.checkImages??checkImages)(c,runner);
     await saveRuntime(root,c);
    }else await (deps.checkImages??checkImages)(c,runner);
    try{await compose(['up','--wait','--wait-timeout','90','--no-build','-d','db']);await compose(['run','--rm','-T','--no-deps','migrate']);}
    finally{if(!previous.includes('db'))await compose(['stop','db']);}
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
    await compose(['up','--wait','--wait-timeout','90','--no-build','-d','db']);if(!previous.includes('db'))started.push('db');
    await compose(['run','--rm','-T','--no-deps','migrate']);
    const result=await compose(['run','--rm','-T','--no-deps','migrate','prepare-receiver'],{input:JSON.stringify({bindingId:c.bindingId,...(c.binding?{expectedDeviceId:c.binding.deviceId,expectedSourceId:c.binding.sourceId}:{})})});
    const binding=JSON.parse(result.stdout);const updated={...c,binding};
    // Persist the installation identity before starting reception. Validation is strict.
    await saveRuntime(root,updated);c=updated;
    for(const name of ['api','web'])if(!previous.includes(name))started.push(name);
    await compose(['up','--no-build','--pull','never','-d','api','web'],{serial});
    await (deps.ready??ready)(c,runner);
   }catch(e){if(started.length)await compose(['stop',...started]).catch(()=>{});throw e;}
   print(`Web http://localhost:${c.webPort} · API http://localhost:${c.apiPort}`);
   print(`Selecciona en Configuración el dispositivo ${c.binding.deviceId} (CS01 · datos sintéticos).`);
   print(serial?'Lector serial iniciado; confirma recepción con local:status y el Visor.':'Esperando placa: vuelve a iniciar con --serial PUERTO --baud 115200.');
   return 0;
  });
 }catch(e){print(e.message);return 1;}
}
async function doctor(c,{runner,print,check}){
 const checks=[];
 try{await (check??checkTools)(c.root,runner);checks.push({name:'herramientas',state:'ok',message:'Node, pnpm y Docker accesibles.'});}
 catch(e){checks.push({name:'herramientas',state:'error',message:e.message});}
 if(!c.images)checks.push({name:'imágenes',state:'error',message:'Ejecuta local:setup.'});
 else try{await checkImages(c,runner);checks.push({name:'imágenes',state:'ok',message:'Imágenes preparadas.'});}catch(e){checks.push({name:'imágenes',state:'error',message:e.message});}
 if(c.serial){try{await inspectSerial(c.serial.path);checks.push({name:'serial',state:'ok',message:'TTY presente; no acredita recepción ni disponibilidad exclusiva. Cierra Serial Monitor.'});}catch(e){checks.push({name:'serial',state:'error',message:e.message});}}
 else checks.push({name:'serial',state:'pending',message:'Sin puerto elegido. Conecta ESP32-C3 y utiliza --serial.'});
 print(JSON.stringify({checks,ready:checks.every(v=>v.state!=='error')},null,2));
 return checks.some(v=>v.state==='error')?1:0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await main(process.argv.slice(2));
