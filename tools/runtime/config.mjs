import {readFile,writeFile,mkdir,lstat,realpath,rename,open,unlink} from 'node:fs/promises';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';

const id=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const keys=['schemaVersion','root','bindingId','password','webPort','apiPort','images','serial','binding'];
export const runtimeDirectory=root=>join(resolve(root),'.cubeos/runtime');
export const projectName=root=>'cubeos-runtime-'+createHash('sha256').update(resolve(root)).digest('hex').slice(0,12);
export function validateConfig(c,root){
 if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>!keys.includes(k))||c.schemaVersion!==1||c.root!==resolve(root)||!id.test(c.bindingId)||!/^[a-f0-9]{48}$/.test(c.password))throw Error('Configuración runtime inválida o de otra instalación; no se modificó.');
 for(const n of [c.webPort,c.apiPort])if(!Number.isInteger(n)||n<1024||n>65535)throw Error('Puertos runtime inválidos.');
 if(c.webPort===c.apiPort)throw Error('Puertos web/API deben ser distintos.');
 if(c.images!==null){
  if(!c.images||Object.keys(c.images).sort().join(',')!=='api,revision,web'||!/^[a-f0-9]{40}$/.test(c.images.revision)||!['api','web'].every(k=>typeof c.images[k]==='string'&&/^[a-z0-9./:_@-]+$/.test(c.images[k])))throw Error('Imágenes runtime inválidas.');
 }
 if(c.serial!==null&&(!c.serial||Object.keys(c.serial).sort().join(',')!=='baud,path'||typeof c.serial.path!=='string'||!Number.isInteger(c.serial.baud)||c.serial.baud<1||c.serial.baud>4000000))throw Error('Configuración serial inválida.');
 if(c.binding!==null&&(!c.binding||Object.keys(c.binding).sort().join(',')!=='bindingId,deviceId,protocolDeviceId,sourceId'||c.binding.bindingId!==c.bindingId||!id.test(c.binding.deviceId)||!id.test(c.binding.sourceId)||c.binding.protocolDeviceId!=='CS01'))throw Error('Binding runtime inválido.');
 return c;
}
async function privatePath(path,directory=false){
 const s=await lstat(path);
 if(s.isSymbolicLink())throw Error('No se admiten enlaces simbólicos (symlinks) en configuración runtime.');
 if((directory?!s.isDirectory():!s.isFile())||(s.mode&0o077)!==0)throw Error('Configuración privada requerida: directorio 0700 y archivo 0600.');
 return s;
}
async function directories(root,create){
 for(const p of [join(resolve(root),'.cubeos'),runtimeDirectory(root)]){
  if(create){try{await mkdir(p,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}}
  await privatePath(p,true);
 }
}
export async function loadRuntime(root,create){
 try{await directories(root,create);}catch(e){if(!create&&e.code==='ENOENT')return null;throw e;}
 const path=join(runtimeDirectory(root),'config.json');
 if(create){
  const initial={schemaVersion:1,root:resolve(root),bindingId:randomUUID(),password:randomBytes(24).toString('hex'),webPort:3000,apiPort:8080,images:null,serial:null,binding:null};
  try{await writeFile(path,JSON.stringify(initial,null,2)+'\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
 }
 try{await privatePath(path);}catch(e){if(!create&&e.code==='ENOENT')return null;throw e;}
 try{return validateConfig(JSON.parse(await readFile(path,'utf8')),root);}catch(e){if(e instanceof SyntaxError)throw Error('JSON runtime inválido; no se modificó.');throw e;}
}
export async function saveRuntime(root,c){
 validateConfig(c,root);await directories(root,false);await privatePath(join(runtimeDirectory(root),'config.json'));
 const path=join(runtimeDirectory(root),'config.json'),temp=path+'.'+randomUUID()+'.tmp';
 await writeFile(temp,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600});
 await rename(temp,path);
}
export function parseStartArgs(args){
 let serialPath=null,baud=115200;const seen=new Set();
 for(let i=0;i<args.length;i+=2){const k=args[i],v=args[i+1];
  if(!['--serial','--baud'].includes(k)||seen.has(k)||!v||v.startsWith('--'))throw Error('Usa --serial PUERTO [--baud 115200].');
  seen.add(k);if(k==='--serial')serialPath=v;else{if(!/^\d+$/.test(v))throw Error('Baud inválido.');baud=Number(v);}
 }
 if(!Number.isInteger(baud)||baud<1||baud>4000000||seen.has('--baud')&&!serialPath)throw Error('Baud requiere un puerto y valor 1..4000000.');
 return {serialPath,baud};
}
export async function inspectSerial(path){
 let target,s;
 try{target=await realpath(path);s=await lstat(target);}catch{throw Error('Puerto serial ausente: conecta la placa y comprueba la ruta.');}
 if(!/^\/dev\/(tty(ACM|USB)[0-9]+|pts\/[0-9]+)$/.test(target)||!s.isCharacterDevice())throw Error('Selecciona explícitamente un dispositivo TTY USB/serial.');
 return {realPath:target,gid:s.gid};
}
export function runtimeEnv(c,inherited=process.env){
 const e={};
 for(const k of ['PATH','HOME','XDG_RUNTIME_DIR','LANG','TMPDIR','DOCKER_CONFIG'])if(inherited[k])e[k]=inherited[k];
 return {...e,DOCKER_CONTEXT:'default',POSTGRES_PASSWORD:c.password,WEB_PORT:String(c.webPort),API_PORT:String(c.apiPort),DEPLOYMENT_MODE:'local',AUTH_MODE:'local',MEDIA_STORAGE:'local',SERIAL_PORT:'',CUBEOS_API_IMAGE:c.images?.api??'',CUBEOS_WEB_IMAGE:c.images?.web??''};
}
export async function withRuntimeLock(root,fn){
 try{await lstat(join(runtimeDirectory(root),'recovery.lock'));throw Error('Hay una recuperación de lock en curso; no se inició otra operación.');}catch(e){if(e.code!=='ENOENT')throw e;}
 const path=join(runtimeDirectory(root),'operation.lock');let handle;
 try{handle=await open(path,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw Error('Hay una operación runtime activa o interrumpida. Consulta local:doctor; no se modificó el lock.');throw e;}
 try{await handle.writeFile(JSON.stringify({pid:process.pid,root:resolve(root)}));return await fn();}
 finally{await handle.close();await unlink(path);}
}
export async function lockStatus(root){
 const file=join(runtimeDirectory(root),'operation.lock');
 try{
  await privatePath(file);
  const v=JSON.parse(await readFile(file,'utf8'));
  if(v.root!==resolve(root)||!Number.isInteger(v.pid)||v.pid<2)throw Error('Lock de otra instalación o inválido; inspección manual requerida.');
  try{process.kill(v.pid,0);return {active:true,pid:v.pid};}catch(e){if(e.code==='ESRCH')return {active:false,pid:v.pid};throw Error('No se puede verificar el proceso del lock.');}
 }catch(e){if(e.code==='ENOENT')return null;throw e;}
}
// Explicit opt-in; a second guard prevents races between competing recoveries.
export async function recoverRuntimeLock(root){
 const guard=join(runtimeDirectory(root),'recovery.lock'),handle=await open(guard,'wx',0o600);
 try{
  const state=await lockStatus(root);
  if(state?.active)throw Error('La operación continúa activa; espera o detenla normalmente.');
  if(state)await unlink(join(runtimeDirectory(root),'operation.lock'));
 }finally{await handle.close();await unlink(guard);}
}
