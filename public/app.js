import { initOperations } from './operations.js?v=1';
import { initPlayers } from './players.js';
import { initConsoleHelp } from './console-help.js';
import { initSeedFinder } from './seed-finder.js';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
let status = null, authenticated = false, refreshing = false, lastInstalled = false;
const history = { cpu: [], memory: [] };
const names = { overview: 'Vista general', console: 'Consola', addons: 'Addons', textures: 'Texture packs', players: 'Whitelist', setup: 'Instalación', metrics: 'Métricas', worlds: 'Mundos', backups: 'Copias de seguridad' };
names.seedfinder = 'Seed Finder';
let operations;
const community = initPlayers({ api, textElement, icon });
const states = { running: 'En línea', exited: 'Detenido', created: 'Creado', restarting: 'Reiniciando', paused: 'Pausado', dead: 'Error', 'not-installed': 'Sin instalar' };
const modes = { survival: 'Supervivencia', creative: 'Creativo', adventure: 'Aventura' };
let toastTimer;
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('icon'); svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
}
function confirmAction(title, description) {
  const dialog = $('#confirm-dialog');
  dialog.setAttribute('aria-labelledby', 'confirm-title'); dialog.setAttribute('aria-describedby', 'confirm-description');
  if (dialog.open) return Promise.resolve(false);
  $('#confirm-title').textContent = title; $('#confirm-description').textContent = description;
  dialog.returnValue = 'cancel'; dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}
