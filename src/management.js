import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJson, writeJson, safeWorld } from './packs.js';
import { WorldStore, defaultSchedule, validateSchedule, nextRun, exists } from './worlds.js';
import { bedrockNetwork } from './network.js';

export function createManagement({ docker, inspect, container, containerName, configFile, dataDir, panelDir, backupDir, lock, unlock, job, onChange = () => {}, clock = Date.now }) {
  const store = new WorldStore(dataDir, backupDir, panelDir);
  const runtimeFile = path.join(panelDir, 'runtime.json'), scheduleFile = path.join(panelDir, 'backup-schedule.json');
  const containerJournal = path.join(panelDir, 'container-transaction.json'), backupJournal = path.join(panelDir, 'backup-operation.json');
  const settings = () => readJson(configFile, null);
  const runtime = () => readJson(runtimeFile, { pendingRestart: false, reason: '' });
  const schedule = () => readJson(scheduleFile, defaultSchedule);
  async function pending(reason) { await writeJson(runtimeFile, { pendingRestart: true, reason, changedAt: new Date(clock()).toISOString() }); onChange(); }
  async function applied() { await writeJson(runtimeFile, { pendingRestart: false, reason: '', appliedAt: new Date(clock()).toISOString() }); onChange(); }
  async function stopped() {
    const info = await inspect(); if (!info) throw new Error('Instala el servidor antes de continuar.');
    if (info.State.Paused || info.State.Restarting) throw new Error('El contenedor está pausado o reiniciándose. Espera antes de continuar.');
    if (info.State.Running) {
      job.message = 'Deteniendo Bedrock y esperando que guarde el mundo…';
      await container().stop({ t: 120 });
      const after = await inspect();
      if (!after || after.State.Running || after.State.ExitCode === 137 || after.State.OOMKilled) throw new Error('Bedrock no se detuvo limpiamente. No se modificaron los archivos. Revisa la consola y vuelve a iniciarlo antes de reintentar.');
    } else if (info.State.ExitCode === 137 || info.State.OOMKilled) throw new Error('El último cierre fue forzado. Inicia y detén Bedrock limpiamente antes de copiar o modificar su mundo.');
    return info.State.Running;
  }
  async function recoverContainer() {
    const tx = await readJson(containerJournal, null); if (!tx) return;
    const old = docker.getContainer(tx.oldId);
    if (tx.committed) { try { await old.remove(); } catch (e) { if (e.statusCode !== 404) throw e; } }
    else {
      let current; try { current = await container().inspect(); } catch (e) { if (e.statusCode !== 404) throw e; }
      if (current && current.Id !== tx.oldId) {
        if (current.Config.Labels?.['bedrock-panel.transaction'] !== tx.token || current.State.Running) throw new Error('Recuperación bloqueada: el contenedor cambió fuera del panel.');
        await container().remove();
      }
      const oldInfo = await old.inspect();
      if (oldInfo.Name !== `/${containerName}`) await old.rename({ name: containerName });
      await writeJson(configFile, tx.previous);
    }
    await fs.rm(containerJournal, { force: true });
  }
  async function selectWorld(name, create = false) {
    safeWorld(name); const c = await settings(); if (!c) throw new Error('Primero instala el servidor.');
    const dir = store.world(name);
    if (create && await exists(dir)) throw new Error('Ese mundo ya existe. Selecciónalo en la lista.');
    if (!create && !await exists(dir)) throw new Error('Mundo no encontrado.');
    await stopped();
    if (create) await fs.mkdir(dir, { recursive: true });
    await pending('Mundo cambiado. Inicia el servidor para cargarlo.');
    if (c.world === name) return { world: name };
    const info = await inspect(), token = randomUUID();
    const tx = { token, oldId: info.Id, previous: c, committed: false };
    await writeJson(containerJournal, tx);
    try {
      await container().rename({ name: `${containerName}-previous-${token.slice(0, 8)}` });
      const env = (info.Config.Env || []).filter(e => !e.startsWith('LEVEL_NAME=')); env.push(`LEVEL_NAME=${name}`);
      // Keep the same image, limits, port bindings and volumes. Docker cannot update Env in place.
      await docker.createContainer({ ...info.Config, name: containerName, Image: info.Image || info.Config.Image, Env: env, Labels: { ...info.Config.Labels, 'bedrock-panel.transaction': token }, HostConfig: info.HostConfig });
      await writeJson(configFile, { ...c, world: name });
      await writeJson(containerJournal, { ...tx, committed: true });
      await recoverContainer();
      return { world: name };
    } catch (e) { await recoverContainer(); throw e; }
  }
  async function migrateNetwork() {
    const c = await settings(); if (!c) throw new Error('Servidor no instalado.');
    const network = bedrockNetwork(c);
    const resume = await stopped();
    const info = await inspect(), token = randomUUID();
    const tx = { token, oldId: info.Id, previous: c, committed: false };
    await writeJson(containerJournal, tx);
    try {
      await container().rename({ name: `${containerName}-previous-${token.slice(0, 8)}` });
      const keys = network.Env.map(e => e.split('=')[0]);
      const env = (info.Config.Env || []).filter(e => !keys.includes(e.split('=')[0]));
      await docker.createContainer({ ...info.Config, name: containerName, Image: info.Image || info.Config.Image,
        Env: [...env, ...network.Env], ExposedPorts: network.ExposedPorts,
        Labels: { ...info.Config.Labels, 'bedrock-panel.transaction': token },
        HostConfig: { ...info.HostConfig, PortBindings: network.PortBindings } });
      if (resume) await container().start();
      await writeJson(containerJournal, { ...tx, committed: true });
      await recoverContainer();
    } catch (e) { await recoverContainer(); throw e; }
    onChange();
    return { port: c.port, udp: process.env.BEDROCK_UDP_RANGE || '19140-19239' };
  }
  async function backup(kind = 'manual', label = '') {
    const c = await settings(); if (!c) throw new Error('Primero instala el servidor.');
    if ((await runtime()).pendingRestart) throw new Error('Aplica los cambios pendientes iniciando el servidor antes de crear una copia.');
    const info = await inspect(); if (!info) throw new Error('Servidor no instalado.');
    await writeJson(backupJournal, { resume: !!info.State.Running, startedAt: new Date(clock()).toISOString(), kind });
    let result, failure;
    try {
      await stopped(); job.message = `Copiando y verificando el mundo ${c.world}…`;
      result = await store.snapshot(c.world, kind, label);
    } catch (e) { failure = e; }
    try {
      if (info.State.Running) { job.message = 'Volviendo a iniciar Bedrock…'; const state = await inspect(); if (state && !state.State.Running) await container().start(); }
      await fs.rm(backupJournal, { force: true });
    } catch (e) { throw new Error(`${failure ? failure.message : 'Copia guardada.'} No se pudo reanudar Bedrock: ${e.message}`); }
    if (failure) throw failure; onChange(); return result;
  }
  async function restore(id) {
    job.message = 'Verificando la integridad de la copia…';
    const meta = await store.verify(id);
    await stopped(); await pending('Restauración pendiente de inicio. Revisa el resultado antes de iniciar Bedrock.');
    const current = await settings();
    // Also preserve the currently active world when restoring a different world.
    if (current.world !== meta.world && await exists(path.join(store.world(current.world), 'level.dat'))) await store.snapshot(current.world, 'before-restore', 'Mundo activo antes de la restauración');
    job.message = 'Guardando el estado anterior y restaurando los archivos…';
    const result = await store.restore(id);
    if (current.world !== meta.world) await selectWorld(meta.world);
    await pending(`Se restauró ${meta.world}. Reinicia el servidor para aplicar esta versión.`);
    return result;
  }
  async function importWorld(name, file) {
    await stopped(); job.message = 'Validando e importando el mundo…';
    const result = await store.importWorld(name, file);
    await selectWorld(name); return result;
  }
  async function saveSchedule(input) {
    const parsed = validateSchedule(input), old = await schedule();
    if (parsed.enabled && !await settings()) throw new Error('Instala el servidor antes de activar las copias programadas.');
    const value = { ...parsed, nextRun: nextRun(parsed, clock()), lastRun: old.lastRun };
    await writeJson(scheduleFile, value); return value;
  }
  // A persisted due date gives one catch-up run after downtime, never a burst of missed backups.
  async function tick() {
    if (!lock()) return;
    try {
      const s = await schedule(); if (!s.enabled || !s.nextRun || Date.parse(s.nextRun) > clock()) return;
      if ((await runtime()).pendingRestart) return;
      job.status = 'running'; job.message = 'Iniciando copia programada…'; delete job.result;
      let lastRun;
      try {
        const result = await backup('scheduled'); await store.retain(s.retain);
        lastRun = { at: new Date(clock()).toISOString(), status: 'done', backupId: result.id }; job.status = 'done'; job.message = 'Copia programada completada.';
      } catch (e) { lastRun = { at: new Date(clock()).toISOString(), status: 'error', error: e.message }; job.status = 'error'; job.message = `Copia programada fallida: ${e.message}`; }
      await writeJson(scheduleFile, { ...s, lastRun, nextRun: lastRun.status === 'done' ? nextRun(s, clock()) : new Date(clock() + 15 * 60000).toISOString() });
      onChange();
    } finally { unlock(); }
  }
  async function recover() {
    await recoverContainer();
    if (await exists(store.journal)) { await stopped(); await store.recover(); await pending('Se recuperó una operación de mundo interrumpida. Revisa e inicia el servidor.'); }
    const interrupted = await readJson(backupJournal, null);
    if (interrupted) {
      if (interrupted.resume && !(await runtime()).pendingRestart) { const info = await inspect(); if (info && !info.State.Running) await container().start(); }
      await fs.rm(backupJournal, { force: true });
      job.status = 'error'; job.message = 'La copia anterior fue interrumpida. Solo se muestran copias finalizadas; revisa la programación.';
    }
  }
  return { store, runtime, pending, applied, stopped, selectWorld, migrateNetwork, backup, restore, importWorld, schedule, saveSchedule, tick, recover };
}
