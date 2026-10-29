import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join,basename} from 'node:path';
import {projectName,runtimeEnv} from './config.mjs';

// Only external process execution is replaceable in unit tests. No shell/env dumps.
export function runProcess(command,args,{cwd,env,input='',signal}={}){
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new DOMException('Operación cancelada.','AbortError'));
  const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32'});
  let stdout='',stderr='',size=0,cancelled=false,escalation;
  const kill=which=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,which);else child.kill(which);}catch{}};
  const interrupt=()=>{if(cancelled)return;cancelled=true;kill('SIGTERM');escalation=setTimeout(()=>kill('SIGKILL'),500);};
  signal?.addEventListener('abort',interrupt,{once:true});
  const receive=(value,isError)=>{size+=value.length;if(size>4*1024*1024){interrupt();return;}if(isError)stderr+=value;else stdout+=value;};
  child.stdout.on('data',v=>receive(v,false));child.stderr.on('data',v=>receive(v,true));
  child.on('error',()=>reject(Error(`No se pudo ejecutar ${command}; comprueba la instalación y permisos.`)));
  child.on('close',async code=>{
   process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
   signal?.removeEventListener('abort',interrupt);
   if(cancelled){clearTimeout(escalation);kill('SIGKILL');return reject(new DOMException('Operación cancelada.','AbortError'));}
   if(code===0&&size<=4*1024*1024)return resolve({stdout,stderr});
   const log='last-error-'+basename(command).replace(/[^a-zA-Z0-9_-]/g,'')+'.log';
   if(cwd)await writeFile(join(cwd,'.cubeos/runtime',log),stdout+'\n'+stderr,{mode:0o600}).catch(()=>{});
   reject(Error(`${command} falló (salida ${code??'interrumpida'}). Revisa local:doctor y el registro privado .cubeos/runtime/${log}.`));
  });
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function runCompose(c,args,options={}){
 const env=runtimeEnv(c);
 const argv=['compose','--project-name',projectName(c.root),'--file',join(c.root,'infra/docker/compose.runtime.yaml')];
 if(c.cloudEnabled||options.cloudAdmin){argv.push('--file',join(c.root,'infra/docker/compose.cloud.yaml'));env.CLOUD_RELAY_ENABLED=String(c.cloudEnabled??false);}
 if(options.serial){
  argv.push('--file',join(c.root,'infra/docker/compose.serial.yaml'));
  Object.assign(env,{SERIAL_HOST_DEVICE:options.serial.realPath,SERIAL_DEVICE_GID:String(options.serial.gid),SERIAL_BAUD:String(c.serial.baud),SERIAL_SOURCE_ID:c.binding?.sourceId??''});
 }
 try{return await (options.runner??runProcess)('docker',[...argv,...args],{cwd:c.root,env,input:options.input??'',signal:options.signal});}
 catch(e){if(e.name==='AbortError')throw e;throw Error('Docker Compose no pudo completar la operación. Revisa local:doctor y los logs de los servicios de esta instalación.');}
}