$('#password-toggle').addEventListener('click', e => {
  const input = $('#login-password'), visible = input.type === 'password';
  input.type = visible ? 'text' : 'password'; e.currentTarget.textContent = visible ? 'Ocultar' : 'Ver';
  e.currentTarget.setAttribute('aria-pressed', String(visible)); e.currentTarget.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
});
$$('svg.icon').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
window.addEventListener('resize', () => {
  if (authenticated && page() === 'overview') { chart('#cpu-chart', history.cpu); chart('#memory-chart', history.memory); }
});
function toast(message, error = false) { $('#toast').textContent = message; $('#toast').className = `toast${error ? ' error' : ''}`; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').hidden = true, error ? 10000 : 5500); }
async function api(url, options = {}) {
  const headers = { 'X-Panel-Request': '1', ...options.headers };
  if (options.body && !(options.body instanceof FormData)) { headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
  const response = await fetch(`/api${url}`, { ...options, headers });
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('La conexión no devolvió datos del panel. Comprueba si un proxy o antivirus está bloqueando la solicitud.');
  const data = await response.json();
  if (!response.ok) { if (response.status === 401 && url !== '/login') showLogin(); throw new Error(data.error || 'Error de conexión.'); }
  return data;
}
function showLogin() { authenticated = false; $('#login').hidden = false; $('#app').hidden = true; }
function page() { return names[location.hash.slice(1)] ? location.hash.slice(1) : 'overview'; }
function navigate() {
  const current = page();
  $$('.page').forEach(el => el.hidden = el.id !== `page-${current}`);
  $$('nav a').forEach(el => { el.classList.toggle('active', el.dataset.page === current); if (el.dataset.page === current) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); });
  $('#breadcrumb').textContent = names[current];
  if (authenticated) {
    loadPage().catch(e => toast(e.message, true));
    if (current === 'overview') { chart('#cpu-chart', history.cpu); chart('#memory-chart', history.memory); }
  }
}
window.addEventListener('hashchange', navigate);
async function enter() {
  status = await api('/status'); authenticated = true;
  $('#login').hidden = true; $('#app').hidden = false;
  renderStatus();
  if (!location.hash) location.hash = 'overview';
  navigate(); await refresh();
}
$('#login-form').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.currentTarget.querySelector('button[type="submit"]'); button.disabled = true; button.classList.add('is-loading');
  try { await api('/login', { method: 'POST', body: { password: new FormData(e.currentTarget).get('password') } }); $('#login-error').textContent = ''; e.target.reset(); await enter(); }
  catch (err) { $('#login-error').textContent = err.message; } finally { button.disabled = false; button.classList.remove('is-loading'); }
});
$('#logout').addEventListener('click', async () => { try { await api('/logout', { method: 'POST' }); showLogin(); } catch (e) { toast(e.message, true); } });
function renderStatus() {
  const c = status.config;
  $('#sidebar-name').textContent = c?.name || 'Mi servidor';
  $('#hero-name').textContent = c?.name || 'Tu mundo. Tu siguiente aventura.';
  $('#hero-description').textContent = c ? `Mundo: ${c.world} · Hasta ${c.maxPlayers} jugadores` : 'Todo listo para empezar algo extraordinario.';
  $('#hero-install').hidden = status.installed;
  $('#state-dot').classList.toggle('online', status.status === 'running');
  $('#server-state').textContent = states[status.status] || status.status;
  $('#server-state').classList.toggle('online', status.status === 'running');
  $('#server-port').textContent = `UDP ${c?.port || 19132}`;
  $('#server-mode').textContent = modes[c?.gamemode] || 'Supervivencia';
  $('#docker-warning').hidden = status.docker;
  $('#docker-warning').textContent = 'Sin conexión con Docker. Puedes explorar el panel; conecta el motor para instalar y administrar tu servidor.';
  $('#docker-warning').title = status.dockerError || '';
  $('#job-notice').hidden = status.job.status === 'idle';
  $('#job-notice').textContent = status.job.message;
  $('#job-notice').classList.toggle('warning', status.job.status === 'error');
  $$('[data-power]').forEach(b => b.disabled = !status.installed || !status.docker || status.busy || (b.dataset.power === 'start' && status.status === 'running') || (b.dataset.power === 'stop' && status.status !== 'running'));
  $('#installed-note').hidden = !status.installed;
  $$('#setup-form input, #setup-form select, #setup-form button').forEach(el => el.disabled = status.installed || status.busy || !status.docker);
  $('#install-button').replaceChildren(document.createTextNode(status.busy ? 'Instalando…' : status.installed ? 'Servidor instalado' : 'Instalar mi servidor'), icon('arrow'));
  if (c && !$('#setup-form').dataset.loaded) {
    for (const [key, value] of Object.entries(c)) { const input = $('#setup-form').elements.namedItem(key); if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } }
    $('#setup-form').dataset.loaded = 'true';
  }
  $('#allowlist-status').textContent = c?.allowlist ? 'Whitelist activada' : 'Whitelist desactivada';
  const canEdit = status.installed && status.docker && status.status !== 'running' && !status.busy;
  $$('.pack-file, #player-form input, #player-form button, [data-pack], [data-remove-player]').forEach(el => el.disabled = !canEdit);
  $$('#command-form input, #command-form button, [data-command]').forEach(el => el.disabled = status.status !== 'running' || status.busy || !status.docker);
  if (status.status !== 'running') $('#uptime-label').textContent = states[status.status] || status.status;
  operations?.renderStatus(status);
}
function bytes(value) { if (!Number.isFinite(value)) return '—'; if (value < 1024) return `${value} B`; const unit = Math.min(3, Math.floor(Math.log(value) / Math.log(1024))); return `${(value / 1024 ** unit).toFixed(1)} ${['B', 'KB', 'MB', 'GB'][unit]}`; }
function duration(value) { const m = Math.floor(value / 60), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m ${Math.floor(value) % 60}s`; }
function chart(id, values) {
  const canvas = $(id), rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * scale); canvas.height = 40 * scale;
  const ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  let pixel = true; try { pixel = localStorage.getItem('bedrock-chart-style') !== 'classic'; } catch {}
  if (pixel) {
    ctx.imageSmoothingEnabled = false;
    for (let x = 0; x < w; x += 8 * scale) for (let y = 0; y < h; y += 8 * scale) {
      ctx.fillStyle = '#64894a12'; ctx.fillRect(x, y, 6 * scale, 6 * scale);
    }
    canvas.parentElement.classList.toggle('has-data', values.filter(Number.isFinite).length >= 2);
    const max = Math.max(1, ...values.filter(Number.isFinite)) * 1.2;
    let previous = null;
    values.forEach((v, i) => {
      if (!Number.isFinite(v)) { previous = null; return; }
      const x = Math.round(i * w / Math.max(1, values.length - 1)), y = Math.round(h - v / max * (h - 6 * scale));
      if (previous) {
        ctx.fillStyle = '#709d4c30'; ctx.fillRect(previous.x, previous.y, x - previous.x, h - previous.y);
        ctx.fillStyle = '#648e42'; ctx.fillRect(previous.x, previous.y, x - previous.x, 2 * scale); ctx.fillRect(x - scale, Math.min(y, previous.y), 2 * scale, Math.max(2 * scale, Math.abs(y - previous.y)));
      }
      ctx.fillStyle = '#648e42'; ctx.fillRect(x - 2 * scale, y - 2 * scale, 4 * scale, 4 * scale); previous = { x, y };
    });
    return;
  }
  canvas.parentElement.classList.toggle('has-data', values.length >= 2);
  if (values.length < 2) return;
  const max = Math.max(1, ...values) * 1.2;
  ctx.beginPath(); values.forEach((v, i) => { const x = i * w / (values.length - 1), y = h - v / max * (h - 6 * scale); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
  ctx.strokeStyle = '#409c77'; ctx.lineWidth = 1.5 * scale; ctx.stroke(); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = '#409c7715'; ctx.fill();
}
window.addEventListener('chart-style-change', () => { if (authenticated && page() === 'overview') { chart('#cpu-chart', history.cpu); chart('#memory-chart', history.memory); } });
function resetMetrics() { for (const id of ['cpu', 'memory', 'network-rx', 'uptime']) $(`#${id}`).textContent = '—'; $('#memory-limit').textContent = 'Sin datos del contenedor'; $('#network-tx').textContent = 'Red enviada: —'; history.cpu = []; history.memory = []; chart('#cpu-chart', []); chart('#memory-chart', []); }
async function loadMetrics() {
  if (!status.installed || !status.docker || status.status !== 'running') { resetMetrics(); return; }
  try {
    const m = await api('/server/stats');
    if (!m.running) { resetMetrics(); return; }
    $('#cpu').textContent = m.cpu == null ? '—' : `${m.cpu.toFixed(1)} %`; $('#memory').textContent = bytes(m.memory); $('#memory-limit').textContent = `de ${bytes(m.memoryLimit)} disponibles`;
    $('#network-rx').textContent = bytes(m.rx); $('#network-tx').textContent = `Red enviada: ${bytes(m.tx)}`; $('#uptime').textContent = duration(m.uptime); $('#uptime-label').textContent = `Contenedor activo desde hace ${duration(m.uptime)}`;
    history.cpu.push(m.cpu); history.memory.push(m.memory); for (const key of ['cpu', 'memory']) if (history[key].length > 40) history[key].shift();
    chart('#cpu-chart', history.cpu); chart('#memory-chart', history.memory);
  } catch (e) { resetMetrics(); throw e; }
}
async function loadLogs() {
  if (!status.installed || !status.docker) return;
  const data = await api('/logs'); const el = $('#logs'); const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 40;
  el.textContent = data.text || 'Esperando registros de Bedrock…'; if (atBottom) el.scrollTop = el.scrollHeight;
  $('#logs-preview').textContent = data.text.split('\n').slice(-9).join('\n') || 'Esperando registros…';
}
function textElement(tag, value, className) { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; }
async function loadPacks() {
  if (!status.config) { for (const target of ['#addons-list', '#textures-list']) $(target).replaceChildren(textElement('div', 'Instala el servidor para gestionar sus paquetes.', 'empty')); return; }
  const packs = await api('/packs');
  for (const [target, kind] of [['#addons-list', 'behavior'], ['#textures-list', 'resource']]) {
    const items = packs.filter(p => p.kind === kind); $(target).replaceChildren();
    if (!items.length) $(target).append(textElement('div', 'Todavía no hay paquetes. Sube el primero para personalizar tu mundo.', 'empty'));
    for (const pack of items) {
      const row = textElement('article', '', 'pack-row'); const mark = textElement('span', '', 'shortcut-icon'); mark.append(icon(kind === 'behavior' ? 'cube' : 'layers')); row.append(mark);
      const info = textElement('div', '', 'pack-info'); info.append(textElement('strong', pack.name), textElement('p', pack.description || 'Sin descripción'), textElement('small', `v${pack.version.join('.')} · ${pack.id}`)); row.append(info, textElement('span', pack.enabled ? 'Activo' : 'Inactivo', 'badge'));
      const button = textElement('button', pack.enabled ? 'Desactivar' : 'Activar', 'secondary'); button.dataset.pack = pack.id;
      button.addEventListener('click', () => perform(button, async () => { await api(`/packs/${encodeURIComponent(pack.id)}`, { method: 'PATCH', body: { enabled: !pack.enabled } }); await loadPacks(); toast('Paquete actualizado. Se aplicará al iniciar el servidor.'); })); row.append(button); $(target).append(row);
    }
  }
  renderStatus();
}
async function loadPlayers() {
  const players = await api('/allowlist'); $('#players-count').textContent = players.length; $('#players-list').replaceChildren();
  if (!players.length) $('#players-list').append(textElement('div', 'No hay jugadores en la lista. Agrega un gamertag para darle acceso.', 'empty'));
  for (const player of players) {
    const row = textElement('div', '', 'player-row'); row.append(community.avatar(player.xuid || player.name, player.name), textElement('strong', player.name));
    const button = textElement('button', 'Eliminar', 'danger'); button.dataset.removePlayer = player.name;
    button.addEventListener('click', async () => { if (await confirmAction('¿Quitar acceso?', `${player.name} dejará de formar parte de la whitelist. Puedes agregarlo de nuevo cuando quieras.`)) perform(button, async () => { await api(`/allowlist/${encodeURIComponent(player.name)}`, { method: 'DELETE' }); await loadPlayers(); toast('Jugador eliminado de la whitelist.'); }); }); row.append(button); $('#players-list').append(row);
  }
  renderStatus();
}
window.addEventListener('player-skin-updated', () => { if (authenticated && page() === 'players') loadPlayers().catch(e => toast(e.message, true)); });
async function loadPage() { if (['addons', 'textures'].includes(page())) await loadPacks(); if (page() === 'players') await Promise.all([loadPlayers(), community.load()]); if (page() === 'console') await loadLogs(); await operations?.loadPage(); }
async function refresh() {
  if (!authenticated || refreshing) return; refreshing = true;
  try {
    status = await api('/status'); renderStatus();
    if (page() === 'players') await community.load();
    if (status.installed && !lastInstalled) await loadPage(); lastInstalled = status.installed;
    const results = await Promise.allSettled([page() === 'overview' ? loadMetrics() : page() === 'metrics' ? operations.loadMetrics() : Promise.resolve(), ['overview', 'console'].includes(page()) ? loadLogs() : Promise.resolve()]);
    const failed = results.find(r => r.status === 'rejected'); if (failed) toast(failed.reason.message, true);
  } catch (e) { toast(e.message, true); } finally { refreshing = false; }
}
async function perform(button, fn) { if (button) { button.disabled = true; button.classList.add('is-loading'); button.setAttribute('aria-busy', 'true'); } try { await fn(); } catch (e) { toast(e.message, true); } finally { if (button) { button.disabled = false; button.classList.remove('is-loading'); button.removeAttribute('aria-busy'); } await refresh(); } }
$$('.refresh').forEach(b => b.addEventListener('click', () => perform(b, refresh)));
$$('[data-power]').forEach(button => button.addEventListener('click', async () => {
  const action = button.dataset.power;
  if (action !== 'start' && !await confirmAction(`¿${action === 'stop' ? 'Detener' : 'Reiniciar'} el servidor?`, 'Los jugadores se desconectarán. El mundo se guardará antes de completar la acción.')) return;
  perform(button, async () => { await api('/power', { method: 'POST', body: { action } }); toast('Acción completada.'); });
}));
$('#setup-form').addEventListener('submit', e => {
  e.preventDefault(); const form = new FormData(e.currentTarget); const body = Object.fromEntries(form); body.allowlist = form.has('allowlist'); body.eula = form.has('eula');
  perform($('#install-button'), async () => { await api('/install', { method: 'POST', body }); toast('Instalación iniciada. Puedes seguir el progreso en este panel.'); });
});
$('#command-form').addEventListener('submit', e => { e.preventDefault(); const input = e.currentTarget.elements.command; perform(e.currentTarget.querySelector('button'), async () => { await api('/command', { method: 'POST', body: { command: input.value } }); input.value = ''; toast('Comando enviado.'); await loadLogs(); }); });
$$('[data-command]').forEach(b => b.addEventListener('click', () => { $('#command-form').elements.command.value = b.dataset.command; $('#command-form').elements.command.focus(); }));
$('#player-form').addEventListener('submit', e => { e.preventDefault(); const input = e.currentTarget.elements.name; perform(e.currentTarget.querySelector('button'), async () => { await api('/allowlist', { method: 'POST', body: { name: input.value } }); input.value = ''; await loadPlayers(); toast('Jugador agregado.'); }); });
async function upload(file, input) {
  if (!file) return;
  if (file.size > 100 * 1024 * 1024) return toast('El tamaño máximo es 100 MB.', true);
  if (!status.installed || status.status === 'running' || status.busy) return toast('Instala y detén el servidor antes de subir paquetes.', true);
  await perform(input, async () => { const data = new FormData(); data.append('file', file); toast('Validando e instalando el paquete…'); const result = await api('/packs', { method: 'POST', body: data }); await loadPacks(); toast(`${result.packs.length} paquete(s) instalado(s) y activado(s). Inicia el servidor para aplicarlos.`); });
  if (input) input.value = '';
}
$$('.pack-file').forEach(input => input.addEventListener('change', () => upload(input.files[0], input)));
$$('.upload-zone').forEach(zone => {
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); }); zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files.length !== 1) return toast('Sube un archivo a la vez.', true); upload(e.dataTransfer.files[0], zone.querySelector('input')); });
});
initConsoleHelp({ textElement, toast });
initSeedFinder({ api, toast, textElement, icon });
try {
  operations = await initOperations({ $, $$, api, toast, icon, textElement, perform, confirmAction, bytes, duration, getStatus: () => status, getPage: page });
} catch (e) { toast(e.message, true); }
navigate(); enter().catch(() => showLogin());
setInterval(refresh, 5000);
