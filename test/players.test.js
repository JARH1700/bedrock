import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { identity, connections, createPlayers } from '../src/players.js';

test('identidades: XUID de 64 bits y UUID Floodgate conservan todos sus dígitos', () => {
  const id = identity('18446744073709551615');
  assert.equal(id.uuid, '00000000-0000-0000-ffff-ffffffffffff');
  assert.equal(identity(id.uuid).xuid, id.xuid);
  assert.throws(() => identity('18446744073709551616'));
  assert.throws(() => identity('0'));
  assert.throws(() => identity('12345678-1234-1234-1234-123456789abc'));
  assert.throws(() => identity('../test'));
  assert.equal(identity('JARH1708').gamertag, 'JARH1708');
});
const line = (event, second = '01') => `2026-09-21T12:00:${second}.123456789Z [2026-09-21 12:00:${second}:123 INFO] Player ${event}: Test User, xuid: 2535432196048835`;
test('conexiones: ignora chat y XUID vacíos, reconoce desconexión con pfid', () => {
  const events = connections(`${line('connected')}\n${line('disconnected', '02')}, pfid: 123\n2026-09-21T12:00:03Z [INFO] <fake> Player connected: Fake, xuid: 123\n${line('connected').replace('2535432196048835', '')}`);
  assert.equal(events.length, 2);
  assert.equal(events[0].name, 'Test User');
  assert.equal(events[1].online, false);
});
test('perfiles: caché, concurrencia, precisión JSON y URL de textura del mismo origen', async () => {
  const calls = [], hash = 'a'.repeat(64);
  const service = createPlayers({ fetcher: async url => {
    calls.push(url);
    return new Response(url.includes('/xuid/') ? '{"xuid":18446744073709551615}' : JSON.stringify({ texture_id: hash }));
  } });
  const [a, b] = await Promise.all([service.lookup('Test'), service.lookup('Test')]);
  assert.deepEqual(a, b); assert.equal(a.xuid, '18446744073709551615');
  assert.equal(a.skin, `/api/players/texture/${hash}`);
  await service.lookup('Test'); assert.equal(calls.length, 2);
  await assert.rejects(service.texture('https://example.com'));
  await assert.rejects(service.texture('b'.repeat(64)));
});
test('perfiles: caída del proveedor no inventa una skin y se cachea brevemente', async () => {
  let count = 0;
  const service = createPlayers({ fetcher: async () => { count++; return new Response('', { status: 503 }); } });
  const result = await service.lookup('Missing');
  assert.equal(result.skin, null); assert.match(result.message, /no tiene datos/);
  await service.lookup('Missing'); assert.equal(count, 1);
});
test('Java: verifica identidad Mojang, separa caché Bedrock y rechaza texturas externas', async () => {
  const uuid = 'cd6002215eee4e87adb4f2f0fd1ea022', hash = 'a'.repeat(64); let bad = false;
  const service = createPlayers({ fetcher: async url => {
    if (url.includes('api.mojang.com')) return new Response(JSON.stringify({ id: uuid, name: 'JARH1708' }));
    if (url.includes('sessionserver.mojang.com')) return new Response(JSON.stringify({ id: uuid, name: 'JARH1708', properties: [{ name: 'textures', value: Buffer.from(JSON.stringify({ textures: { SKIN: { url: bad ? 'https://example.com/skin.png' : `http://textures.minecraft.net/texture/${hash}` } } })).toString('base64') }] }));
    return new Response('{}');
  } });
  const java = await service.lookupJava('JARH1708');
  assert.equal(java.edition, 'java'); assert.equal(java.uuid, uuid); assert.equal(java.skin, `/api/players/texture/${hash}`);
  assert.equal((await service.lookup('JARH1708')).skin, null);
  bad = true; assert.equal((await service.lookupJava(uuid)).skin, null);
  await assert.rejects(service.lookupJava('../example'));
});
test('automático: usa Java si falta Bedrock, conserva XUID y prioriza Bedrock cuando existe', async () => {
  const uuid = 'cd6002215eee4e87adb4f2f0fd1ea022', hash = 'a'.repeat(64), calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.includes('/xbox/xuid/')) return new Response('{"xuid":"2535432196048835"}');
    if (url.includes('api.geysermc.org/v2/skin/')) return new Response('{}');
    if (url.includes('api.mojang.com')) return new Response(JSON.stringify({ id: uuid }));
    return new Response(JSON.stringify({ id: uuid, name: 'Test', properties: [{ name: 'textures', value: Buffer.from(JSON.stringify({ textures: { SKIN: { url: `https://textures.minecraft.net/texture/${hash}` } } })).toString('base64') }] }));
  };
  const service = createPlayers({ fetcher }); const profile = await service.lookupAuto('Test');
  assert.equal(profile.source, 'java-fallback'); assert.equal(profile.xuid, '2535432196048835'); assert.equal(profile.javaUuid, uuid);
  assert.equal(profile.skin, `/api/players/texture/${hash}`); assert.match(profile.fallbackAvatar, /avatars\/(alex|steve)\.svg/);
  const priority = createPlayers({ fetcher: async url => {
    assert.ok(!url.includes('mojang.com')); return new Response(url.includes('/xuid/') ? '{"xuid":"123"}' : JSON.stringify({ texture_id: hash }));
  } });
  assert.equal((await priority.lookupAuto('Test')).skin, profile.skin);
});
test('automático: sin proveedores devuelve Steve o Alex estable y no consulta un XUID como nombre Java', async () => {
  const calls = [], service = createPlayers({ fetcher: async url => { calls.push(url); return new Response('', { status: 503 }); } });
  const first = await service.lookupAuto('Nobody'), second = await service.lookupAuto('Nobody');
  assert.equal(first.source, 'default'); assert.equal(first.avatar, second.avatar); assert.equal(first.skin, null);
  const before = calls.length; const byXuid = await service.lookupAuto('123456789');
  assert.equal(byXuid.source, 'default'); assert.ok(calls.slice(before).every(url => !url.includes('mojang.com')));
});
test('perfiles: carga XUID persistido antes de buscar gamertag y permite PNG local sin proveedor', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-profile-'));
  const calls = [];
  try {
    await fs.writeFile(path.join(dir, 'players.json'), JSON.stringify([{ xuid: '2535432196048835', name: 'Test User' }]));
    const service = createPlayers({ panelDir: dir, fetcher: async url => { calls.push(url); return new Response('{}'); } });
    const profile = await service.lookup('test user');
    assert.equal(profile.xuid, '2535432196048835');
    assert.equal(calls.length, 1); assert.match(calls[0], /skin\/2535432196048835$/);
    const png = Buffer.alloc(33); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.write('IHDR',12); png.writeUInt32BE(64,16); png.writeUInt32BE(64,20);
    await service.saveSkin(profile.xuid, png);
    const local = await service.lookup('Test User'); assert.equal(local.source, 'local');
    assert.deepEqual(await service.localTexture(local.skin.split('/').pop()), png);
    const restarted = createPlayers({ panelDir: dir, fetcher: async () => { throw new Error('No network'); } });
    assert.equal((await restarted.lookup('Test User')).source, 'local');
    await assert.rejects(service.saveSkin('../outside', png));
    await assert.rejects(service.saveSkin(profile.xuid, Buffer.from('not a png')));
    png.writeUInt32BE(5000,16); await assert.rejects(service.saveSkin(profile.xuid, png));
    await assert.rejects(service.localTexture('../outside'));
    await service.clearSkin('Test User');
    assert.equal((await service.lookup('Test User')).skin, null);
  } finally { await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
test('jugadores: persiste nombres, deduplica eventos y limpia presencia tras reinicio o fallo', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bedrock-players-'));
  let logs = line('connected'), running = true, fails = false, start = '2026-09-21T12:00:00Z';
  const service = createPlayers({ panelDir: dir, inspect: async () => {
    if (fails) throw new Error('Docker offline');
    return { Id: 'one', State: { Running: running, StartedAt: start } };
  }, container: () => ({ logs: async () => Buffer.from(logs) }), fetcher: async () => new Response('{}') });
  try {
    assert.equal((await service.collect()).players[0].online, true);
    assert.equal((await service.collect()).players.length, 1);
    logs += `\n${line('disconnected', '02')}`;
    assert.equal((await service.collect()).players[0].online, false);
    start = '2026-09-21T13:00:00Z';
    assert.equal((await service.collect()).players[0].online, null);
    fails = true; assert.match((await service.collect()).error, /conexiones/);
    fails = false; running = false;
    assert.equal((await service.collect()).players[0].online, false);
    const saved = JSON.parse(await fs.readFile(path.join(dir, 'players.json'), 'utf8'));
    assert.equal(saved[0].name, 'Test User'); assert.equal(saved[0].online, undefined);
  } finally { await fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
