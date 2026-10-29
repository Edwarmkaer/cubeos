import {spawn} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {projectName,runtimeEnv} from './config.mjs';

// Only external process execution is replaceable in unit tests. No shell/env dumps.
export function runProcess(command,args,{cwd,env,input='',signal}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],signal});
  let stdout='',stderr='',size=0;
  const receive=(value,isError)=>{size+=value.length;if(size>4*1024*1024){child.kill('SIGTERM');return;}if(isError)stderr+=value;else stdout+=value;};
  child.stdout.on('data',v=>receive(v,false));child.stderr.on('data',v=>receive(v,true));
  child.on('error',()=>reject(Error(`No se pudo ejecutar ${command}; comprueba la instalación y permisos.`)));
  child.on('close',async code=>{
   process.removeListener('SIGINT',interrupt);process.removeListener('SIGTERM',interrupt);
   if(code===0&&size<=4*1024*1024)return resolve({stdout,stderr});
   if(cwd)await writeFile(join(cwd,'.cubeos/runtime/last-error.log'),stdout+'\n'+stderr,{mode:0o600}).catch(()=>{});
   reject(Error(`${command} falló (salida ${code??'interrumpida'}). Revisa local:doctor y el registro privado .cubeos/runtime/last-error.log.`));
  });
  const interrupt=()=>child.kill('SIGTERM');
  process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
  child.stdin.on('error',()=>{});child.stdin.end(input);
 });
}
export async function runCompose(c,args,options={}){
 const env=runtimeEnv(c);
 const argv=['compose','--project-name',projectName(c.root),'--file',join(c.root,'infra/docker/compose.runtime.yaml')];
 if(options.serial){
  argv.push('--file',join(c.root,'infra/docker/compose.serial.yaml'));
  Object.assign(env,{SERIAL_HOST_DEVICE:options.serial.realPath,SERIAL_DEVICE_GID:String(options.serial.gid),SERIAL_BAUD:String(c.serial.baud),SERIAL_SOURCE_ID:c.binding?.sourceId??''});
 }
 try{return await (options.runner??runProcess)('docker',[...argv,...args],{cwd:c.root,env,input:options.input??'',signal:options.signal});}
 catch{throw Error('Docker Compose no pudo completar la operación. Revisa local:doctor y los logs de los servicios de esta instalación.');}
}
