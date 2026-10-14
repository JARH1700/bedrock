import express from 'express';
import multer from 'multer';
import Docker from 'dockerode';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { readJson, writeJson, safeWorld, listPacks, installPacks, togglePack } from './packs.js';
import { createMetrics } from './metrics.js';
import { createManagement } from './management.js';
import { createPlayers } from './players.js';
import { readWorldSeed } from './seed.js';
import { bedrockNetwork } from './network.js';
export { calculateMetrics } from './metrics.js';

export function validateConfig(input) {
  const number = (key, min, max) => {
    const n = Number(input[key]);
    if (!Number.isInteger(n) || n < min || n > max) throw new Error(`${key} debe estar entre ${min} y ${max}.`);
    return n;
  };
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 80 || /[\r\n\x00]/.test(input.name)) throw new Error('Nombre de servidor inválido.');
  if (!['survival', 'creative', 'adventure'].includes(input.gamemode)) throw new Error('Modo de juego inválido.');
  if (!['peaceful', 'easy', 'normal', 'hard'].includes(input.difficulty)) throw new Error('Dificultad inválida.');
  return { name: input.name.trim(), world: safeWorld(input.world), port: number('port', 1024, 65535), maxPlayers: number('maxPlayers', 1, 100), memoryMB: number('memoryMB', 512, 32768), gamemode: input.gamemode, difficulty: input.difficulty, allowlist: input.allowlist === true };
}
export function createApp({ docker = new Docker({ socketPath: process.env.DOCKER_SOCKET || (process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock'), timeout: 150000 }), password = process.env.ADMIN_PASSWORD, dataDir = process.env.DATA_DIR || './data/bedrock', panelDir = process.env.PANEL_DATA_DIR || './data/panel', backupDir = process.env.BACKUP_DIR || './data/backups', containerName = process.env.BEDROCK_CONTAINER || 'bedrock-managed', volumeName = process.env.BEDROCK_VOLUME || 'bedrock-world', secure = process.env.COOKIE_SECURE === 'true', scheduler = true } = {}) {
  if (!password || password.length < 12 || password === 'cambia-esta-clave-por-una-unica') throw new Error('Configura ADMIN_PASSWORD con una contraseña única de al menos 12 caracteres.');
  const app = express();
  app.disable('x-powered-by');
  const configFile = path.join(panelDir, 'server.json');
  const sessions = new Map();
  const attempts = new Map();
  let busy = false;
  const job = { status: 'idle', message: '' };
  const container = () => docker.getContainer(containerName);
  const lock = () => { if (busy) return false; busy = true; return true; };
  let metrics;
  const management = createManagement({ docker, inspect, container, containerName, configFile, dataDir, panelDir, backupDir, lock, unlock: () => busy = false, job, onChange: () => metrics?.invalidate() });
  metrics = createMetrics({ dataDir, store: management.store, getConfig: () => readJson(configFile, null), inspect, getContainer: container });
  let recoveryError = null;
  const ready = management.recover().catch(e => { recoveryError = e; job.status = 'error'; job.message = `Recuperación pendiente: ${e.message}`; });
  const timer = scheduler ? setInterval(() => ready.then(() => { if (!recoveryError) return management.tick(); }).catch(e => { job.status = 'error'; job.message = e.message; }), 30000) : null;
  timer?.unref();
  const players = createPlayers({ inspect, container, panelDir });
  const playerTimer = scheduler ? setInterval(() => players.collect().catch(() => {}), 10000) : null;
  playerTimer?.unref();
  app.locals.close = () => { clearInterval(timer); clearInterval(playerTimer); };
  app.locals.management = management;
  async function inspect() {
    try {
      const info = await container().inspect();
      if (info.Config?.Labels?.['bedrock-panel.managed'] !== 'true') throw new Error('El nombre del contenedor pertenece a otro servicio. Cambia BEDROCK_CONTAINER.');
      return info;
    } catch (e) { if (e.statusCode === 404) return null; throw e; }
  }
  async function requireStopped() {
    const info = await inspect();
    if (info?.State.Running) { const e = new Error('Detén el servidor antes de modificar paquetes o la lista de acceso.'); e.status = 409; throw e; }
  }
  const config = async () => {
    const value = await readJson(configFile, null);
    if (!value) { const e = new Error('Primero instala el servidor.'); e.status = 409; throw e; }
    return value;
  };
  const mutate = fn => async (req, res, next) => {
    await ready;
    if (recoveryError) return next(recoveryError);
    if (busy) return res.status(409).json({ error: 'Hay otra operación en curso.' });
    busy = true;
    try { await fn(req, res); } catch (e) { next(e); } finally { busy = false; }
  };
  const background = (message, fn) => async (req, res, next) => {
    await ready;
    if (recoveryError) return next(recoveryError);
    if (!lock()) return res.status(409).json({ error: 'Hay otra operación en curso.' });
    job.status = 'running'; job.message = message; delete job.result;
    res.status(202).json({ ok: true });
    try { job.result = await fn(req); job.status = 'done'; job.message = 'Operación completada. Revisa el estado del servidor.'; }
    catch (e) { job.status = 'error'; job.message = e.message; }
    finally { busy = false; metrics.invalidate(); }
  };
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" });
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-Panel-Request') !== '1') return res.status(403).json({ error: 'Solicitud no autorizada.' });
    next();
  });
  app.use(express.json({ limit: '32kb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/login', (req, res) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
    const key = req.ip;
    const attempt = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    if (attempt.count >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    const hash = value => createHash('sha256').update(value).digest();
    if (typeof req.body.password !== 'string' || !timingSafeEqual(hash(req.body.password), hash(password))) {
      attempt.count++; attempts.set(key, attempt);
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
    attempts.delete(key);
    for (const [token, expires] of sessions) if (expires < now) sessions.delete(token);
    if (sessions.size > 100) sessions.delete(sessions.keys().next().value);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, now + 12 * 60 * 60 * 1000);
    res.cookie('session', token, { httpOnly: true, sameSite: 'strict', secure, maxAge: 12 * 60 * 60 * 1000, path: '/' });
    res.json({ ok: true });
  });
  app.use('/api', (req, res, next) => {
    const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('session='))?.slice(8);
    if (!token || !sessions.has(token) || sessions.get(token) < Date.now()) return res.status(401).json({ error: 'Inicia sesión para continuar.' });
    req.sessionToken = token;
    next();
  });
  app.post('/api/logout', (req, res) => { sessions.delete(req.sessionToken); res.clearCookie('session', { path: '/', httpOnly: true, sameSite: 'strict', secure }); res.json({ ok: true }); });
  app.get('/api/status', async (_req, res) => {
    await ready;
    const settings = await readJson(configFile, null);
    let info = null, dockerError = null;
    try { await docker.ping(); info = await inspect(); } catch (e) { dockerError = e.message; }
    res.json({ config: settings, docker: !dockerError, dockerError, installed: !!info, status: info?.State?.Status || 'not-installed', startedAt: info?.State?.StartedAt || null, job, busy, runtime: await management.runtime() });
  });
  app.post('/api/install', async (req, res, next) => {
    await ready;
    if (recoveryError) return next(recoveryError);
    if (busy) return res.status(409).json({ error: 'Hay otra operación en curso.' });
    busy = true;
    try {
      if (req.body.eula !== true) throw new Error('Debes aceptar la EULA de Minecraft.');
      const settings = validateConfig(req.body);
      const network = bedrockNetwork(settings);
      if (await inspect()) throw new Error('Ya existe un servidor instalado.');
      await docker.ping();
      await fs.mkdir(dataDir, { recursive: true });
      await writeJson(configFile, settings);
      job.status = 'running'; job.message = 'Descargando itzg/minecraft-bedrock-server…';
      res.status(202).json({ ok: true });
      (async () => {
        try {
          const stream = await docker.pull('itzg/minecraft-bedrock-server:latest');
          await new Promise((resolve, reject) => docker.modem.followProgress(stream, (err, events) => {
            const failure = events?.find(e => e.error);
            if (err || failure) reject(err || new Error(failure.error)); else resolve();
          }));
          job.message = 'Creando el servidor Bedrock…';
          await docker.createVolume({ Name: volumeName });
          const created = await docker.createContainer({
            name: containerName, Image: 'itzg/minecraft-bedrock-server:latest', Tty: true, OpenStdin: true,
            Labels: { 'bedrock-panel.managed': 'true' },
            Env: ['EULA=TRUE', `SERVER_NAME=${settings.name}`, `LEVEL_NAME=${settings.world}`, `GAMEMODE=${settings.gamemode}`, `DIFFICULTY=${settings.difficulty}`, `MAX_PLAYERS=${settings.maxPlayers}`, `ALLOW_LIST=${settings.allowlist}`, 'ONLINE_MODE=true', 'ENABLE_SSH=false', ...network.Env],
            ExposedPorts: network.ExposedPorts,
            HostConfig: { Binds: [`${volumeName}:/data`], PortBindings: network.PortBindings, Memory: settings.memoryMB * 1024 * 1024, RestartPolicy: { Name: 'unless-stopped' } }
          });
          await created.start();
          job.status = 'done'; job.message = 'Contenedor iniciado. Consulta la consola mientras Bedrock prepara el mundo.';
        } catch (e) { job.status = 'error'; job.message = e.message; }
        finally { busy = false; }
      })();
    } catch (e) { busy = false; next(e); }
  });
  app.post('/api/network/migrate', background('Actualizando red de Bedrock…', () => management.migrateNetwork()));
  app.post('/api/power', mutate(async (req, res) => {
    if (!['start', 'stop', 'restart'].includes(req.body.action)) throw new Error('Acción inválida.');
    const info = await inspect();
    if (!info) throw new Error('Servidor no instalado.');
    if (req.body.action === 'start' && !info.State.Running) await container().start();
    if (req.body.action === 'stop' && info.State.Running) await management.stopped();
    if (req.body.action === 'restart') { await management.stopped(); await container().start(); }
    if (req.body.action !== 'stop') await management.applied();
    metrics.invalidate();
    res.json({ ok: true });
  }));
  app.get('/api/server/stats', async (_req, res) => {
    res.json(await metrics.get());
  });
  app.get('/api/players', async (_req, res) => res.json(await players.collect()));
  app.get('/api/players/lookup', async (req, res) => res.json(req.query.edition === 'java'
    ? players.withDefault(await players.lookupJava(req.query.q, req.query.refresh === '1'))
    : await players.lookupAuto(req.query.q, req.query.refresh === '1')));
  app.post('/api/players/skin', multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024, files: 1 } }).single('file'), async (req, res) => {
    res.json(await players.saveSkin(req.query.q, req.file?.buffer));
  });
  app.get('/api/players/local/:key', async (req, res) => res.type('png').send(await players.localTexture(req.params.key)));
  app.delete('/api/players/skin', async (req, res) => res.json(await players.clearSkin(req.query.q)));
  app.get('/api/players/texture/:hash', async (req, res) => {
    const png = await players.texture(req.params.hash);
    res.set('Cache-Control', 'private, max-age=21600').type('png').send(png);
  });
  app.get('/api/logs', async (_req, res) => {
    if (!await inspect()) return res.json({ text: '' });
    const logs = await container().logs({ stdout: true, stderr: true, tail: 250, timestamps: true });
    res.json({ text: Buffer.isBuffer(logs) ? logs.toString('utf8') : String(logs) });
  });
  app.post('/api/command', mutate(async (req, res) => {
    const command = req.body.command;
    if (typeof command !== 'string' || !command.trim() || command.length > 512 || /[\r\n\x00]/.test(command)) throw new Error('Comando inválido (máximo 512 caracteres, una sola línea).');
    if (!(await inspect())?.State.Running) throw new Error('El servidor debe estar encendido.');
    const exec = await container().exec({ Cmd: ['send-command', command.trim().replace(/^\//, '')], AttachStdout: true, AttachStderr: true });
    const stream = await exec.start({ Detach: false });
    await new Promise((resolve, reject) => { stream.on('end', resolve); stream.on('error', reject); stream.resume(); });
    const result = await exec.inspect();
    if (result.ExitCode !== 0) throw new Error('No se pudo enviar el comando. Revisa los logs.');
    res.json({ ok: true });
  }));
  app.get('/api/packs', async (_req, res) => { const c = await config(); res.json(await listPacks(dataDir, c.world)); });
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1, fields: 0 } });
  app.post('/api/packs', mutate(async (req, res) => {
    await requireStopped();
    const c = await config();
    await new Promise((resolve, reject) => upload.single('file')(req, res, e => e ? reject(e) : resolve()));
    if (!req.file || !/\.(zip|mcpe|mcpack|mcaddon)$/i.test(req.file.originalname)) throw new Error('Sube un archivo .zip, .mcpe, .mcpack o .mcaddon.');
    const packs = await installPacks(dataDir, c.world, req.file.buffer);
    await management.pending('Paquetes modificados. Inicia Bedrock para aplicar los cambios.');
    res.json({ packs });
  }));
  app.patch('/api/packs/:id', mutate(async (req, res) => {
    if (typeof req.body.enabled !== 'boolean') throw new Error('Estado inválido.');
    await requireStopped();
    const c = await config();
    await togglePack(dataDir, c.world, req.params.id, req.body.enabled);
    await management.pending('Paquetes modificados. Inicia Bedrock para aplicar los cambios.');
    res.json({ ok: true });
  }));
  app.get('/api/allowlist', async (_req, res) => res.json(await readJson(path.join(dataDir, 'allowlist.json'), [])));
  app.post('/api/allowlist', mutate(async (req, res) => {
    await config(); await requireStopped();
    const name = req.body.name;
    if (typeof name !== 'string' || !/^[A-Za-z0-9 _-]{1,32}$/.test(name) || !name.trim()) throw new Error('Gamertag inválido.');
    const file = path.join(dataDir, 'allowlist.json');
    const players = await readJson(file, []);
    if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('El jugador ya está en la lista.');
    players.push({ name: name.trim(), ignoresPlayerLimit: false });
    await writeJson(file, players); await management.pending('Whitelist modificada. Inicia Bedrock para aplicar los cambios.'); res.json({ ok: true });
  }));
  app.delete('/api/allowlist/:name', mutate(async (req, res) => {
    await config(); await requireStopped();
    const file = path.join(dataDir, 'allowlist.json');
    await writeJson(file, (await readJson(file, [])).filter(p => p.name !== req.params.name));
    await management.pending('Whitelist modificada. Inicia Bedrock para aplicar los cambios.');
    res.json({ ok: true });
  }));
  app.get('/api/worlds', async (_req, res) => {
    const c = await readJson(configFile, null);
    res.json({ active: c?.world || null, worlds: await management.store.listWorlds(c?.world), runtime: await management.runtime() });
  });
  app.get('/api/worlds/seed', async (_req, res) => {
    const c = await readJson(configFile, null);
    if (!c) return res.json({ seed: null, message: 'Instala un servidor o escribe una semilla para explorar.' });
    try { res.json(await readWorldSeed(dataDir, c.world)); }
    catch (e) { if (e.code === 'ENOENT') return res.json({ seed: null, world: c.world, message: 'El mundo aún no tiene level.dat. Inicia el servidor para generarlo o escribe una semilla.' }); throw e; }
  });
  app.post('/api/worlds/select', background('Preparando cambio de mundo…', req => management.selectWorld(req.body.name)));
  app.post('/api/worlds/create', background('Preparando un nuevo mundo…', req => management.selectWorld(req.body.name, true)));
  const worldUploadDir = path.join(panelDir, 'uploads');
  const worldUpload = multer({ dest: worldUploadDir, limits: { fileSize: 1024 ** 3, files: 1, fields: 1, fieldSize: 256 } });
  app.post('/api/worlds/import', async (req, res, next) => {
    await ready;
    if (recoveryError) return next(recoveryError);
    if (!lock()) return res.status(409).json({ error: 'Hay otra operación en curso.' });
    try {
      await fs.mkdir(worldUploadDir, { recursive: true });
      await new Promise((resolve, reject) => worldUpload.single('file')(req, res, e => e ? reject(e) : resolve()));
      if (!req.file || !/\.(mcworld|zip)$/i.test(req.file.originalname)) throw new Error('Sube un archivo .mcworld o .zip (máximo 1 GB).');
      safeWorld(req.body.name);
      job.status = 'running'; job.message = 'Preparando importación del mundo…'; delete job.result;
      res.status(202).json({ ok: true });
      try { job.result = await management.importWorld(req.body.name, req.file.path); job.status = 'done'; job.message = 'Mundo importado. Inicia el servidor para aplicarlo.'; }
      catch (e) { job.status = 'error'; job.message = e.message; }
    } catch (e) { next(e); }
    finally { if (req.file) await fs.rm(req.file.path, { force: true }); busy = false; metrics.invalidate(); }
  });
  app.get('/api/backups', async (_req, res) => res.json({ backups: await management.store.listBackups(), schedule: await management.schedule() }));
  app.post('/api/backups', background('Preparando copia de seguridad…', req => management.backup('manual', req.body?.label || 'Copia manual')));
  app.post('/api/backups/:id/restore', background('Preparando restauración…', req => management.restore(req.params.id)));
  app.post('/api/backups/:id/verify', background('Verificando la copia…', async req => { const m = await management.store.verify(req.params.id); return { verified: true, id: m.id, files: m.files }; }));
  app.delete('/api/backups/:id', mutate(async (req, res) => { await management.store.removeBackup(req.params.id); metrics.invalidate(); res.json({ ok: true }); }));
  app.put('/api/backups/schedule', mutate(async (req, res) => res.json(await management.saveSchedule(req.body))));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
  app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));
  app.use((err, _req, res, _next) => {
    console.error(err.message);
    if (!res.headersSent) res.status(err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 400)).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Archivo demasiado grande: paquetes hasta 100 MB; mundos hasta 1 GB.' : err.message || 'No se pudo completar la operación.' });
  });
  return app;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { createApp().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Bedrock Panel disponible en el puerto ${process.env.PORT || 3000}`)); }
  catch (e) { console.error(e.message); process.exitCode = 1; }
}
