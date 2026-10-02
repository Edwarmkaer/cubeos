// Real developer workflow gate: use only an exclusive/disposable checkout/installation.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { assertPortFree } from './local.mjs';

const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
function command(args) {
  const result = spawnSync('pnpm', args, { env: environment, stdio: 'inherit' });
  assert.equal(result.status, 0, `pnpm ${args[0]} failed`);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function wait(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error('Development process exited before readiness');
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* startup */ }
    await delay(1000);
  }
  throw new Error(`Readiness timeout: ${url}`);
}
async function shutdown(child) {
  const exited = new Promise(resolve => child.once('exit', resolve));
  process.kill(-child.pid, 'SIGINT');
  await Promise.race([exited, delay(10000).then(() => {
    if (child.exitCode === null && child.signalCode === null) process.kill(-child.pid, 'SIGKILL');
  })]);
}
async function waitPortsClosed() {
  // The package-manager exit can precede the final socket close in Next/Go.
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await assertPortFree(3000); await assertPortFree(8080); return; }
    catch { await delay(100); }
  }
  throw new Error('Development children kept ports open after shutdown');
}
let child;
let prepared = false;
try {
  // Never accept readiness from an unrelated server on the same ports.
  await assertPortFree(3000);
  await assertPortFree(8080);
  command(['setup']);
  prepared = true;
  const before = await readFile('.env.development.local', 'utf8');
  command(['setup']);
  assert.equal(await readFile('.env.development.local', 'utf8'), before);
  child = spawn('pnpm', ['dev'], { env: environment, stdio: 'inherit', detached: true });
  await wait('http://localhost:8080/readyz', child);
  await wait('http://127.0.0.1:3000/visor', child);
  const created = await fetch('http://localhost:8080/api/v1/devices', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' },
    body: JSON.stringify({ name: 'Developer workflow smoke', protocolDeviceId: 'DEVSMOKE' }),
  });
  assert.equal(created.status, 201);
  const device = await created.json();
  // This is a real bundled JPEG, not a generated image.
  const { readdir } = await import('node:fs/promises');
  const file = (await readdir('apps/web/public/demo/camera')).find(name => /\.jpg$/.test(name));
  assert.ok(file, 'Bundled camera JPEG required');
  const bytes = await readFile(`apps/web/public/demo/camera/${file}`);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'sample.jpg');
  const photo = await fetch(`http://localhost:8080/api/v1/devices/${device.id}/photos`, {
    method: 'POST', headers: { Origin: 'http://localhost:3000' }, body: form,
  });
  assert.equal(photo.status, 201);
  const uploaded = await photo.json();
  await shutdown(child); child = null;
  await waitPortsClosed();
  command(['stop']);
  // The restart exercises the same entry point directly to test wrapper-only SIGTERM.
  child = spawn(process.execPath, ['tools/dev/local.mjs', 'dev'], { env: environment, stdio: 'inherit', detached: true });
  await wait('http://localhost:8080/readyz', child);
  const persisted = await fetch(`http://localhost:8080/api/v1/devices/${device.id}`);
  assert.equal(persisted.status, 200);
  const original = await fetch(`http://localhost:8080/api/v1/photos/${uploaded.id}/original`);
  assert.equal(original.status, 200);
  assert.deepEqual(Buffer.from(await original.arrayBuffer()), bytes);
  child.kill('SIGTERM');
  await new Promise(resolve => child.once('exit', resolve));
  child = null;
  await waitPortsClosed();
  console.log('PASS: setup repeatable, Turbo web/API, device and exact photo preserved after restart.');
} finally {
  if (child) await shutdown(child);
  if (prepared) command(['stop']);
}
