import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapStructures, scaleBlocks } from '../public/seed-detail.js';
test('detalle: a 850 bloques oculta estructuras pequeñas y las recupera al acercar', () => {
  const points = [5,8,9,13,18,22,23,24,28,1,2,3,4,6,7,10,11,12,14,27].map(type => ({ type }));
  assert.equal(scaleBlocks(849, 180), 849);
  assert.deepEqual(mapStructures(points, 849, 180), points);
  assert.deepEqual(mapStructures(points, 850, 180).map(p => p.type), [5,8,9,13,18,22,23,24,28]);
  assert.deepEqual(mapStructures(points, 4096, 800).map(p => p.type), [5,8,9,13,18,22,23,24,28]);
  assert.deepEqual(mapStructures(points, 1024, 800), points);
  assert.equal(points.length, 20); // Results and catalog retain all predictions.
});
