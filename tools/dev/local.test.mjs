import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

// These tests catch credential replacement, unsafe configuration and port collisions.
const implementation = await import('./local.mjs');
test('setup creates private credentials once and preserves subsequent edits', async () => {
  assert.equal(typeof implementation.loadLocal, 'function', 'local setup is not implemented');
  const root = await mkdtemp(join(tmpdir(), 'cubeos-dev-test-'));
  try {
    const first = await implementation.loadLocal(root, true);
    assert.match(first.POSTGRES_PASSWORD, /^[a-f0-9]{48}$/);
    const file = join(root, '.env.development.local');
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    const contents = await readFile(file, 'utf8');
    await writeFile(file, contents.replace('PG_PORT=54329', 'PG_PORT=54328'));
    const second = await implementation.loadLocal(root, true);
    assert.equal(second.POSTGRES_PASSWORD, first.POSTGRES_PASSWORD);
    assert.equal(second.PG_PORT, '54328');
    assert.equal(await readFile(file, 'utf8'), contents.replace('PG_PORT=54329', 'PG_PORT=54328'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('invalid configuration fails without overwriting it or executing shell text', async () => {
  assert.equal(typeof implementation.loadLocal, 'function', 'local setup is not implemented');
  const root = await mkdtemp(join(tmpdir(), 'cubeos-dev-test-'));
  try {
    const file = join(root, '.env.development.local');
    for (const text of [
      'POSTGRES_PASSWORD=$(touch unsafe)\nPG_PORT=54329\n',
      'POSTGRES_PASSWORD=abc\nPG_PORT=0\n',
      'POSTGRES_PASSWORD=abc\nPG_PORT=54329\nDEPLOYMENT_MODE=public\n',
      'POSTGRES_PASSWORD=abc\nPG_PORT=54329\nPG_PORT=54328\n',
    ]) {
      await writeFile(file, text);
      await assert.rejects(implementation.loadLocal(root, true));
      assert.equal(await readFile(file, 'utf8'), text);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('stop does not create missing configuration', async () => {
  assert.equal(typeof implementation.loadLocal, 'function', 'local setup is not implemented');
  const root = await mkdtemp(join(tmpdir(), 'cubeos-dev-test-'));
  try {
    assert.equal(await implementation.loadLocal(root, false), null);
    await assert.rejects(stat(join(root, '.env.development.local')));
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('development refuses an occupied port before starting services', async () => {
  assert.equal(typeof implementation.assertPortFree, 'function', 'port checks are not implemented');
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try { await assert.rejects(implementation.assertPortFree(server.address().port), /ocupado/); }
  finally { await new Promise(resolve => server.close(resolve)); }
});
test('local runtime overrides exported cloud settings', () => {
  assert.equal(typeof implementation.localEnv, 'function', 'local environment is not isolated');
  const env = implementation.localEnv({ POSTGRES_PASSWORD: 'a'.repeat(48), PG_PORT: '54329' }, {
    DEPLOYMENT_MODE: 'public', AUTH_MODE: 'clerk', RAILWAY_HEALTHCHECK: 'true',
    MEDIA_STORAGE: 's3', MEDIA_MAX_BYTES: '-1', MEDIA_MAX_PIXELS: '-1', SERIAL_PORT: '/dev/ttyUSB0',
  });
  assert.equal(env.RAILWAY_HEALTHCHECK, 'false');
  assert.equal(env.MEDIA_MAX_BYTES, '67108864');
  assert.equal(env.MEDIA_MAX_PIXELS, '80000000');
  assert.equal(env.DEPLOYMENT_MODE, 'local');
  assert.equal(env.AUTH_MODE, 'local');
  assert.equal(env.MEDIA_STORAGE, 'local');
  assert.equal(env.SERIAL_PORT, '');
});
test('separate checkouts have separate Compose project identities', () => {
  assert.equal(typeof implementation.projectName, 'function', 'installation identity is missing');
  assert.notEqual(implementation.projectName('/tmp/clone-a'), implementation.projectName('/tmp/clone-b'));
  assert.equal(implementation.projectName('/tmp/clone-a'), implementation.projectName('/tmp/clone-a'));
  assert.match(implementation.projectName('/tmp/clone-a'), /^cubeos-dev-[a-f0-9]+$/);
});
