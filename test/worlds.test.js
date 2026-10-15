import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { WorldStore, inside, defaultSchedule, nextRun, validateSchedule } from '../src/worlds.js';
import { writeJson, readJson } from '../src/packs.js';
import { createManagement } from '../src/management.js';
import { calculateMetrics, rates, parsePong } from '../src/metrics.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-world-'));
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
  const dataDir = path.join(root, 'data'), backupDir = path.join(root, 'backups'), panelDir = path.join(root, 'panel');
  const store = new WorldStore(dataDir, backupDir, panelDir);
  const world = store.world('Original'); await fs.mkdir(path.join(world, 'db'), { recursive: true });
  await fs.writeFile(path.join(world, 'level.dat'), 'level-v1'); await fs.writeFile(path.join(world, 'db', '001.ldb'), 'blocks-v1');
  return { root, dataDir, backupDir, panelDir, store, world };
}
test('copias: restaura los bytes anteriores y conserva una copia previa protegida', async t => {
  const f = await fixture(t), first = await f.store.snapshot('Original');
  await fs.writeFile(path.join(f.world, 'db', '001.ldb'), 'blocks-v2'); await fs.writeFile(path.join(f.world, 'db', '002.ldb'), 'new-file');
  const result = await f.store.restore(first.id);
  assert.ok(result.safetyBackup); assert.equal(await fs.readFile(path.join(f.world, 'db', '001.ldb'), 'utf8'), 'blocks-v1');
  await assert.rejects(fs.stat(path.join(f.world, 'db', '002.ldb')), { code: 'ENOENT' });
  const safety = await f.store.verify(result.safetyBackup); assert.equal(safety.kind, 'before-restore'); assert.equal(safety.files, 3);
  assert.equal((await f.store.listBackups()).length, 2);
});
test('copias: la verificación detecta contenido alterado y no reemplaza el mundo', async t => {
  const f = await fixture(t), backup = await f.store.snapshot('Original');
  await fs.writeFile(path.join(f.store.backup(backup.id), 'world', 'db', '001.ldb'), 'tampered!');
  await assert.rejects(f.store.restore(backup.id), /integridad/);
  assert.equal(await fs.readFile(path.join(f.world, 'db', '001.ldb'), 'utf8'), 'blocks-v1');
  assert.equal((await f.store.listBackups()).length, 1);
});
test('copias: una interrupción durante el intercambio recupera el mundo anterior', async t => {
  const f = await fixture(t), token = randomUUID();
  await fs.rename(f.world, path.join(f.store.worldsDir, `.previous-${token}`));
  await fs.mkdir(f.world); await fs.writeFile(path.join(f.world, 'partial'), 'bad');
  await writeJson(f.store.journal, { token, world: 'Original', committed: false, hadPrevious: true });
  await f.store.recover();
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'level-v1');
  await assert.rejects(fs.stat(path.join(f.world, 'partial')), { code: 'ENOENT' });
});
test('mundos: importa mcworld con carpeta contenedora y rechaza sobrescrituras', async t => {
  const f = await fixture(t), zip = new AdmZip(), archive = path.join(f.root, 'world.mcworld');
  zip.addFile('Export/level.dat', Buffer.from('my-world')); zip.addFile('Export/db/001.ldb', Buffer.from('my-blocks')); zip.writeZip(archive);
  await f.store.importWorld('Importado', archive);
  assert.equal(await fs.readFile(path.join(f.store.world('Importado'), 'db', '001.ldb'), 'utf8'), 'my-blocks');
  await assert.rejects(f.store.importWorld('Importado', archive), /Ya existe/);
  assert.throws(() => inside(f.root, '../escape')); assert.throws(() => inside(f.root, 'a/../../escape')); assert.throws(() => inside(f.root, 'C:/escape'));
  assert.throws(() => f.store.backup('../../bad'));
});
test('mundos: rechaza ZIP sin level.dat y sin db sin crear destino', async t => {
  const f = await fixture(t), zip = new AdmZip(), archive = path.join(f.root, 'bad.zip');
  zip.addFile('level.dat', Buffer.from('world')); zip.writeZip(archive);
  await assert.rejects(f.store.importWorld('Invalido', archive), /base de datos/);
  await assert.rejects(fs.stat(f.store.world('Invalido')), { code: 'ENOENT' });
});
test('programación: calcula zona horaria, intervalo y valida entradas', () => {
  const s = validateSchedule({ ...defaultSchedule, enabled: true, timezone: 'UTC', time: '03:00' });
  assert.equal(nextRun(s, Date.parse('2026-09-21T02:30:00Z')), '2026-09-21T03:00:00.000Z');
  assert.equal(nextRun(s, Date.parse('2026-09-21T03:00:00Z')), '2026-09-22T03:00:00.000Z');
  assert.equal(nextRun({ ...s, timezone: 'Asia/Tokyo' }, Date.parse('2026-09-21T16:00:00Z')), '2026-09-21T18:00:00.000Z');
  assert.equal(nextRun({ ...s, mode: 'interval', intervalHours: 6 }, 0), '1970-01-01T06:00:00.000Z');
  assert.equal(nextRun(defaultSchedule), null);
  assert.throws(() => validateSchedule({ ...s, retain: 0 })); assert.throws(() => validateSchedule({ ...s, timezone: 'invalid' }));
});

