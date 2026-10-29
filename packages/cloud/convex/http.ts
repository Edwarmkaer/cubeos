import {httpRouter} from 'convex/server';
import {httpAction} from './_generated/server';
import {internal} from './_generated/api';
import {sha256} from './security';
const http=httpRouter();
http.route({path:'/telemetry/v1/snapshot',method:'POST',handler:httpAction(async(ctx,request)=>{
 const token=/^Bearer ([a-f0-9]{64})$/.exec(request.headers.get('Authorization')??'')?.[1];
 if(!token)return new Response(null,{status:403});
 if(request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response(null,{status:415});
 if(!request.body)return new Response(null,{status:400});
 const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>64*1024){await reader.cancel();return new Response(null,{status:413});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  let replica;try{replica=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{return new Response(null,{status:400});}
  const status=await ctx.runMutation(internal.replicas.accept,{publishHash:await sha256(token),replica});
  return new Response(null,{status});
 }finally{reader.releaseLock();}
})});
export default http;
