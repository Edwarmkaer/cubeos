import {test} from 'node:test';import assert from 'node:assert/strict';
const module=await import('./check-deployment.mjs').catch(()=>({}));
const expected={teamId:'team_expected',projectId:'prj_expected',commit:'a'.repeat(40),url:'https://cubeos-123456789-edwarmkaers-projects.vercel.app',expectedConvexURL:'https://test.convex.cloud'};
const actual={...expected,state:'READY',environment:{DEPLOYMENT_MODE:'cloud',NEXT_PUBLIC_CONVEX_URL:expected.expectedConvexURL}};
test('deployment acceptance rejects wrong scope, commit, origin and public secrets',()=>{
 assert.equal(typeof module.checkDeployment,'function');assert.doesNotThrow(()=>module.checkDeployment(expected,actual));
 for(const change of [{teamId:'other'},{projectId:'other'},{commit:'b'.repeat(40)},{state:'ERROR'},{url:'http://localhost:3000'},{environment:{...actual.environment,NEXT_PUBLIC_READ_TOKEN:'secret'}},{environment:{...actual.environment,NEXT_PUBLIC_CONVEX_URL:'https://wrong.convex.cloud'}}])assert.throws(()=>module.checkDeployment(expected,{...actual,...change}));
});
test('acceptance cannot certify mutable deployment aliases',()=>{
 for(const url of ['https://cubeos.vercel.app','https://cubeos-edwarmkaers-projects.vercel.app','https://cubeos-git-main-edwarmkaers-projects.vercel.app'])assert.throws(()=>module.checkDeployment({...expected,url},{...actual,url}));
});