async function managerFixture(t) {
  const f = await fixture(t), records = new Map(), calls = [], name = 'test-bedrock';
  records.set('old', { Id: 'old', Name: `/${name}`, Image: 'sha256:original', Config: { Image: 'itzg/minecraft-bedrock-server:latest', Env: ['LEVEL_NAME=Original', 'MAX_PLAYERS=10'], Labels: { 'bedrock-panel.managed': 'true' } }, HostConfig: { Binds: ['volume:/data'], Memory: 1024 }, State: { Running: true, ExitCode: 0, Status: 'running' } });
  let failCreate = false, forceExit = false, locked = false, now = Date.parse('2026-09-21T00:00:00Z');
  function lookup(id) { const record = records.get(id) || [...records.values()].find(r => r.Name === `/${id}`); if (!record) { const e = new Error('not found'); e.statusCode = 404; throw e; } return record; }
  const docker = {
    getContainer(id) { return {
      async inspect() { return structuredClone(lookup(id)); },
      async stop() { const r = lookup(id); calls.push('stop'); r.State.Running = false; r.State.Status = 'exited'; r.State.ExitCode = forceExit ? 137 : 0; },
      async start() { calls.push('start'); lookup(id).State.Running = true; lookup(id).State.Status = 'running'; },
      async rename({ name }) { calls.push('rename'); lookup(id).Name = `/${name}`; },
      async remove() { calls.push('remove'); records.delete(lookup(id).Id); }
    }; },
    async createContainer(options) {
      calls.push('create'); if (failCreate) throw new Error('Docker create failed');
      const id = randomUUID(); records.set(id, { Id: id, Name: `/${options.name}`, Image: options.Image, Config: options, HostConfig: options.HostConfig, State: { Running: false, Status: 'created', ExitCode: 0 } }); return this.getContainer(id);
    }
  };
  const configFile = path.join(f.panelDir, 'server.json'); await writeJson(configFile, { world: 'Original', maxPlayers: 10 });
  const job = { status: 'idle', message: '' };
  const manager = createManagement({ ...f, docker, configFile, containerName: name, container: () => docker.getContainer(name), inspect: () => docker.getContainer(name).inspect(), lock: () => { if (locked) return false; locked = true; return true; }, unlock: () => locked = false, job, clock: () => now });
  return { ...f, manager, docker, calls, records, configFile, job, failCreate: () => failCreate = true, forceExit: () => forceExit = true, advance: () => now += 3600001, setLocked: value => locked = value, inspect: () => docker.getContainer(name).inspect() };
}
test('migración de red conserva mundo, imagen, memoria y volumen y reanuda el servidor', async t => {
  const f = await managerFixture(t);
  await writeJson(f.configFile, { world: 'Original', maxPlayers: 10, port: 19132 });
  await f.manager.migrateNetwork();
  const info = await f.inspect();
  assert.equal(info.State.Running, true);
  assert.equal(info.Image, 'sha256:original');
  assert.deepEqual(info.HostConfig.Binds, ['volume:/data']);
  assert.equal(info.HostConfig.Memory, 1024);
  assert.ok(info.Config.Env.includes('LEVEL_NAME=Original'));
  assert.deepEqual(info.HostConfig.PortBindings['19132/tcp'], [{ HostPort: '19132' }]);
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'level-v1');
});
test('migración de red recupera el contenedor anterior si falla Docker', async t => {
  const f = await managerFixture(t); f.failCreate();
  await writeJson(f.configFile, { world: 'Original', maxPlayers: 10, port: 19132 });
  await assert.rejects(f.manager.migrateNetwork(), /Docker create failed/);
  assert.equal((await f.inspect()).Id, 'old');
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'level-v1');
});
test('cambio de mundo: detiene primero, cambia LEVEL_NAME y queda con reinicio pendiente', async t => {
  const f = await managerFixture(t); await f.manager.selectWorld('Nuevo', true);
  assert.deepEqual(f.calls, ['stop', 'rename', 'create', 'remove']);
  const info = await f.inspect(); assert.equal(info.State.Running, false); assert.ok(info.Config.Env.includes('LEVEL_NAME=Nuevo')); assert.equal(info.Image, 'sha256:original'); assert.equal(info.HostConfig.Memory, 1024);
  assert.equal((await readJson(f.configFile)).world, 'Nuevo'); assert.equal((await f.manager.runtime()).pendingRestart, true);
  assert.equal(await fs.readFile(path.join(f.world, 'level.dat'), 'utf8'), 'level-v1');
});
test('cambio de mundo: si Docker falla se recupera el contenedor y la configuración anteriores', async t => {
  const f = await managerFixture(t); f.failCreate(); await assert.rejects(f.manager.selectWorld('Nuevo', true), /Docker create failed/);
  assert.equal((await f.inspect()).Id, 'old'); assert.equal((await readJson(f.configFile)).world, 'Original'); assert.equal((await f.inspect()).State.Running, false);
});
test('cambio de mundo: no toca los mundos después de un cierre forzado', async t => {
  const f = await managerFixture(t); f.forceExit(); await assert.rejects(f.manager.selectWorld('Nuevo', true), /no se detuvo limpiamente/);
  assert.deepEqual(f.calls, ['stop']); assert.equal((await readJson(f.configFile)).world, 'Original'); await assert.rejects(fs.stat(f.store.world('Nuevo')), { code: 'ENOENT' });
});
test('copia manual: detiene, verifica, reanuda; restauración queda detenida', async t => {
  const f = await managerFixture(t), backup = await f.manager.backup(); assert.deepEqual(f.calls, ['stop', 'start']); assert.equal((await f.inspect()).State.Running, true);
  await fs.writeFile(path.join(f.world, 'db', '001.ldb'), 'modified');
  await f.manager.restore(backup.id); assert.equal((await f.inspect()).State.Running, false); assert.equal((await f.manager.runtime()).pendingRestart, true);
  assert.equal(await fs.readFile(path.join(f.world, 'db', '001.ldb'), 'utf8'), 'blocks-v1');
});
test('programación: ejecuta sin navegador, respeta el bloqueo y retiene solo copias automáticas', async t => {
  const f = await managerFixture(t); await f.manager.backup('manual');
  await f.manager.saveSchedule({ ...defaultSchedule, enabled: true, mode: 'interval', intervalHours: 1, retain: 2 });
  f.advance(); f.setLocked(true); await f.manager.tick(); assert.equal((await f.store.listBackups()).length, 1);
  f.setLocked(false);
  for (let i = 0; i < 4; i++) { await f.manager.tick(); f.advance(); }
  const backups = await f.store.listBackups(); assert.equal(backups.filter(b => b.kind === 'scheduled').length, 2); assert.equal(backups.filter(b => b.kind === 'manual').length, 1);
  assert.equal((await f.manager.schedule()).lastRun.status, 'done'); assert.equal((await f.inspect()).State.Running, true);
});
test('métricas: velocidades se reinician al recrear el contenedor y no inventan contadores faltantes', () => {
  assert.equal(calculateMetrics({}).memory, null); assert.equal(calculateMetrics({}).diskRead, null);
  const prev = { at: 1000, identity: 'a', rx: 100, tx: 50 }, current = { at: 3000, identity: 'a', rx: 500, tx: 150 };
  assert.equal(rates(current, prev).rxRate, 200); assert.equal(rates({ ...current, identity: 'b' }, prev).rxRate, null); assert.equal(rates({ ...current, rx: 0 }, prev).rxRate, null);
});
test('métricas: valida el pong de Bedrock y su marca de tiempo', () => {
  const stamp = Buffer.alloc(8), text = Buffer.from('MCPE;Test;827;1.21;3;10;123;World;Survival;1;19132;19133;'), length = Buffer.alloc(2); length.writeUInt16BE(text.length);
  const packet = Buffer.concat([Buffer.from([0x1c]), stamp, Buffer.alloc(8), Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex'), length, text]);
  assert.equal(parsePong(packet, stamp).players, 3); assert.equal(parsePong(packet, stamp).version, '1.21'); assert.equal(parsePong(packet, Buffer.alloc(8, 1)), null); assert.equal(parsePong(packet.subarray(0, 30), stamp), null);
});
