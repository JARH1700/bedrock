import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panView, zoomView } from '../public/seed-navigation.js';
import { catalogEntries, atlasImage, versionSupports } from '../public/seed-catalog.js';
import { access } from 'node:fs/promises';
test('mapa: arrastrar y hacer zoom conserva el punto bajo el cursor', () => {
  const view = { x: -1024, z: 400, range: 1024 };
  assert.deepEqual(panView(view, 100, -50, 800), { x: -1280, z: 528, range: 1024 });
  const u = .2, v = .8, next = zoomView(view, 256, u, v);
  assert.ok(Math.abs(next.x + (u - .5) * 2 * next.range - (view.x + (u - .5) * 2 * view.range)) < 1e-9);
  assert.ok(Math.abs(next.z + (v - .5) * 2 * next.range - (view.z + (v - .5) * 2 * view.range)) < 1e-9);
  assert.equal(zoomView(view, 1).range, 128); assert.equal(zoomView(view, 9000).range, 4096);
  assert.equal(panView({ x: 30000000, z: 0, range: 4096 }, -200, 0, 800).x, 30000000);
  const aspect = 80 / 128, rectangular = zoomView(view, 256, u, v, aspect);
  assert.ok(Math.abs(rectangular.z + (v - .5) * 2 * rectangular.range * aspect - (view.z + (v - .5) * 2 * view.range * aspect)) < 1e-9);
});
test('atlas: cada entrada tiene imagen local y respeta las versiones mínimas', async () => {
  assert.equal(new Set(catalogEntries.map(e => `${e.kind}-${e.id}`)).size, catalogEntries.length);
  for (const entry of catalogEntries) await access(new URL(`../public${atlasImage(entry.kind, entry.id)}`, import.meta.url));
  assert.equal(versionSupports('1.21', '1.21.50'), false);
  assert.equal(versionSupports('1.21.60', '1.21.50'), true);
});
