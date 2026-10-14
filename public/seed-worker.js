import { createEngine, structures } from './seed-engine.js';
self.onmessage = async ({ data: v }) => {
  try {
    const response = await fetch('./engine/bedrock.wasm');
    if (!response.ok) throw new Error('No se pudo cargar el motor del mapa.');
    const engine = await createEngine(await response.arrayBuffer());
    engine.init(v.version, v.dimension, v.seed);
    const size = 128, rows = 80, step = v.range * 2 / size, rangeZ = v.range * rows / size;
    const ids = new Int16Array(size * rows), pixels = new Uint8ClampedArray(size * rows * 4), catalog = new Map();
    for (let z = 0; z < rows; z++) {
      for (let x = 0; x < size; x++) {
        const i = z * size + x;
        const id = engine.biome(Math.floor(v.x - v.range + (x + .5) * step), v.y, Math.floor(v.z - rangeZ + (z + .5) * step));
        ids[i] = id; const color = engine.color(id);
        pixels[i * 4] = color >> 16 & 255; pixels[i * 4 + 1] = color >> 8 & 255; pixels[i * 4 + 2] = color & 255; pixels[i * 4 + 3] = 255;
        if (!catalog.has(id)) catalog.set(id, { id, name: engine.name(id), color });
      }
      if (z % 16 === 0) self.postMessage({ progress: Math.round(z / rows * 85) });
    }
    const points = [];
    for (const [type] of structures) {
      const region = engine.region(type); if (!region) continue;
      for (let z = Math.floor((v.z - rangeZ) / region); z <= Math.floor((v.z + rangeZ) / region); z++) {
        for (let x = Math.floor((v.x - v.range) / region); x <= Math.floor((v.x + v.range) / region); x++) {
          const p = engine.structure(type, x, z);
          if (p && Math.abs(p.x - v.x) <= v.range && Math.abs(p.z - v.z) <= rangeZ) points.push(p);
        }
      }
    }
    self.postMessage({ done: true, size, rows, step, ids, pixels, catalog: [...catalog.values()], points, view: v }, [ids.buffer, pixels.buffer]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
