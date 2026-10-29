export async function runAcceptanceStages(run){
 await run('tools/runtime/smoke.mjs');
 await run('tools/cloud/expiry-smoke.mjs');
}
