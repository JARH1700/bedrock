import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readHistory, rememberSeed } from '../public/seed-history.js';
const view = { seed: '-9223372036854775808', version: '1.21.60', dimension: 'nether', x: -123, y: 64, z: 456, range: 333 };
test('historial: conserva 64 bits y restaura toda la vista', () => {
  const rows = rememberSeed([], view, 100);
  assert.deepEqual(readHistory(JSON.stringify(rows)), [{ ...view, visited: 100 }]);
  const next = rememberSeed(rows, { ...view, x: 900, dimension: 'end' }, 200);
  assert.equal(next.length, 1); assert.equal(next[0].x, 900); assert.equal(next[0].dimension, 'end');
});
test('historial: descarta datos inválidos y limita a 100 semillas recientes', () => {
  assert.deepEqual(readHistory('{'), []);
  assert.deepEqual(readHistory(JSON.stringify([{ ...view, visited: 100, seed: '<script>' }, { ...view, visited: 100, range: -1 }, { ...view, visited: 100, dimension: 'invalid' }])), []);
  let rows = []; for (let i = 0; i < 110; i++) rows = rememberSeed(rows, { ...view, seed: String(i) }, i);
  assert.equal(rows.length, 100); assert.equal(rows[0].seed, '109'); assert.equal(rows[99].seed, '10');
});
