import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { createApp, validateConfig, calculateMetrics } from '../src/server.js';
import { parsePacks, installPacks, listPacks, togglePack, readJson } from '../src/packs.js';

const id = '12345678-1234-1234-1234-123456789abc';
const resourceId = '12345678-1234-1234-1234-123456789def';
function archive(kind = 'data', uuid = id, extra = {}) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify({ format_version: 2, header: { uuid, version: [1, 0, 0], name: 'Test pack' }, modules: [{ type: kind }], ...extra })));
  zip.addFile('texts/en_US.lang', Buffer.from('pack.name=Test pack'));
  return zip.toBuffer();
}
const settings = { name: 'Mi servidor', world: 'Mundo', port: 19132, maxPlayers: 10, memoryMB: 2048, gamemode: 'survival', difficulty: 'normal', allowlist: true };
test('configuración: rechaza rutas y valores fuera de rango', () => {
  assert.deepEqual(validateConfig(settings), settings);
  assert.throws(() => validateConfig({ ...settings, world: '../escape' }));
  assert.throws(() => validateConfig({ ...settings, port: 70000 }));
  assert.throws(() => validateConfig({ ...settings, name: 'a\nEULA=TRUE' }));
});
test('métricas: calcula CPU multinúcleo, RAM sin caché y red', () => {
  const metrics = calculateMetrics({ cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 4 }, precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 500 }, memory_stats: { usage: 1024, limit: 4096, stats: { inactive_file: 256 } }, networks: { eth0: { rx_bytes: 100, tx_bytes: 200 } } });
  assert.equal(metrics.cpu, 80); assert.equal(metrics.memory, 768); assert.equal(metrics.rx, 100);
});
test('addons: reconoce ZIP y mcaddon con paquetes anidados', () => {
  const zip = new AdmZip(); zip.addFile('behavior.mcpack', archive()); zip.addFile('resources.mcpack', archive('resources', resourceId));
  const packs = parsePacks(zip.toBuffer()); assert.equal(packs.length, 2); assert.equal(packs[1].kind, 'resource');
});
test('addons: rechaza manifiestos inválidos y archivos vacíos', () => {
  assert.throws(() => parsePacks(archive('data', '../../outside')));
  assert.throws(() => parsePacks(new AdmZip().toBuffer()));
  assert.throws(() => parsePacks(Buffer.from('not a zip')));
});
test('addons: instala, activa y protege dependencias', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-pack-test-')); t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const behavior = archive('data', id, { dependencies: [{ uuid: resourceId, version: [1, 0, 0] }] });
  await assert.rejects(installPacks(dir, 'Mundo', behavior), /Dependencia/);
  const bundle = new AdmZip(); bundle.addFile('resource.mcpack', archive('resources', resourceId)); bundle.addFile('behavior.mcpack', behavior);
  await installPacks(dir, 'Mundo', bundle.toBuffer());
  const packs = await listPacks(dir, 'Mundo'); assert.equal(packs.length, 2); assert.ok(packs.every(p => p.enabled));
  assert.equal(await fs.readFile(path.join(dir, 'behavior_packs', id, 'texts/en_US.lang'), 'utf8'), 'pack.name=Test pack');
  await assert.rejects(togglePack(dir, 'Mundo', resourceId, false), /depende/);
  await togglePack(dir, 'Mundo', id, false); await togglePack(dir, 'Mundo', resourceId, false);
  assert.ok((await listPacks(dir, 'Mundo')).every(p => !p.enabled));
  await assert.rejects(togglePack(dir, 'Mundo', id, true), /dependencias/);
});
test('API: autenticación, CSRF, whitelist persistente y bloqueo con servidor activo', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-api-test-'));
  let running = false;
  const docker = { ping: async () => 'OK', getContainer: () => ({ inspect: async () => ({ Config: { Labels: { 'bedrock-panel.managed': 'true' } }, State: { Running: running, Status: running ? 'running' : 'exited' } }) }) };
  await fs.mkdir(path.join(dir, 'panel')); await fs.writeFile(path.join(dir, 'panel/server.json'), JSON.stringify(settings));
  const app = createApp({ docker, password: 'test-password-123456', dataDir: path.join(dir, 'data'), panelDir: path.join(dir, 'panel'), backupDir: path.join(dir, 'backups'), scheduler: false });
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/login`, { method: 'POST' })).status, 403);
  const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'X-Panel-Request': '1', 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'test-password-123456' }) });
  assert.equal(login.status, 200);
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'X-Panel-Request': '1', 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/api/status`, { headers })).status, 200);
  const add = name => fetch(`${base}/api/allowlist`, { method: 'POST', headers, body: JSON.stringify({ name }) });
  assert.equal((await add('Player One')).status, 200);
  assert.equal((await readJson(path.join(dir, 'data/allowlist.json'), []))[0].name, 'Player One');
  assert.equal((await add('Player One')).status, 400);
  running = true; assert.equal((await add('Player Two')).status, 409);
  assert.equal((await fetch(`${base}/api/logout`, { method: 'POST', headers })).status, 200);
  assert.equal((await fetch(`${base}/api/status`, { headers })).status, 401);
});
