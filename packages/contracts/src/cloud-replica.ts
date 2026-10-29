import validate from './cloud-validator.mjs';
import type {SnapshotV2,SnapshotProjectionV2} from './types.ts';
export type CloudReplicaV1={replicaVersion:1;channelId:string;deviceId:string;revisionId:string;snapshot:SnapshotV2;freshnessByGroup:SnapshotProjectionV2['freshnessByGroup']};
export function parseCloudReplica(value:unknown):CloudReplicaV1{
 if(!validate(value))throw Error('Invalid cloud replica');
 const replica=value as CloudReplicaV1;
 if(BigInt(replica.revisionId)>9223372036854775807n)throw Error('Invalid cloud revision');
 return replica;
}
