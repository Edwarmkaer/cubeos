import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRailwayContext } from 'railway/iac';

// Exercise the pinned SDK's actual resource graph; a deployment pointing at
// floating images, missing migration gates or local storage breaks this gate.
test('public deployment graph preserves secrets and binds private durable resources', async () => {
 process.env.CUBEOS_IMAGE_SHA='a'.repeat(40);
 const { default: program }=await import('./railway.ts');
 const definition=await program(createRailwayContext({environment:'staging'}));
 const resources=definition.resources.flat();
 assert.equal(resources.filter(r=>r.type==='database').length,1);
 const api=resources.find(r=>r.name==='api'),web=resources.find(r=>r.name==='web');
 assert.equal(api.source.image,'ghcr.io/edwarmkaer/cubeos-api:sha-'+process.env.CUBEOS_IMAGE_SHA);
 assert.equal(web.source.image,'ghcr.io/edwarmkaer/cubeos-web:sha-'+process.env.CUBEOS_IMAGE_SHA);
 assert.equal(api.deploy.healthcheckPath,'/readyz');
 assert.deepEqual(api.deploy.preDeployCommand,['server migrate']);
 assert.equal(api.variables.DATABASE_URL.resource,'database.postgres');
 for (const k of ['CLERK_SECRET_KEY','MEDIA_S3_SECRET_KEY','MEDIA_S3_ACCESS_KEY']) assert.equal(api.variables[k].type,'preserve');
 assert.equal(api.variables.MEDIA_STORAGE.value,'s3');
 assert.equal(api.variables.AUTH_MODE.value,'clerk');
 assert.equal(web.variables.DEPLOYMENT_MODE.value,'public');
 assert.equal(web.variables.CLERK_PUBLISHABLE_KEY.type,'preserve');
 assert.equal(web.variables.CLERK_SECRET_KEY,undefined);
 assert.equal(resources.some(r=>r.type==='bucket'),false); // chosen external private bucket remains explicit
 process.env.CUBEOS_IMAGE_SHA='main';
 await assert.rejects(async()=>program(createRailwayContext({environment:'staging'})),/immutable/);
});
