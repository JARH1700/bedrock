import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const packKinds = ['behavior', 'resource'];
export async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}
export async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2));
  await fs.rename(temp, file);
}
export function safeWorld(name) {
  if (typeof name !== 'string' || name !== name.trim() || !/^[\p{L}\p{N} _-]{1,64}$/u.test(name) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(name)) throw new Error('Nombre de mundo inválido. Usa letras, números, espacios internos, guiones o guiones bajos.');
  return name;
}
export function parsePacks(buffer) {
  const packs = [];
  const budget = { bytes: 0, files: 0 };
  function unpack(data, depth = 0) {
    if (depth > 2) throw new Error('Demasiados archivos anidados.');
    const zip = new AdmZip(data);
    const entries = zip.getEntries();
    for (const entry of entries) {
      const name = entry.entryName;
      if (name.includes('\\') || name.startsWith('/') || name.split('/').some(s => s === '..' || s.includes(':')) || /[\x00-\x1f]/.test(name)) throw new Error('El ZIP contiene una ruta no segura.');
      if (((entry.attr >>> 16) & 0xf000) === 0xa000) throw new Error('No se permiten enlaces simbólicos.');
      budget.files++;
      budget.bytes += entry.header.size;
      if (budget.files > 15000 || budget.bytes > 512 * 1024 * 1024 || entry.header.size > 64 * 1024 * 1024) throw new Error('El contenido descomprimido excede los límites permitidos.');
    }
    const manifests = entries.filter(e => !e.isDirectory && /(^|\/)manifest\.json$/i.test(e.entryName));
    for (const entry of manifests) {
      const manifest = JSON.parse(entry.getData().toString('utf8').replace(/^\uFEFF/, ''));
      const h = manifest.header;
      if (!h || !UUID.test(h.uuid) || !Array.isArray(h.version) || h.version.length !== 3 || !h.version.every(n => Number.isInteger(n) && n >= 0)) throw new Error('manifest.json requiere un UUID y una versión [mayor, menor, parche] válidos.');
      const types = (manifest.modules || []).map(m => m.type);
      const kind = types.includes('resources') ? 'resource' : types.some(t => ['data', 'script'].includes(t)) ? 'behavior' : null;
      if (!kind) throw new Error('Solo se admiten paquetes de comportamiento y recursos de Bedrock.');
      const root = entry.entryName.slice(0, -'manifest.json'.length);
      const files = entries.filter(e => !e.isDirectory && e.entryName.startsWith(root) && !manifests.some(m => m !== entry && m.entryName.startsWith(root) && e.entryName.startsWith(m.entryName.slice(0, -13))));
      if (packs.some(p => p.id === h.uuid.toLowerCase())) throw new Error('El archivo contiene UUID duplicados.');
      packs.push({ id: h.uuid.toLowerCase(), name: String(h.name || 'Paquete sin nombre'), description: String(h.description || ''), version: h.version, kind, dependencies: manifest.dependencies || [], files: files.map(e => ({ name: e.entryName.slice(root.length), data: e.getData() })) });
    }
    for (const entry of entries.filter(e => !e.isDirectory && /\.(mcpack|mcaddon|mcpe)$/i.test(e.entryName))) unpack(entry.getData(), depth + 1);
  }
  unpack(buffer);
  if (!packs.length) throw new Error('No se encontró manifest.json. El archivo debe ser un paquete Bedrock sin cifrar.');
  return packs;
}
export async function listPacks(dataDir, world) {
  const result = [];
  for (const kind of packKinds) {
    const refs = await readJson(path.join(dataDir, 'worlds', safeWorld(world), `world_${kind}_packs.json`), []);
    const dir = path.join(dataDir, `${kind}_packs`);
    const folders = await fs.readdir(dir, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
    for (const folder of folders.filter(f => f.isDirectory())) {
      const manifest = await readJson(path.join(dir, folder.name, 'manifest.json'), null);
      if (manifest?.header) result.push({ id: manifest.header.uuid, name: manifest.header.name, description: manifest.header.description, version: manifest.header.version, kind, enabled: refs.some(r => r.pack_id.toLowerCase() === manifest.header.uuid.toLowerCase()), managed: folder.name === manifest.header.uuid.toLowerCase(), dependencies: manifest.dependencies || [] });
    }
  }
  return result;
}
export async function installPacks(dataDir, world, buffer) {
  const packs = parsePacks(buffer);
  const existing = await listPacks(dataDir, world);
  const available = [...existing.filter(p => !packs.some(n => n.id === p.id.toLowerCase())), ...packs];
  for (const pack of packs) for (const dep of pack.dependencies) {
    if (dep.uuid && !available.some(p => p.id.toLowerCase() === dep.uuid.toLowerCase() && JSON.stringify(p.version) === JSON.stringify(dep.version) && (p.enabled !== false || packs.includes(p)))) throw new Error(`Dependencia faltante o desactivada: ${dep.uuid}. Incluye ambos paquetes en el ZIP.`);
  }
  const transaction = path.join(dataDir, `.upload-${randomUUID()}`);
  await fs.mkdir(transaction, { recursive: true });
  const changes = [];
  try {
    for (const pack of packs) {
      const staging = path.join(transaction, pack.id);
      for (const file of pack.files) {
        const target = path.resolve(staging, file.name);
        if (!target.startsWith(path.resolve(staging) + path.sep)) throw new Error('Ruta de paquete inválida.');
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.data);
      }
      const target = path.join(dataDir, `${pack.kind}_packs`, pack.id);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const backup = path.join(transaction, `${pack.id}-previous`);
      let hadPrevious = false;
      try { await fs.rename(target, backup); hadPrevious = true; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      changes.push({ target, backup, hadPrevious });
      await fs.rename(staging, target);
    }
    for (const kind of packKinds) {
      const file = path.join(dataDir, 'worlds', safeWorld(world), `world_${kind}_packs.json`);
      const previous = await readJson(file, []);
      const next = previous.filter(p => !packs.some(n => n.id === p.pack_id.toLowerCase()));
      next.push(...packs.filter(p => p.kind === kind).map(p => ({ pack_id: p.id, version: p.version })));
      changes.push({ file, previous });
      await writeJson(file, next);
    }
  } catch (e) {
    for (const change of changes.reverse()) {
      if (change.file) await writeJson(change.file, change.previous);
      else { await fs.rm(change.target, { recursive: true, force: true }); if (change.hadPrevious) await fs.rename(change.backup, change.target); }
    }
    throw e;
  } finally { await fs.rm(transaction, { recursive: true, force: true }); }
  return packs.map(({ files, ...pack }) => pack);
}
export async function togglePack(dataDir, world, id, enabled) {
  const packs = await listPacks(dataDir, world);
  const pack = packs.find(p => p.id === id);
  if (!pack) throw new Error('Paquete no encontrado.');
  if (!enabled && packs.some(p => p.enabled && p.dependencies.some(d => d.uuid?.toLowerCase() === id.toLowerCase()))) throw new Error('Otro paquete activo depende de este paquete. Desactívalo primero.');
  if (enabled && pack.dependencies.some(d => d.uuid && !packs.some(p => p.enabled && p.id.toLowerCase() === d.uuid.toLowerCase() && JSON.stringify(p.version) === JSON.stringify(d.version)))) throw new Error('Activa primero las dependencias de este paquete.');
  const file = path.join(dataDir, 'worlds', safeWorld(world), `world_${pack.kind}_packs.json`);
  const refs = (await readJson(file, [])).filter(r => r.pack_id.toLowerCase() !== id.toLowerCase());
  if (enabled) refs.push({ pack_id: id, version: pack.version });
  await writeJson(file, refs);
}
