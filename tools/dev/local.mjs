import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const configName = '.env.development.local';
const composeFile = 'infra/docker/compose.dev.yaml';

export async function loadLocal(directory, create) {
  const file = join(directory, configName);
  let text;
  try { text = await readFile(file, 'utf8'); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (!create) return null;
    const initial = `POSTGRES_PASSWORD=${randomBytes(24).toString('hex')}\nPG_PORT=54329\n`;
    try { await writeFile(file, initial, { flag: 'wx', mode: 0o600 }); }
    catch (writeError) { if (writeError.code !== 'EEXIST') throw writeError; }
    text = await readFile(file, 'utf8');
  }
  const config = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const match = /^(POSTGRES_PASSWORD|PG_PORT)=([a-zA-Z0-9_-]+)$/.exec(line);
    if (!match || Object.hasOwn(config, match[1])) throw new Error(`Configuración inválida en ${configName}; no se modificó.`);
    config[match[1]] = match[2];
  }
  if (!config.POSTGRES_PASSWORD || config.POSTGRES_PASSWORD.length < 24 ||
      !/^\d+$/.test(config.PG_PORT ?? '') || Number(config.PG_PORT) < 1024 || Number(config.PG_PORT) > 65535) {
    throw new Error(`Revisa contraseña (24+ caracteres URL-safe) y PG_PORT (1024..65535) en ${configName}.`);
  }
  return config;
}

export async function assertPortFree(port) {
  await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error(`Puerto ${port} ocupado. Detén el servicio que lo usa antes de pnpm dev.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolvePort));
  });
}

function run(command, args, env, cwd = root, capture = false) {
  const result = spawnSync(command, args, { cwd, env, stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.error || result.status !== 0) {
    // Never include argv/env/output: it may contain credentials.
    throw new Error(`Falló ${command}. Comprueba que esté instalado y revisa el error anterior.`);
  }
  return result.stdout?.trim();
}

async function checkTools() {
  const expectedNode = (await readFile(join(root, '.node-version'), 'utf8')).trim().replace(/^v/, '');
  if (process.versions.node !== expectedNode) throw new Error(`Usa Node.js ${expectedNode} (.node-version).`);
  const expectedGo = (await readFile(join(root, '.go-version'), 'utf8')).trim();
  const version = run('go', ['version'], process.env, root, true);
  if (!version.includes(`go${expectedGo} `)) throw new Error(`Instala Go ${expectedGo} y añade su binario a PATH (.go-version).`);
  const pnpm = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).packageManager.split('@')[1];
  if (run('pnpm', ['--version'], process.env, root, true) !== pnpm) throw new Error(`Usa pnpm ${pnpm}.`);
  run('docker', ['compose', 'version'], process.env, root, true);
  run('docker', ['info'], process.env, root, true);
}

export function projectName(directory) {
  return `cubeos-dev-${createHash('sha256').update(resolve(directory)).digest('hex').slice(0, 12)}`;
}

export function localEnv(config, inherited = process.env) {
  return { ...inherited, ...config,
    DATABASE_URL: `postgres://cubeos:${config.POSTGRES_PASSWORD}@127.0.0.1:${config.PG_PORT}/cubeos?sslmode=disable`,
    DEPLOYMENT_MODE: 'local', AUTH_MODE: 'local', LOCAL_CONTAINER: 'false',
    LISTEN_HOST: '127.0.0.1', PORT: '8080', ALLOWED_ORIGIN: 'http://localhost:3000',
    MEDIA_STORAGE: 'local', MEDIA_LOCAL_ROOT: join(root, '.cubeos/media'),
    MEDIA_TEMP_ROOT: join(root, '.cubeos/media-staging'),
    MEDIA_MAX_BYTES: '67108864', MEDIA_MAX_PIXELS: '80000000', RAILWAY_HEALTHCHECK: 'false',
    INGESTION_ADDRESS: '', SERIAL_PORT: '', SERIAL_SOURCE_ID: '', SERIAL_BAUD: '',
    CLERK_PUBLISHABLE_KEY: '', CLERK_SECRET_KEY: '',
  };
}

async function main(command) {
  if (!['setup', 'dev', 'stop'].includes(command)) throw new Error('Usa pnpm setup, pnpm dev o pnpm stop.');
  if (command !== 'stop') await checkTools();
  const config = await loadLocal(root, command !== 'stop');
  if (!config) { console.log('No existe configuración local; no hay nada que detener.'); return; }
  const env = localEnv(config);
  const project = projectName(root);
  const compose = ['compose', '--project-name', project, '--file', composeFile];
  if (command === 'stop') {
    run('docker', [...compose, 'stop', 'db'], env);
    console.log('PostgreSQL detenido; datos y fotos conservados. Web/API se detienen con Ctrl+C.');
    return;
  }
  if (command === 'dev') { await assertPortFree(3000); await assertPortFree(8080); }
  run('docker', [...compose, 'up', '--wait', '--wait-timeout', '90', '--detach', 'db'], env);
  await mkdir(env.MEDIA_LOCAL_ROOT, { recursive: true, mode: 0o700 });
  await mkdir(env.MEDIA_TEMP_ROOT, { recursive: true, mode: 0o700 });
  run('pnpm', ['--filter', '@cubeos/api', 'migrate'], env);
  console.log(`Entorno local preparado. Fotos en .cubeos/media; PostgreSQL en ${project}.`);
  if (command === 'setup') return;
  console.log('Web: http://localhost:3000 — API: http://localhost:8080');
  const grouped = process.platform !== 'win32';
  const child = spawn('pnpm', ['exec', 'turbo', 'run', 'dev'], { cwd: root, env, stdio: 'inherit', detached: grouped });
  const forward = signal => {
    try { if (grouped) process.kill(-child.pid, signal); else child.kill(signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => forward(signal));
  child.on('error', () => { console.error('No se pudo iniciar Turbo.'); process.exitCode = 1; });
  child.on('exit', (code, signal) => { process.exitCode = signal ? (signal === 'SIGINT' ? 130 : 143) : (code ?? 1); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
}
