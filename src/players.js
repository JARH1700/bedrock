import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readJson, writeJson } from './packs.js';

export function identity(input) {
  const value = String(input || '').trim();
  let xuid;
  if (/^\d{1,20}$/.test(value)) xuid = BigInt(value);
  else if (/^00000000-0000-0000-[\da-f]{4}-[\da-f]{12}$/i.test(value)) xuid = BigInt(`0x${value.replaceAll('-', '').slice(16)}`);
  else {
    if (!/^[A-Za-z0-9 _-]{1,32}$/.test(value)) throw new Error('Introduce un gamertag, XUID o UUID de Floodgate válido.');
    return { gamertag: value };
  }
  if (xuid < 1n || xuid > 18446744073709551615n) throw new Error('XUID fuera de rango.');
  const hex = xuid.toString(16).padStart(16, '0');
  return { xuid: String(xuid), uuid: `00000000-0000-0000-${hex.slice(0, 4)}-${hex.slice(4)}` };
}

export function connections(logs) {
  return String(logs).split('\n').flatMap(line => {
    const match = line.trim().match(/^(\d{4}-\d\d-\d\dT\S+)\s+\[[^\]\r\n]*\bINFO\]\s+Player (connected|disconnected): ([^,\r\n]+), xuid: (\d{1,20})(?:,.*)?$/);
    if (!match || !Number.isFinite(Date.parse(match[1]))) return [];
    try { return [{ ...identity(match[4]), name: match[3].trim(), online: match[2] === 'connected', at: new Date(match[1]).toISOString() }]; } catch { return []; }
  });
}

