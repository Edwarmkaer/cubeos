import {v} from 'convex/values';
import {internalMutation} from './_generated/server';
import {internal} from './_generated/api';
import {uuid,digestPattern} from './security';
export const provision=internalMutation({
 args:{channelId:v.string(),deviceId:v.string(),protocolDeviceId:v.string(),publishHash:v.string(),readHash:v.string(),expiresAt:v.number()},returns:v.null(),
 handler:async(ctx,args)=>{
  if(!uuid.test(args.channelId)||!uuid.test(args.deviceId)||!/^[A-Z0-9_-]{2,12}$/.test(args.protocolDeviceId)||!digestPattern.test(args.publishHash)||!digestPattern.test(args.readHash)||args.publishHash===args.readHash||!Number.isSafeInteger(args.expiresAt)||args.expiresAt<=Date.now()||args.expiresAt>Date.now()+8*3600000)throw Error('Invalid channel configuration');
  if(await ctx.db.query('channels').withIndex('by_channelId',q=>q.eq('channelId',args.channelId)).unique())throw Error('Channel already exists');
  await ctx.db.insert('channels',{...args,revoked:false});
  await ctx.scheduler.runAt(args.expiresAt,internal.channels.expire,{channelId:args.channelId});
  return null;
 }
});
export const revoke=internalMutation({args:{channelId:v.string()},returns:v.null(),handler:async(ctx,{channelId})=>{
 const c=await ctx.db.query('channels').withIndex('by_channelId',q=>q.eq('channelId',channelId)).unique();
 if(c)await ctx.db.patch(c._id,{revoked:true});return null;
}});
export const expire=internalMutation({args:{channelId:v.string()},returns:v.null(),handler:async(ctx,{channelId})=>{
 const c=await ctx.db.query('channels').withIndex('by_channelId',q=>q.eq('channelId',channelId)).unique();
 if(c&&c.expiresAt<=Date.now())await ctx.db.patch(c._id,{revoked:true});return null;
}});
