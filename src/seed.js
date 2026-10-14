import fs from 'node:fs/promises';
import path from 'node:path';
import { safeWorld } from './packs.js';

export function parseLevelSeed(buffer) {
  if (buffer.length < 12 || buffer.length > 2 * 1024 * 1024) throw new Error('level.dat inválido o demasiado grande.');
  const length = buffer.readUInt32LE(4);
  if (length !== buffer.length - 8) throw new Error('level.dat incompleto. Vuelve a intentarlo cuando el mundo termine de guardarse.');
  let offset = 8, tags = 0;
  function take(n) { if (!Number.isSafeInteger(n) || n < 0 || offset + n > buffer.length) throw new Error('NBT incompleto.'); const at = offset; offset += n; return at; }
  const byte = () => buffer.readUInt8(take(1));
  const string = () => { const size = buffer.readUInt16LE(take(2)); const at = take(size); return buffer.toString('utf8', at, at + size); };
  function count() { const n = buffer.readInt32LE(take(4)); if (n < 0 || n > 100000) throw new Error('Lista NBT fuera de límite.'); return n; }
  function payload(type, depth = 0) {
    if (++tags > 100000 || depth > 32) throw new Error('NBT demasiado complejo.');
    switch (type) {
      case 1: return buffer.readInt8(take(1));
      case 2: return buffer.readInt16LE(take(2));
      case 3: return buffer.readInt32LE(take(4));
      case 4: return buffer.readBigInt64LE(take(8)).toString();
      case 5: return buffer.readFloatLE(take(4));
      case 6: return buffer.readDoubleLE(take(8));
      case 7: take(count()); return null;
      case 8: return string();
      case 9: { const child = byte(), n = count(); if (!child && n) throw new Error('Lista NBT inválida.'); return Array.from({ length: n }, () => payload(child, depth + 1)); }
      case 10: { const result = Object.create(null); for (;;) { const child = byte(); if (!child) return result; const key = string(); result[key] = payload(child, depth + 1); } }
      case 11: take(count() * 4); return null;
      case 12: take(count() * 8); return null;
      default: throw new Error('Tipo NBT no compatible.');
    }
  }
  if (byte() !== 10) throw new Error('Se esperaba un level.dat de Bedrock.');
  string(); const data = payload(10);
  if (typeof data.RandomSeed !== 'string' || !/^-?\d+$/.test(data.RandomSeed)) throw new Error('El mundo no contiene RandomSeed.');
  return { seed: data.RandomSeed, spawn: Number.isInteger(data.SpawnX) && Number.isInteger(data.SpawnZ) ? { x: data.SpawnX, y: data.SpawnY ?? null, z: data.SpawnZ } : null,
    version: Array.isArray(data.lastOpenedWithVersion) ? data.lastOpenedWithVersion.slice(0, 3).join('.') : null };
}

export async function readWorldSeed(dataDir, name) {
  const root = await fs.realpath(dataDir), target = await fs.realpath(path.join(root, 'worlds', safeWorld(name), 'level.dat'));
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('El archivo del mundo está fuera del directorio de datos.');
  const file = await fs.open(target, 'r');
  try {
    const stat = await file.stat(); if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('level.dat fuera de límite.');
    const buffer = Buffer.alloc(stat.size); const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead !== buffer.length) throw new Error('No se pudo leer level.dat completo.');
    return { world: name, ...parseLevelSeed(buffer) };
  } finally { await file.close(); }
}