export function createPlayers({ inspect, container, panelDir, fetcher = fetch }) {
  const cache = new Map(), pending = new Map();
  let polling, collectionError = null, roster = [], loaded = false, generation = null;
  async function loadRoster() {
    if (!loaded) { roster = panelDir ? await readJson(path.join(panelDir, 'players.json'), []) : []; loaded = true; }
  }
  const localKey = value => createHash('sha256').update(value.toLowerCase()).digest('hex');
  async function localProfile(id) {
    if (!panelDir) return null;
    for (const value of [id.xuid, id.gamertag].filter(Boolean)) {
      const key = localKey(value);
      try { await fs.access(path.join(panelDir, 'skins', `${key}.png`)); return `/api/players/local/${key}`; }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    return null;
  }
  async function json(url) {
    const response = await fetcher(url, { signal: AbortSignal.timeout(7000) });
    const text = await response.text();
    if (text.length > 100000) throw new Error('Respuesta de perfil inválida.');
    if (!response.ok) {
      if (response.status === 503 && url.includes('/xbox/xuid/') && /Unable to find user in our cache/i.test(text)) throw new Error('Geyser no conoce este gamertag. Prueba con el XUID registrado al entrar al servidor o asigna una skin PNG.');
      throw new Error('El servicio de skins no tiene datos disponibles en este momento.');
    }
    return JSON.parse(text.replace(/("xuid"\s*:\s*)(\d+)/g, '$1"$2"'));
  }
  async function lookup(input, refresh = false) {
    await loadRoster();
    let id = identity(input);
    const known = roster.find(player => player.xuid === id.xuid || player.name.toLowerCase() === id.gamertag?.toLowerCase());
    if (known) id = { ...identity(known.xuid), gamertag: known.name };
    const key = (id.xuid || id.gamertag).toLowerCase();
    const local = await localProfile(id);
    if (local) return { ...id, name: id.gamertag || id.xuid, skin: local, source: 'local', message: 'Skin asignada al panel. No modifica la apariencia dentro del juego.' };
    if (refresh && cache.get(key)?.checkedAt < Date.now() - 10000) cache.delete(key);
    if (cache.get(key)?.expires > Date.now()) return cache.get(key).value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 8) throw new Error('Hay varias búsquedas en curso. Intenta de nuevo en unos segundos.');
    const request = (async () => {
      let profile = { ...id, name: id.gamertag || id.xuid, skin: null, message: '' };
      try {
        if (!id.xuid) {
          const found = await json(`https://api.geysermc.org/v2/xbox/xuid/${encodeURIComponent(id.gamertag)}`);
          if (!found.xuid) throw new Error('Gamertag no encontrado en la caché pública. Prueba con su XUID.');
          profile = { ...profile, ...identity(String(found.xuid)) };
        } else if (!id.gamertag) {
          const found = await json(`https://api.geysermc.org/v2/xbox/gamertag/${id.xuid}`).catch(() => ({}));
          if (typeof found.gamertag === 'string') profile.name = found.gamertag;
        }
        const skin = await json(`https://api.geysermc.org/v2/skin/${profile.xuid}`);
        if (/^[a-f0-9]{32,64}$/i.test(skin.texture_id || '')) profile.skin = `/api/players/texture/${skin.texture_id}`;
        else profile.message = 'Este jugador no tiene una skin en la caché pública de Geyser. Puedes asignar su PNG al panel.';
      } catch (e) { profile.message = e.message; }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value: profile, checkedAt: Date.now(), expires: Date.now() + (profile.skin ? 21600000 : 120000) });
      return profile;
    })().finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }
  async function lookupJava(input, refresh = false) {
    const value = String(input || '').trim();
    const uuid = /^[a-f0-9]{32}$/i.test(value) ? value : /^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value) ? value.replaceAll('-', '') : null;
    if (!uuid && !/^[A-Za-z0-9_]{1,16}$/.test(value)) throw new Error('Introduce un nombre Java (hasta 16 caracteres) o UUID Java.');
    const key = `java:${value.toLowerCase()}`;
    if (refresh && cache.get(key)?.checkedAt < Date.now() - 10000) cache.delete(key);
    if (cache.get(key)?.expires > Date.now()) return cache.get(key).value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 8) throw new Error('Hay varias búsquedas en curso. Intenta de nuevo en unos segundos.');
    const request = (async () => {
      const profile = { name: value, edition: 'java', source: 'mojang', skin: null, message: '' };
      try {
        const account = uuid ? { id: uuid } : await json(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(value)}`);
        if (!/^[a-f0-9]{32}$/i.test(account.id || '')) throw new Error('No se encontró ese perfil Java.');
        const session = await json(`https://sessionserver.mojang.com/session/minecraft/profile/${account.id}`);
        if (typeof session.name !== 'string' || session.id?.toLowerCase() !== account.id.toLowerCase()) throw new Error('No se pudo verificar el perfil Java.');
        profile.name = session.name; profile.uuid = session.id;
        const property = session.properties?.find(p => p.name === 'textures');
        const texture = property?.value ? JSON.parse(Buffer.from(property.value, 'base64').toString('utf8')).textures?.SKIN : null;
        const match = typeof texture?.url === 'string' && texture.url.match(/^https?:\/\/textures\.minecraft\.net\/texture\/([a-f0-9]{32,64})$/i);
        if (!match) throw new Error('Este perfil Java no tiene una textura publicada.');
        profile.skin = `/api/players/texture/${match[1]}`;
        profile.message = 'Skin de Java Edition verificada con Mojang. No confirma que sea la cuenta o skin de ese jugador en Bedrock.';
      } catch (e) { profile.message = e.message; }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value: profile, checkedAt: Date.now(), expires: Date.now() + (profile.skin ? 21600000 : 120000) });
      return profile;
    })().finally(() => pending.delete(key));
    pending.set(key, request); return request;
  }
  function withDefault(profile) {
    const key = profile.xuid || profile.uuid || profile.gamertag || profile.name;
    const defaultModel = createHash('sha256').update(String(key).toLowerCase()).digest()[0] % 2 ? 'alex' : 'steve';
    const fallbackAvatar = `/avatars/${defaultModel}.svg`;
    if (profile.skin) return { ...profile, defaultModel, fallbackAvatar };
    return { ...profile, source: 'default', defaultModel, fallbackAvatar, avatar: fallbackAvatar,
      message: `No se encontró una skin pública. Avatar predeterminado de ${defaultModel === 'alex' ? 'Alex' : 'Steve'}; no es la skin real del jugador.` };
  }
  async function lookupAuto(input, refresh = false) {
    const value = String(input || '').trim();
    if (/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(value) && !/^00000000-0000-0000-/i.test(value)) return withDefault(await lookupJava(value, refresh));
    const bedrock = await lookup(value, refresh);
    if (bedrock.skin) return withDefault(bedrock);
    const name = bedrock.gamertag || (bedrock.name !== bedrock.xuid ? bedrock.name : null);
    if (name && /^[A-Za-z0-9_]{1,16}$/.test(name)) {
      try {
        const java = await lookupJava(name, refresh);
        if (java.skin) return withDefault({ ...bedrock, skin: java.skin, source: 'java-fallback', javaUuid: java.uuid,
          message: 'Skin de Java obtenida automáticamente por coincidencia de nombre. No verifica que sea la misma cuenta de Bedrock.' });
      } catch { /* A temporary provider failure still has a local default avatar. */ }
    }
    return withDefault(bedrock);
  }
  async function saveSkin(input, png) {
    const id = identity(input);
    if (!Buffer.isBuffer(png) || png.length < 33 || png.length > 1024 * 1024 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.subarray(12,16).toString() !== 'IHDR') throw new Error('Sube una skin PNG válida, de hasta 1 MB.');
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    if (![64,128,256].includes(width) || ![width, width / 2].includes(height)) throw new Error('La skin debe medir 64×64, 64×32 o sus equivalentes de 128 o 256 píxeles.');
    const key = localKey(id.xuid || id.gamertag), dir = path.join(panelDir, 'skins');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${key}.png`), png);
    cache.clear();
    return { ok: true };
  }
  async function localTexture(key) {
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Imagen inválida.');
    return fs.readFile(path.join(panelDir, 'skins', `${key}.png`));
  }
  async function clearSkin(input) {
    await loadRoster();
    const id = identity(input), known = roster.find(p => p.xuid === id.xuid || p.name.toLowerCase() === id.gamertag?.toLowerCase());
    for (const value of new Set([id.xuid, id.gamertag, known?.xuid, known?.name].filter(Boolean))) {
      try { await fs.unlink(path.join(panelDir, 'skins', `${localKey(value)}.png`)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
    cache.clear(); return { ok: true };
  }
  async function texture(hash) {
    if (!/^[a-f0-9]{32,64}$/i.test(hash)) throw new Error('Textura inválida.');
    if (![...cache.values()].some(entry => entry.value.skin === `/api/players/texture/${hash}`)) throw new Error('Busca el perfil antes de cargar su textura.');
    const response = await fetcher(`https://textures.minecraft.net/texture/${hash}`, { signal: AbortSignal.timeout(7000) });
    if (!response.ok) throw new Error('No se pudo descargar la skin.');
    const chunks = []; let size = 0;
    for await (const chunk of response.body) { size += chunk.length; if (size > 1024 * 1024) { await response.body.cancel?.().catch(() => {}); throw new Error('Skin demasiado grande.'); } chunks.push(Buffer.from(chunk)); }
    const png = Buffer.concat(chunks);
    if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.readUInt32BE(16) > 2048 || png.readUInt32BE(20) > 2048) throw new Error('Imagen de skin inválida.');
    return png;
  }
  async function collect() {
    if (polling) return polling;
    polling = (async () => {
      await loadRoster();
      try {
        const info = await inspect();
        const currentGeneration = info?.State?.Running ? `${info.Id}:${info.State.StartedAt}` : null;
        if (generation !== currentGeneration || !currentGeneration) roster.forEach(p => { p.online = currentGeneration ? null : false; });
        generation = currentGeneration;
        if (info?.State?.Running) {
          const start = Date.parse(info.State.StartedAt);
          const logs = await container().logs({ stdout: true, stderr: true, timestamps: true, tail: 10000, since: Math.floor(start / 1000) || 0 });
          for (const event of connections(Buffer.isBuffer(logs) ? logs.toString('utf8') : logs)) {
            if (Number.isFinite(start) && Date.parse(event.at) < start) continue;
            let player = roster.find(p => p.xuid === event.xuid);
            if (!player) { player = { xuid: event.xuid, firstSeen: event.at }; roster.push(player); }
            Object.assign(player, { name: event.name, online: event.online, lastSeen: event.at });
          }
        }
        collectionError = null;
        roster = roster.slice(-1000);
        const persisted = roster.map(({ online, ...player }) => player);
        if (JSON.stringify(await readJson(path.join(panelDir, 'players.json'), [])) !== JSON.stringify(persisted)) await writeJson(path.join(panelDir, 'players.json'), persisted);
        for (const player of roster.filter(p => p.online).slice(-4)) lookupAuto(player.xuid).catch(() => {});
      } catch { collectionError = 'No se pueden consultar las conexiones de Bedrock.'; roster.forEach(p => { p.online = null; }); }
      return { players: roster, error: collectionError };
    })().finally(() => { polling = null; });
    return polling;
  }
  return { lookup, lookupAuto, lookupJava, withDefault, texture, collect, saveSkin, localTexture, clearSkin };
}
