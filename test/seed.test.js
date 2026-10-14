import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLevelSeed } from '../src/seed.js';
import { seedValue, coordinate } from '../public/seed-utils.js';
function string(value) { const bytes = Buffer.from(value); const length = Buffer.alloc(2); length.writeUInt16LE(bytes.length); return Buffer.concat([length, bytes]); }
function tag(type, name, value) { return Buffer.concat([Buffer.from([type]), string(name), value]); }
function integer(value) { const b = Buffer.alloc(4); b.writeInt32LE(value); return b; }
function fixture(seed = -9223372036854775808n) {
  const long = Buffer.alloc(8); long.writeBigInt64LE(seed);
  const nbt = Buffer.concat([Buffer.from([10,0,0]), tag(4, 'RandomSeed', long), tag(3, 'SpawnX', integer(-17)), tag(3, 'SpawnZ', integer(31)), tag(9, 'lastOpenedWithVersion', Buffer.concat([Buffer.from([3]), integer(3), integer(1), integer(21), integer(120)])), Buffer.from([0])]);
  const header = Buffer.alloc(8); header.writeUInt32LE(10); header.writeUInt32LE(nbt.length, 4); return Buffer.concat([header, nbt]);
}
test('seed: lee NBT Bedrock y conserva 64 bits, spawn y versión', () => {
  assert.deepEqual(parseLevelSeed(fixture()), { seed: '-9223372036854775808', spawn: { x: -17, y: null, z: 31 }, version: '1.21.120' });
  assert.equal(parseLevelSeed(fixture(9223372036854775807n)).seed, '9223372036854775807');
});
test('seed: rechaza archivos truncados y NBT desconocido', () => {
  assert.throws(() => parseLevelSeed(fixture().subarray(0, 35)));
  const bad = fixture(); bad[11] = 42; assert.throws(() => parseLevelSeed(bad));
  const root = fixture(); root[8] = 3; assert.throws(() => parseLevelSeed(root));
});
test('seed: valida límites sin redondear las semillas', () => {
  assert.equal(seedValue('-9223372036854775808'), '-9223372036854775808');
  assert.throws(() => seedValue('9223372036854775808')); assert.throws(() => seedValue('1e10')); assert.throws(() => coordinate('1.5'));
  assert.equal(Math.floor(coordinate('-17') / 16), -2);
});
