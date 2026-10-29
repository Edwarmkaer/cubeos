import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function readCloudConfig(path,deviceId){
 const before=await lstat(path);
 if(!before.isFile()||(before.mode&0o777)!==0o600||before.size>4096)throw Error('Publicación requiere archivo privado 0600, no symlink.');
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const current=await file.stat();if(current.ino!==before.ino||current.dev!==before.dev)throw Error('El archivo de publicación cambió.');
  const c=JSON.parse(await file.readFile('utf8'));
  if(!c||Object.keys(c).sort().join(',')!=='channelId,deviceId,endpoint,expiresAt,publishToken,schemaVersion'||c.schemaVersion!==1||!uuid.test(c.channelId)||c.deviceId!==deviceId||!uuid.test(c.deviceId)||!/^[a-f0-9]{64}$/.test(c.publishToken)||!Number.isSafeInteger(c.expiresAt)||c.expiresAt<=Date.now()||c.expiresAt>Date.now()+8*3600000)throw Error('Configuración de publicación inválida o de otro dispositivo.');
  const u=new URL(c.endpoint);
  if(u.protocol!=='https:'||!/^[a-z0-9-]+\.convex\.site$/.test(u.hostname)||u.port||u.username||u.password||u.search||u.hash||u.pathname!=='/telemetry/v1/snapshot')throw Error('Destino Convex inválido.');
  return c;
 }finally{await file.close();}
}
