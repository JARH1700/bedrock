import fs from 'node:fs/promises';
import path from 'node:path';
import dgram from 'node:dgram';
import { randomBytes } from 'node:crypto';
import { folderUsage } from './worlds.js';
import { listPacks, readJson } from './packs.js';

const sum = (items, key) => items.reduce((n, item) => n + (Number(item[key]) || 0), 0);
export function calculateMetrics(stats) {
  const c = stats.cpu_stats || {}, p = stats.precpu_stats || {};
  const delta = (c.cpu_usage?.total_usage || 0) - (p.cpu_usage?.total_usage || 0), system = (c.system_cpu_usage || 0) - (p.system_cpu_usage || 0);
  const cores = c.online_cpus || c.cpu_usage?.percpu_usage?.length || 1;
  const cpu = system > 0 ? Math.max(0, delta / system * cores * 100) : 0;
  const mem = stats.memory_stats || {}, cache = mem.stats?.inactive_file ?? mem.stats?.total_inactive_file ?? 0;
  const memory = typeof mem.usage === 'number' ? Math.max(0, mem.usage - cache) : null;
  const network = Object.values(stats.networks || {});
  const blocks = stats.blkio_stats?.io_service_bytes_recursive;
  return { cpu: c.cpu_usage ? cpu : null, cores, cpuNormalized: c.cpu_usage ? cpu / cores : null, memory, memoryRaw: mem.usage ?? null, memoryCache: mem.usage != null ? cache : null, memoryLimit: mem.limit || null, memoryPercent: mem.limit && memory != null ? memory / mem.limit * 100 : null,
    rx: network.length ? sum(network, 'rx_bytes') : null, tx: network.length ? sum(network, 'tx_bytes') : null, rxPackets: network.length ? sum(network, 'rx_packets') : null, txPackets: network.length ? sum(network, 'tx_packets') : null,
    networkErrors: network.length ? sum(network, 'rx_errors') + sum(network, 'tx_errors') : null, networkDropped: network.length ? sum(network, 'rx_dropped') + sum(network, 'tx_dropped') : null,
    diskRead: blocks?.length ? sum(blocks.filter(b => b.op.toLowerCase() === 'read'), 'value') : null, diskWrite: blocks?.length ? sum(blocks.filter(b => b.op.toLowerCase() === 'write'), 'value') : null,
    pids: stats.pids_stats?.current ?? null, throttledPeriods: c.throttling_data?.throttled_periods ?? null, throttledSeconds: c.throttling_data?.throttled_time != null ? c.throttling_data.throttled_time / 1e9 : null };
}
export function rates(current, previous) {
  const seconds = previous && current.identity === previous.identity ? (current.at - previous.at) / 1000 : 0;
  const result = {};
  for (const key of ['rx', 'tx', 'diskRead', 'diskWrite']) result[`${key}Rate`] = seconds > 0 && current[key] != null && previous[key] != null && current[key] >= previous[key] ? (current[key] - previous[key]) / seconds : null;
  return result;
}
const magic = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');
export function parsePong(packet, timestamp) {
  if (packet.length < 35 || packet[0] !== 0x1c || !packet.subarray(1, 9).equals(timestamp) || !packet.subarray(17, 33).equals(magic)) return null;
  const length = packet.readUInt16BE(33); if (packet.length < 35 + length) return null;
  const fields = packet.subarray(35, 35 + length).toString('utf8').split(';');
  if (fields[0] !== 'MCPE') return null;
  const players = Number(fields[4]), capacity = Number(fields[5]);
  if (!Number.isInteger(players) || players < 0 || !Number.isInteger(capacity) || capacity < players) return null;
  return { players, capacity, version: fields[3], motd: fields[1] };
}
export function pingBedrock(host, port = 19132, timeoutMs = 1200) {
  return new Promise(resolve => {
    const socket = dgram.createSocket('udp4'), started = Date.now(), stamp = Buffer.alloc(8); stamp.writeBigInt64BE(BigInt(started));
    const packet = Buffer.concat([Buffer.from([1]), stamp, magic, randomBytes(8)]);
    let finished = false;
    const done = value => { if (finished) return; finished = true; clearTimeout(timer); socket.close(); resolve(value); };
    const timer = setTimeout(() => done(null), timeoutMs);
    socket.on('error', () => done(null));
    socket.on('message', msg => { const parsed = parsePong(msg, stamp); if (parsed) done({ ...parsed, latencyMs: Date.now() - started }); });
    socket.connect(port, host, () => socket.send(packet, err => { if (err) done(null); }));
  });
}
export function createMetrics({ dataDir, store, getConfig, inspect, getContainer, probe = pingBedrock, clock = Date.now }) {
  let cached = null, inFlight = null, previous = null, storage = null, storageAt = 0;
  const history = [];
  async function storageMetrics() {
    if (storage && clock() - storageAt < 60000) return storage;
    const c = await getConfig();
    const folders = {};
    for (const key of ['worlds', 'behavior_packs', 'resource_packs']) { try { folders[key] = await folderUsage(path.join(dataDir, key)); } catch { folders[key] = null; } }
    const backups = await store.listBackups();
    const disk = await fs.statfs(dataDir).catch(() => null);
    const backupDisk = await fs.statfs(store.backupDir).catch(() => null);
    let active = null, packs = [];
    if (c) { active = await folderUsage(store.world(c.world)).catch(() => null); packs = await listPacks(dataDir, c.world).catch(() => []); }
    storage = { worldBytes: active?.bytes ?? null, worldFiles: active?.files ?? null, worldsBytes: folders.worlds?.bytes ?? null, packsBytes: folders.behavior_packs && folders.resource_packs ? folders.behavior_packs.bytes + folders.resource_packs.bytes : null,
      diskFree: disk ? disk.bavail * disk.bsize : null, diskTotal: disk ? disk.blocks * disk.bsize : null, backupDiskFree: backupDisk ? backupDisk.bavail * backupDisk.bsize : null,
      backupsCount: backups.length, backupsBytes: sum(backups, 'bytes'), lastBackup: backups[0]?.createdAt || null, lastBackupDurationMs: backups[0]?.durationMs ?? null,
      behaviorPacks: packs.filter(p => p.kind === 'behavior').length, resourcePacks: packs.filter(p => p.kind === 'resource').length, activePacks: packs.filter(p => p.enabled).length,
      allowlistedPlayers: (await readJson(path.join(dataDir, 'allowlist.json'), [])).length, measuredAt: new Date(clock()).toISOString() };
    storageAt = clock(); return storage;
  }
  async function sample() {
    const at = clock(), disk = await storageMetrics();
    let info; try { info = await inspect(); } catch (e) { return { running: false, dockerError: e.message, at, storage: disk, history }; }
    const base = { at, storage: disk, running: !!info?.State.Running, state: info?.State.Status || 'not-installed', restarts: info?.RestartCount ?? null, oomKilled: info?.State.OOMKilled ?? null, exitCode: info?.State.ExitCode ?? null, health: info?.State.Health?.Status || null, image: info?.Config.Image || null, history };
    if (!base.running) { previous = null; return base; }
    const m = calculateMetrics(await getContainer().stats({ stream: false }));
    const identity = `${info.Id}:${info.State.StartedAt}`;
    if (previous && previous.identity !== identity) history.length = 0;
    const rate = rates({ ...m, at, identity }, previous); previous = { ...m, at, identity };
    const address = process.env.BEDROCK_QUERY_HOST || Object.values(info.NetworkSettings?.Networks || {}).find(n => n.IPAddress)?.IPAddress;
    let game = null; if (address) game = await probe(address, Number(process.env.BEDROCK_QUERY_PORT || 19132));
    const result = { ...base, ...m, ...rate, uptime: Math.max(0, (at - Date.parse(info.State.StartedAt)) / 1000), game, queryAvailable: !!game };
    history.push({ at, cpu: m.cpu, memory: m.memory, rxRate: rate.rxRate, txRate: rate.txRate, diskReadRate: rate.diskReadRate, diskWriteRate: rate.diskWriteRate, players: game?.players ?? null });
    if (history.length > 180) history.shift(); return result;
  }
  return { invalidate() { storageAt = 0; storage = null; cached = null; }, async get() {
    if (cached && clock() - cached.at < 5000) return cached;
    if (!inFlight) inFlight = sample().then(result => { cached = result; return result; }).finally(() => inFlight = null);
    return inFlight;
  } };
}
