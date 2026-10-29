// Administrative, opt-in acceptance. Metadata contains no capability credentials.
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {checkDeployment} from './check-deployment.mjs';
import {runAcceptanceStages} from './acceptance-stages.mjs';
if(process.env.CUBEOS_LIVE_ACCEPTANCE!=='1')throw Error('Explicit CUBEOS_LIVE_ACCEPTANCE=1 required');
const record=JSON.parse(await readFile(process.argv[2],'utf8'));
const expected={teamId:'team_37jALHTMMEJBAdrILl5zNOYD',projectId:'prj_mYy9bdjG5jHSGK2NdM0Hlt3o4QAy',commit:process.env.CUBEOS_EXPECTED_COMMIT,url:process.env.CUBEOS_CLOUD_WEB_URL,expectedConvexURL:'https://mellow-roadrunner-811.convex.cloud'};
const summary=checkDeployment(expected,record);
// The browser verifies health after acquiring any scoped preview cookie, then
// tests the same immutable origin. No protection token is sent to Convex.
await runAcceptanceStages(async script=>{
const child=spawn(process.execPath,[script],{stdio:'inherit',env:{...process.env,CUBEOS_RUNTIME_SMOKE:'1',CUBEOS_CLOUD_SMOKE:'1',CUBEOS_CLOUD_SITE_URL:'https://mellow-roadrunner-811.convex.site',CUBEOS_CLOUD_URL:expected.expectedConvexURL}});
const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});
if(code!==0)throw Error('End-to-end acceptance failed');
});
console.log(JSON.stringify({...summary,verified:'serial→local database→Convex→Vercel; network recovery; revocation; offline persistence'}));
