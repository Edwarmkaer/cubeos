import {test} from 'node:test';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
test('settings auth fixture bundles for a browser without Next server modules',async()=>{
 await build({entryPoints:['tests/auth-browser-fixture.tsx'],bundle:true,write:false,platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},alias:{'next/image':fileURLToPath(new URL('./media-test-image.tsx',import.meta.url))},logLevel:'silent'});
});
