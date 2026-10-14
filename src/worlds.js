import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { readJson, writeJson, safeWorld } from './packs.js';

export const exists = async file => { try { await fs.lstat(file); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
export function inside(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..' || /[:\x00-\x1f]/.test(p) || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p))) throw new Error('Ruta no segura.');
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Ruta fuera del directorio permitido.');
  return target;
}
export async function walk(root, relative = '') {
  const directory = relative ? inside(root, relative) : root;
  const stat = await fs.lstat(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Se esperaba un directorio sin enlaces simbólicos.');
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error('No se admiten enlaces simbólicos en los mundos.');
    if (entry.isDirectory()) files.push(...await walk(root, name));
    else if (entry.isFile()) { const info = await fs.stat(inside(root, name)); files.push({ name, size: info.size, mtime: info.mtimeMs }); }
    else throw new Error('El mundo contiene un archivo especial no compatible.');
  }
  return files;
}
export async function folderUsage(dir) {
  if (!await exists(dir)) return { bytes: 0, files: 0 };
  const files = await walk(dir); return { bytes: files.reduce((n, f) => n + f.size, 0), files: files.length };
}
async function digest(file) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk); return hash.digest('hex');
}
async function ensureCapacity(dir, bytes) {
  await fs.mkdir(dir, { recursive: true });
  const stat = await fs.statfs(dir);
  if (stat.bavail * stat.bsize < bytes + 64 * 1024 * 1024) throw new Error('Espacio insuficiente. Se requiere el tamaño del mundo más 64 MB libres.');
}
async function validWorld(dir) {
  const level = await fs.lstat(path.join(dir, 'level.dat')).catch(() => null);
  const db = await fs.lstat(path.join(dir, 'db')).catch(() => null);
  if (!level?.isFile() || !db?.isDirectory() || level.isSymbolicLink() || db.isSymbolicLink()) throw new Error('El mundo debe contener level.dat y una carpeta db de Bedrock.');
}
export class WorldStore {
  constructor(dataDir, backupDir, panelDir) {
    this.worldsDir = path.resolve(dataDir, 'worlds'); this.backupDir = path.resolve(backupDir); this.journal = path.resolve(panelDir, 'world-transaction.json');
    if (this.backupDir === this.worldsDir || this.backupDir.startsWith(this.worldsDir + path.sep)) throw new Error('Las copias deben guardarse fuera de worlds.');
  }
  world(name) { return inside(this.worldsDir, safeWorld(name)); }
  backup(id) { if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error('Identificador de copia inválido.'); return inside(this.backupDir, id); }
  async listWorlds(active) {
    await fs.mkdir(this.worldsDir, { recursive: true });
    const worlds = [];
    for (const entry of await fs.readdir(this.worldsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      try {
        const dir = this.world(entry.name); const files = await walk(dir);
        worlds.push({ name: entry.name, active: entry.name === active, bytes: files.reduce((n, f) => n + f.size, 0), files: files.length, modifiedAt: files.length ? new Date(files.reduce((n, f) => Math.max(n, f.mtime), 0)).toISOString() : null, generated: files.some(f => f.name === 'level.dat') });
      } catch (e) { worlds.push({ name: entry.name, error: e.message, active: entry.name === active }); }
    }
    return worlds.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  }
  async listBackups() {
    await fs.mkdir(this.backupDir, { recursive: true });
    const items = [];
    for (const entry of await fs.readdir(this.backupDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/.test(entry.name)) continue;
      const meta = await readJson(path.join(this.backup(entry.name), 'metadata.json'), null);
      if (meta?.id === entry.name && meta.complete) { const { manifest, ...publicMeta } = meta; items.push(publicMeta); }
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async snapshot(world, kind = 'manual', label = '') {
    const start = Date.now(), source = this.world(world);
    await validWorld(source);
    const files = await walk(source), bytes = files.reduce((n, f) => n + f.size, 0);
    await ensureCapacity(this.backupDir, bytes);
    const id = randomUUID(), stage = inside(this.backupDir, `.partial-${id}`);
    await fs.mkdir(path.join(stage, 'world'), { recursive: true });
    try {
      const manifest = [];
      for (const file of files) {
        const target = inside(path.join(stage, 'world'), file.name);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(inside(source, file.name), target);
        manifest.push({ name: file.name, size: file.size, sha256: await digest(target) });
      }
      const meta = { id, world, kind, label: String(label).slice(0, 100), createdAt: new Date().toISOString(), bytes, files: files.length, durationMs: Date.now() - start, complete: true, manifest };
      await writeJson(path.join(stage, 'metadata.json'), meta);
      await fs.rename(stage, this.backup(id));
      const { manifest: _, ...result } = meta; return result;
    } catch (e) { await fs.rm(stage, { recursive: true, force: true, maxRetries: 3 }); throw e; }
  }
  async verify(id) {
    const root = this.backup(id), meta = await readJson(path.join(root, 'metadata.json'), null);
    if (!meta?.complete || meta.id !== id || !Array.isArray(meta.manifest) || !meta.manifest.length) throw new Error('Copia incompleta o inválida.');
    const source = path.join(root, 'world'); await validWorld(source);
    const actual = await walk(source);
    if (actual.length !== meta.manifest.length) throw new Error('La copia tiene archivos faltantes o adicionales.');
    const unique = new Set();
    for (const file of meta.manifest) {
      const target = inside(source, file.name); if (unique.has(file.name)) throw new Error('Manifiesto duplicado.'); unique.add(file.name);
      const stat = await fs.lstat(target);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== file.size || await digest(target) !== file.sha256) throw new Error(`La integridad de la copia falló: ${file.name}`);
    }
    return meta;
  }
  async restore(id) {
    const meta = await this.verify(id), target = this.world(meta.world);
    let safety = null;
    if (await exists(path.join(target, 'level.dat'))) safety = await this.snapshot(meta.world, 'before-restore', 'Antes de restaurar otra versión');
    await ensureCapacity(this.worldsDir, meta.bytes);
    const token = randomUUID(), stage = inside(this.worldsDir, `.restore-${token}`), previous = inside(this.worldsDir, `.previous-${token}`);
    await fs.mkdir(stage);
    try {
      for (const file of meta.manifest) {
        const dest = inside(stage, file.name); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.copyFile(inside(path.join(this.backup(id), 'world'), file.name), dest);
        if (await digest(dest) !== file.sha256) throw new Error('La verificación de la restauración falló.');
      }
      // Persist intent before any rename. An interrupted swap rolls back at startup.
      const transaction = { world: meta.world, token, hadPrevious: await exists(target), committed: false };
      await writeJson(this.journal, transaction);
      if (transaction.hadPrevious) await fs.rename(target, previous);
      await fs.rename(stage, target);
      await writeJson(this.journal, { ...transaction, committed: true });
      await this.recover();
      return { world: meta.world, safetyBackup: safety?.id || null };
    } catch (e) { await this.recover(); await fs.rm(stage, { recursive: true, force: true, maxRetries: 3 }); throw e; }
  }
  async recover() {
    const tx = await readJson(this.journal, null); if (!tx) return;
    if (!/^[0-9a-f-]{36}$/.test(tx.token)) throw new Error('Transacción de mundo inválida.');
    const target = this.world(tx.world), previous = inside(this.worldsDir, `.previous-${tx.token}`), stage = inside(this.worldsDir, `.restore-${tx.token}`);
    if (!tx.committed && await exists(previous)) { await fs.rm(target, { recursive: true, force: true, maxRetries: 3 }); await fs.rename(previous, target); }
    else if (!tx.committed && !tx.hadPrevious) await fs.rm(target, { recursive: true, force: true, maxRetries: 3 });
    if (tx.committed) await fs.rm(previous, { recursive: true, force: true, maxRetries: 3 });
    await fs.rm(stage, { recursive: true, force: true, maxRetries: 3 }); await fs.rm(this.journal, { force: true });
  }
  async importWorld(name, archivePath) {
    const target = this.world(name); if (await exists(target)) throw new Error('Ya existe un mundo con ese nombre. Usa otro nombre para conservarlo.');
    const zip = new AdmZip(archivePath), entries = zip.getEntries();
    let expanded = 0;
    if (entries.length > 50000) throw new Error('Demasiados archivos en el mundo.');
    for (const e of entries) {
      const n = e.entryName.replace(/\/$/, ''); inside(this.worldsDir, n);
      if (((e.attr >>> 16) & 0xf000) === 0xa000) throw new Error('El archivo contiene enlaces simbólicos.');
      expanded += e.header.size;
      if (expanded > 4 * 1024 ** 3 || e.header.size > 256 * 1024 ** 2) throw new Error('Límite expandido: 4 GB; archivo individual: 256 MB.');
    }
    const levels = entries.filter(e => /(^|\/)level\.dat$/.test(e.entryName));
    if (levels.length !== 1) throw new Error('Sube un solo mundo Bedrock con level.dat.');
    const prefix = levels[0].entryName.slice(0, -9);
    const selected = entries.filter(e => !e.isDirectory && e.entryName.startsWith(prefix));
    if (!selected.some(e => e.entryName.startsWith(`${prefix}db/`))) throw new Error('El mundo no contiene la base de datos db.');
    await ensureCapacity(this.worldsDir, expanded);
    const stage = inside(this.worldsDir, `.import-${randomUUID()}`); await fs.mkdir(stage);
    try {
      const names = new Set();
      for (const e of selected) {
        const name = e.entryName.slice(prefix.length); const folded = name.toLowerCase();
        if (names.has(folded)) throw new Error('El ZIP contiene nombres duplicados.'); names.add(folded);
        const dest = inside(stage, name); await fs.mkdir(path.dirname(dest), { recursive: true }); await fs.writeFile(dest, e.getData());
      }
      await validWorld(stage); await fs.rename(stage, target);
      return { name, bytes: expanded };
    } catch (e) { await fs.rm(stage, { recursive: true, force: true, maxRetries: 3 }); throw e; }
  }
  async removeBackup(id) { await fs.rm(this.backup(id), { recursive: true, force: false, maxRetries: 3 }); }
  async retain(count) {
    const scheduled = (await this.listBackups()).filter(b => b.kind === 'scheduled');
    for (const backup of scheduled.slice(count)) await this.removeBackup(backup.id);
  }
}

export function validateSchedule(input) {
  if (typeof input.enabled !== 'boolean' || !['daily', 'interval'].includes(input.mode)) throw new Error('Programación inválida.');
  const intervalHours = Number(input.intervalHours), retain = Number(input.retain);
  if (!Number.isInteger(intervalHours) || intervalHours < 1 || intervalHours > 168 || !Number.isInteger(retain) || retain < 1 || retain > 100) throw new Error('Intervalo: 1–168 horas. Retención: 1–100 copias.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Hora inválida. Usa HH:mm.');
  try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(); } catch { throw new Error('Zona horaria inválida.'); }
  if (typeof input.timezone !== 'string' || input.timezone.length > 80) throw new Error('Zona horaria inválida.');
  return { enabled: input.enabled, mode: input.mode, intervalHours, retain, time: input.time, timezone: input.timezone };
}
export const defaultSchedule = { enabled: false, mode: 'daily', intervalHours: 6, retain: 7, time: '03:00', timezone: 'America/Mexico_City', nextRun: null, lastRun: null };
export function nextRun(schedule, now = Date.now()) {
  if (!schedule.enabled) return null;
  if (schedule.mode === 'interval') return new Date(now + schedule.intervalHours * 3600000).toISOString();
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: schedule.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let minute = Math.floor(now / 60000) + 1; minute <= Math.floor(now / 60000) + 3000; minute++) {
    if (formatter.format(minute * 60000) === schedule.time) return new Date(minute * 60000).toISOString();
  }
  throw new Error('No se encontró la siguiente ejecución para esta zona horaria.');
}
