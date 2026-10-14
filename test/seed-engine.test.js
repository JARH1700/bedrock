import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createEngine, engineVersions, structures } from '../public/seed-engine.js';
const bytes = await readFile(new URL('../public/engine/bedrock.wasm', import.meta.url));

test('motor Bedrock: referencia documentada de isla de hongos, semilla 262', async () => {
  const e = await createEngine(bytes); e.init('1.18', 'overworld', '262');
  assert.equal(e.biome(0, 64, 0), 14);
  assert.equal(e.name(14), 'mushroom_fields');
  assert.ok(e.color(14) > 0);
});
test('motor Bedrock: 64 bits, semillas distintas y resultados reproducibles', async () => {
  const e = await createEngine(bytes);
  const sample = seed => { e.init('1.21.60', 'overworld', seed); return Array.from({ length: 40 }, (_, i) => e.biome(i * 123 - 2500, 64, i * 271 - 3000)); };
  const a = sample('-9223372036854775808');
  assert.notDeepEqual(a, sample('0')); // same low 32 bits, different high bits
  assert.notDeepEqual(a, sample('9223372036854775807'));
  assert.deepEqual(a, sample('-9223372036854775808'));
});
test('motor Bedrock: todas las dimensiones y perfiles; estructuras por dimensión', async () => {
  const e = await createEngine(bytes);
  for (const version of engineVersions) for (const dimension of ['overworld', 'nether', 'end']) {
    e.init(version, dimension, '-1234567890123456789');
    for (const [x, z] of [[0, 0], [-2048, 1024], [1536, -2048]]) assert.ok(e.biome(x, 64, z) >= 0);
    assert.equal(e.region(5) > 0, dimension === 'overworld');
    assert.equal(e.region(22) > 0, dimension === 'nether');
    assert.equal(e.region(24) > 0, dimension === 'end');
    for (const [type] of structures) {
      if (!e.region(type)) continue;
      const a = e.structure(type, -2, 1), b = e.structure(type, -2, 1);
      assert.deepEqual(a, b); if (a) { assert.ok(Number.isInteger(a.x)); assert.ok(Number.isInteger(a.z)); }
    }
  }
  assert.throws(() => e.init('1.99', 'overworld', '0'));
  assert.throws(() => e.init('1.18', 'invalid', '0'));
});
test('motor Bedrock: artefacto coincide con el manifiesto de compilación', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/engine/build.json', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), manifest.sha256);
});
