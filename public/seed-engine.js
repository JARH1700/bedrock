// Native Bedrock code compiled to WebAssembly; no remote seed lookup.
export const engineVersions = ['1.18', '1.19', '1.20', '1.21', '1.21.50', '1.21.60'];
export const structures = [
  [1, 'Pirámide'], [2, 'Templo de jungla'], [3, 'Cabaña'], [4, 'Iglú'],
  [5, 'Aldea'], [6, 'Ruinas oceánicas'], [7, 'Naufragio'], [8, 'Monumento'],
  [9, 'Mansión'], [10, 'Puesto de saqueadores'], [11, 'Portal en ruinas'],
  [12, 'Portal del Nether'], [13, 'Ciudad ancestral'], [22, 'Fortaleza'],
  [23, 'Bastión'], [24, 'Ciudad del End'], [27, 'Ruinas de sendero'], [28, 'Cámaras de pruebas'],
  [14, 'Tesoro enterrado'], [18, 'Fortaleza del portal del End'],
];
export async function createEngine(bytes) {
  const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: {
    // The reactor does not read files, clocks, environment or random sources.
    fd_write: () => 8, fd_close: () => 8, fd_seek: () => 8,
    fd_fdstat_get: () => 8, fd_prestat_get: () => 8, fd_prestat_dir_name: () => 8,
    proc_exit: code => { throw new Error(`El motor terminó (${code}).`); },
  } });
  const e = instance.exports; e._initialize?.();
  return {
    init(version, dimension, seed) {
      const v = engineVersions.indexOf(version), d = { overworld: 0, nether: -1, end: 1 }[dimension];
      if (v < 0 || d === undefined || !e.init(v, d, BigInt(seed))) throw new Error('Versión o dimensión no compatible.');
    },
    biome: (x, y, z) => e.biome(x, y, z),
    color: id => e.color(id),
    name(id) {
      const p = e.name(id); if (!p) return `Bioma ${id}`;
      const data = new Uint8Array(e.memory.buffer); let end = p;
      while (end < data.length && data[end]) end++;
      return new TextDecoder().decode(data.subarray(p, end));
    },
    region: type => e.region(type),
    structure(type, x, z) {
      const p = e.structure(type, x, z), a = new Int32Array(e.memory.buffer, p, 3);
      return a[0] ? { type, x: a[1], z: a[2] } : null;
    },
  };
}
