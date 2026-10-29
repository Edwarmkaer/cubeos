import {v,ConvexError} from 'convex/values';
import {RateLimiter} from '@convex-dev/rate-limiter';
import {parseCloudReplica} from '@cubeos/contracts/cloud-replica';
import {internalMutation,query} from './_generated/server';
import {components} from './_generated/api';
import {sha256,canonical,digestPattern,uuid} from './security';
const limiter=new RateLimiter(components.rateLimiter,{publish:{kind:'token bucket',rate:1,period:1000,capacity:1}});
export const accept=internalMutation({args:{publishHash:v.string(),replica:v.any()},returns:v.number(),handler:async(ctx,args)=>{
 let r;try{r=parseCloudReplica(args.replica);}catch{return 400;}
 const c=await ctx.db.query('channels').withIndex('by_channelId',q=>q.eq('channelId',r.channelId)).unique();
 if(!c||c.revoked||c.expiresAt<=Date.now()||c.publishHash!==args.publishHash)return 403;
 if(c.deviceId!==r.deviceId||c.protocolDeviceId!==r.snapshot.deviceId)return 400;
 const previous=await ctx.db.query('replicas').withIndex('by_channelId',q=>q.eq('channelId',r.channelId)).unique();
 const digest=await sha256(canonical(r));
 if(previous&&BigInt(r.revisionId)<=BigInt(previous.revisionId))return previous.revisionId===r.revisionId&&previous.digest===digest?200:409;
 if(!(await limiter.limit(ctx,'publish',{key:r.channelId})).ok)return 429;
 const row={channelId:r.channelId,revisionId:r.revisionId,digest,replica:r};
 if(previous)await ctx.db.replace(previous._id,row);else await ctx.db.insert('replicas',row);return 200;
}});
export const latest=query({args:{channelId:v.string(),readToken:v.string()},returns:v.any(),handler:async(ctx,{channelId,readToken})=>{
 if(!uuid.test(channelId)||!digestPattern.test(readToken))throw new ConvexError({code:'ACCESS_UNAVAILABLE'});
 const c=await ctx.db.query('channels').withIndex('by_channelId',q=>q.eq('channelId',channelId)).unique();
 if(!c||c.revoked||c.expiresAt<=Date.now()||c.readHash!==await sha256(readToken))throw new ConvexError({code:'ACCESS_UNAVAILABLE'});
 return (await ctx.db.query('replicas').withIndex('by_channelId',q=>q.eq('channelId',channelId)).unique())?.replica??null;
}});
