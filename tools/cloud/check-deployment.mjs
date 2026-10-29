function secureOrigin(value,suffix){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.origin!==value||u.username||u.password||u.port||!u.hostname.endsWith('.'+suffix))throw Error('Invalid deployment origin');
 return u.origin;
}
export function checkDeployment(expected,actual){
 secureOrigin(expected.url,'vercel.app');secureOrigin(expected.expectedConvexURL,'convex.cloud');
 if(!/^https:\/\/cubeos-[a-z0-9]{9}-edwarmkaers-projects\.vercel\.app$/.test(expected.url))throw Error('Immutable CubeOS deployment URL required, not a mutable alias');
 if(!/^[a-f0-9]{40}$/.test(expected.commit)||!expected.teamId||!expected.projectId)throw Error('Explicit deployment identity required');
 for(const key of ['teamId','projectId','commit','url'])if(actual[key]!==expected[key])throw Error('Deployment identity mismatch');
 if(actual.state!=='READY'||actual.environment?.DEPLOYMENT_MODE!=='cloud'||actual.environment?.NEXT_PUBLIC_CONVEX_URL!==expected.expectedConvexURL)throw Error('Cloud deployment not ready');
 for(const key of Object.keys(actual.environment))if(key.startsWith('NEXT_PUBLIC_')&&!['NEXT_PUBLIC_CONVEX_URL','NEXT_PUBLIC_MAP_STYLE_URL'].includes(key))throw Error('Unexpected browser-exposed configuration');
 return {teamId:actual.teamId,projectId:actual.projectId,commit:actual.commit,url:actual.url,state:actual.state};
}
