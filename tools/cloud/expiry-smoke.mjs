// Real reactive expiry, opt-in, own channel only. Never prints credentials.
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isExpectedExpiry} from './expiry-check.mjs';
const require=createRequire(new URL('../../packages/cloud/package.json',import.meta.url));
const {ConvexClient}=require('convex/browser');const {makeFunctionReference}=require('convex/server');
if(process.env.CUBEOS_CLOUD_SMOKE!=='1')throw Error('Explicit cloud smoke required');
const u=new URL(process.env.CUBEOS_CLOUD_URL);
if(u.protocol!=='https:'||u.origin!==process.env.CUBEOS_CLOUD_URL||!/^[a-z0-9-]+\.convex\.cloud$/.test(u.hostname))throw Error('Explicit secure Convex origin required');
const deployment=u.hostname.replace(/\.convex\.cloud$/,'');
const cwd=fileURLToPath(new URL('../../packages/cloud',import.meta.url));
const admin=(name,args)=>new Promise((resolve,reject)=>{
 const p=spawn(process.execPath,[cwd+'/node_modules/convex/bin/main.js','run','--deployment',deployment,name,JSON.stringify(args)],{cwd,stdio:'ignore'});
 p.on('error',reject);p.on('close',code=>code===0?resolve():reject(Error('Scoped administrative operation failed')));
});
const channelId=randomUUID(),readToken=randomBytes(32).toString('hex'),publishToken=randomBytes(32).toString('hex');
const hash=s=>createHash('sha256').update(s).digest('hex');let client;
try{
 const expiresAt=Date.now()+15000;
 await admin('channels:provision',{channelId,deviceId:randomUUID(),protocolDeviceId:'CS01',publishHash:hash(publishToken),readHash:hash(readToken),expiresAt});
 client=new ConvexClient(u.origin,{logger:false});let opened=false;
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Reactive expiry timeout')),20000);
  client.onUpdate(makeFunctionReference('replicas:latest'),{channelId,readToken},()=>{opened=true;},error=>{clearTimeout(timer);isExpectedExpiry(error,opened,expiresAt)?resolve():reject(Error('Unexpected subscription failure; expiry not verified'));});
 });
 console.log('PASS: actual open Convex subscription denied after scheduled expiry.');
}finally{await client?.close();await admin('channels:revoke',{channelId});}
