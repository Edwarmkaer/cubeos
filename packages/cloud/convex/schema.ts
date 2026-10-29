import {defineSchema,defineTable} from 'convex/server';
import {v} from 'convex/values';
export default defineSchema({
 channels:defineTable({channelId:v.string(),deviceId:v.string(),protocolDeviceId:v.string(),publishHash:v.string(),readHash:v.string(),expiresAt:v.number(),revoked:v.boolean()}).index('by_channelId',['channelId']),
 replicas:defineTable({channelId:v.string(),revisionId:v.string(),digest:v.string(),replica:v.any()}).index('by_channelId',['channelId']),
});
