import {mkdir,lstat,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function origin(value,suffix,path=''){
 const u=new URL(value);
 if(u.protocol!=='https:'||!new RegExp('^[a-z0-9-]+\\.'+suffix.replaceAll('.','\\.')+'$').test(u.hostname)||u.username||u.password||u.port||u.search||u.hash||u.pathname!==(path||'/'))throw Error('Invalid Convex destination');
 return u;
}
export function provisionArguments(convexURL,input){
 const deployment=origin(convexURL,'convex.cloud').hostname.replace(/\.convex\.cloud$/,'');
 return ['run','--deployment',deployment,'channels:provision',JSON.stringify(input)];
}
export async function provisionChannel(input,provision){
 if(!uuid.test(input.deviceId))throw Error('Invalid device UUID');
 const site=origin(input.endpoint,'convex.site','/telemetry/v1/snapshot'),cloud=origin(input.convexURL,'convex.cloud');
 if(site.hostname.replace(/\.convex.site$/,'')!==cloud.hostname.replace(/\.convex.cloud$/,''))throw Error('Convex deployment mismatch');
 const parent=await lstat(dirname(resolve(input.directory)));if(!parent.isDirectory()||parent.isSymbolicLink())throw Error('Invalid capability directory');
 await mkdir(input.directory,{mode:0o700}); // Must be a fresh directory, never overwrite.
 const channelId=randomUUID(),publishToken=randomBytes(32).toString('hex'),readToken=randomBytes(32).toString('hex');
 const expiresAt=Date.now()+8*3600000;
 const publishFile=join(input.directory,'publish.json'),readFile=join(input.directory,'read.json');
 await writeFile(publishFile,JSON.stringify({schemaVersion:1,channelId,deviceId:input.deviceId,endpoint:input.endpoint,publishToken,expiresAt})+'\n',{flag:'wx',mode:0o600});
 await writeFile(readFile,JSON.stringify({channelId,convexURL:input.convexURL,readToken,expiresAt})+'\n',{flag:'wx',mode:0o600});
 const hash=s=>createHash('sha256').update(s).digest('hex');
 try{await provision({channelId,deviceId:input.deviceId,protocolDeviceId:'CS01',publishHash:hash(publishToken),readHash:hash(readToken),expiresAt});}
 catch{throw Error('Channel provisioning not confirmed; private capability files retained for recovery. No tokens were printed.');}
 return {channelId,publishFile,readFile,expiresAt};
}
async function cli(args){
 const options={};for(let i=0;i<args.length;i+=2){const key=args[i],value=args[i+1];if(!['--directory','--device','--endpoint','--url'].includes(key)||!value||key in options)throw Error('Use --directory PATH --device UUID --endpoint HTTPS --url HTTPS');options[key]=value;}
 const directory=options['--directory'];if(!directory)throw Error('Explicit private output directory required');
 const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),cwd=join(root,'packages/cloud');
 const result=await provisionChannel({directory,deviceId:options['--device'],endpoint:options['--endpoint'],convexURL:options['--url']},input=>new Promise((done,fail)=>{
  const child=spawn(process.execPath,[join(cwd,'node_modules/convex/bin/main.js'),...provisionArguments(options['--url'],input)],{cwd,stdio:['ignore','ignore','ignore']});
  child.on('error',()=>fail(Error('Administrative CLI unavailable')));child.on('close',code=>code===0?done():fail(Error('Administrative operation failed')));
 }));
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{await cli(process.argv.slice(2).filter(a=>a!=='--'));}catch(e){console.error(e.message);process.exitCode=1;}}
