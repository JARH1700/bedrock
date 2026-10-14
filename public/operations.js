import { drawPixelChart } from './pixel-charts.js';
export async function initOperations({ $, $$, api, toast, icon, textElement: el, perform, confirmAction, bytes, duration, getStatus, getPage }) {
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/operations.css?v=3'; document.head.append(css);
  const vaultCss = document.createElement('link'); vaultCss.rel = 'stylesheet'; vaultCss.href = '/backups-minecraft.css'; document.head.append(vaultCss);
  const worldsCss = document.createElement('link'); worldsCss.rel = 'stylesheet'; worldsCss.href = '/worlds-minecraft.css'; document.head.append(worldsCss);
  const response = await fetch('/operations.html'); if (!response.ok) throw new Error('No se pudieron cargar las secciones de administración.');
  $('.content').insertAdjacentHTML('beforeend', await response.text());
  const importForm = $('#world-form'), workbench = el('div', '', 'world-workbench');
  importForm.before(workbench);
  const createForm = el('form', '', 'card world-create-card'); createForm.id = 'world-create-form';
  createForm.innerHTML = `<div class="card-heading"><div><span class="card-overline">DESDE EL PRIMER BLOQUE</span><h3>Crear mundo</h3></div><img src="/world-grass.svg" alt="" width="38" height="38"></div><div class="world-create-body"><p class="muted">Empieza una aventura nueva desde cero.</p><label>Nombre del nuevo mundo<input name="name" required maxlength="64" placeholder="Ej. Mi nueva aventura" data-managed></label></div><div class="setup-footer"><span class="muted">Se generará al iniciar Bedrock.</span><button type="submit" class="primary" data-managed>Crear mundo</button></div>`;
  workbench.append(createForm, importForm);
  importForm.querySelector('h3').textContent = 'Importar mundo';
  importForm.querySelector('.card-overline').textContent = 'CONTINÚA TU HISTORIA';
  importForm.querySelector('.world-import-grid>label').firstChild.textContent = 'Nombre del mundo importado';
  importForm.querySelector('.world-file-label').textContent = 'Archivo del mundo';
  $('#world-file').required = true;
  $('#world-file-hint').textContent = 'Selecciona o arrastra un archivo .mcworld o .zip de hasta 1 GB.';
  importForm.querySelector('button[type=submit]').textContent = 'Importar mundo';
  importForm.querySelector('.setup-footer>.muted').textContent = 'Usa un nombre nuevo. El archivo debe incluir level.dat y la carpeta db.';
  const worldPreview = el('figure', '', 'world-preview');
  worldPreview.innerHTML = '<img src="/block-world.svg" alt="" aria-hidden="true"><figcaption>Un nuevo mundo<small>Tu próxima aventura empieza aquí.</small></figcaption>';
  createForm.querySelector('.world-create-body').append(worldPreview);
  for (const [name, label, symbol] of [['metrics', 'Métricas', 'network'], ['worlds', 'Mundos', 'layers'], ['backups', 'Copias de seguridad', 'shield']]) {
    const link = el('a', ''); link.href = `#${name}`; link.dataset.page = name; link.append(icon(symbol), el('span', label));
    $('nav').insertBefore(link, $('.nav-separator'));
  }
  const restart = el('div', '', 'notice restart-notice'); restart.id = 'restart-notice'; restart.hidden = true;
  const restartText = el('div', ''); restartText.append(el('strong', 'Reinicio pendiente'), el('p', ''));
  const restartButton = el('button', 'Iniciar y aplicar cambios', 'primary'); restartButton.type = 'button';
  restart.append(icon('refresh'), restartText, restartButton); $('.content').prepend(restart);
  restartButton.addEventListener('click', () => perform(restartButton, async () => { await api('/power', { method: 'POST', body: { action: 'restart' } }); toast('Contenedor iniciado. Revisa la consola mientras Bedrock carga el mundo.'); }));
  let lastJob = '', lastMetrics = null;
  window.addEventListener('bedrock-theme-change', () => { if (lastMetrics && getPage() === 'metrics') renderMetrics(lastMetrics); });
  let pixelMode = true;
  try { pixelMode = localStorage.getItem('bedrock-chart-style') !== 'classic'; } catch {}
  const styleControl = el('div', '', 'chart-style-control');
  const styleLabel = el('label', 'Estilo de gráficas'); styleLabel.htmlFor = 'chart-style';
  const styleSelect = el('select', ''); styleSelect.id = 'chart-style';
  for (const [name, text] of [['pixel', 'Bloques · Minecraft'], ['classic', 'Líneas · Clásico']]) { const option = el('option', text); option.value = name; styleSelect.append(option); }
  styleSelect.value = pixelMode ? 'pixel' : 'classic';
  styleControl.append(styleLabel, styleSelect, el('small', 'Mismos datos, una vista a tu estilo.'));
  $('.telemetry-charts').before(styleControl);
  const storageCard = el('article', '', 'card storage-chart');
  storageCard.innerHTML = '<div class="card-heading"><h3>Almacenamiento del servidor</h3><span class="badge">DISCO</span></div><div class="storage-blocks" role="img"></div><p class="storage-caption"></p><p class="storage-scope">Sistema de archivos que contiene los datos; incluye espacio ocupado por otros archivos.</p>';
  $('.telemetry-charts').append(storageCard);
  function applyChartStyle() {
    $('#page-metrics').classList.toggle('pixel-metrics', pixelMode);
    if (lastMetrics) renderMetrics(lastMetrics);
  }
  styleSelect.addEventListener('change', () => {
    pixelMode = styleSelect.value === 'pixel';
    try { localStorage.setItem('bedrock-chart-style', styleSelect.value); } catch {}
    window.dispatchEvent(new Event('chart-style-change'));
    applyChartStyle();
  });
  applyChartStyle();
  const when = value => value ? new Date(value).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const value = (v, format = n => String(n)) => v == null ? 'No disponible' : format(v);
  const percent = n => `${n.toFixed(1)} %`;
  const rate = n => `${bytes(n)}/s`;
  const kindName = { manual: 'Manual', scheduled: 'Programada', 'before-restore': 'Antes de restaurar' };
  function renderStatus(s) {
    restart.hidden = !s.runtime?.pendingRestart;
    restartText.querySelector('p').textContent = s.runtime?.reason || '';
    restartButton.disabled = s.busy || !s.docker || !s.installed;
    $$('[data-managed]').forEach(input => input.disabled = s.busy || !s.docker || !s.installed);
    $('#backup-now').disabled ||= !!s.runtime?.pendingRestart;
    const token = `${s.job.status}:${s.job.message}`;
    if (token !== lastJob) {
      const previous = lastJob; lastJob = token;
      if (previous && s.job.status !== 'running' && ['worlds', 'backups', 'metrics'].includes(getPage())) loadPage().catch(e => toast(e.message, true));
    }
  }
  function draw(canvas, samples, keys, scale = 1, unit = '') {
    if (pixelMode) return drawPixelChart(canvas, samples, keys, scale, unit);
    const rect = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = Math.max(1, rect.width * dpr); canvas.height = 180 * dpr;
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); const w = rect.width, h = 180;
    const dark = document.documentElement.dataset.theme === 'dark';
    ctx.font = '10px Segoe UI'; ctx.fillStyle = dark ? '#a8baa9' : '#6b7b6f';
    const available = samples.some(s => keys.some(k => s[k] != null));
    if (!available || samples.length < 2) { ctx.textAlign = 'center'; ctx.fillText('Esperando lecturas reales del servidor…', w / 2, 90); return; }
    const max = Math.max(1, ...samples.flatMap(s => keys.map(k => (s[k] || 0) / scale))) * 1.15;
    for (let line = 0; line < 4; line++) { const y = 18 + line * 42; ctx.strokeStyle = dark ? '#314536' : '#e8eee9'; ctx.beginPath(); ctx.moveTo(48, y); ctx.lineTo(w - 18, y); ctx.stroke(); ctx.fillText(`${(max * (1 - line / 3)).toFixed(1)}`, 5, y + 3); }
    keys.forEach((key, index) => { ctx.beginPath(); let broken = true; samples.forEach((s, i) => { if (s[key] == null) { broken = true; return; } const x = 48 + i / (samples.length - 1) * (w - 66), y = 144 - s[key] / scale / max * 126; if (broken) ctx.moveTo(x, y); else ctx.lineTo(x, y); broken = false; }); ctx.strokeStyle = index ? '#a794c5' : '#2b9470'; ctx.lineWidth = 2; ctx.stroke(); });
    ctx.fillText(unit, 6, 169); ctx.fillText(new Date(samples[0].at).toLocaleTimeString('es'), 48, 169); ctx.textAlign = 'right'; ctx.fillText(new Date(samples.at(-1).at).toLocaleTimeString('es'), w - 18, 169);
  }
  function renderMetrics(m) {
    lastMetrics = m;
    $('#metrics-context').textContent = `${m.running ? 'Contenedor en ejecución' : 'Contenedor detenido o no disponible'} · Última lectura: ${when(m.at)}. Almacenamiento: ${when(m.storage?.measuredAt)}. ${m.queryAvailable ? 'Consulta Bedrock disponible.' : 'La consulta UDP de jugadores no está disponible.'}`;
    const storage = m.storage || {};
    const blocks = storageCard.querySelector('.storage-blocks'), caption = storageCard.querySelector('.storage-caption');
    const available = Number.isFinite(storage.diskTotal) && storage.diskTotal > 0 && Number.isFinite(storage.diskFree);
    blocks.replaceChildren();
    if (available) {
      const used = Math.max(0, Math.min(storage.diskTotal, storage.diskTotal - storage.diskFree)), ratio = used / storage.diskTotal;
      for (let i = 0; i < 100; i++) { const block = el('span', '', i < Math.round(ratio * 100) ? 'occupied' : 'free'); block.setAttribute('aria-hidden', 'true'); blocks.append(block); }
      caption.textContent = `${(ratio * 100).toFixed(1)} % ocupado · ${bytes(used)} usados · ${bytes(storage.diskFree)} libres`;
      blocks.setAttribute('aria-label', caption.textContent);
    } else { caption.textContent = 'Esperando una lectura real del almacenamiento.'; blocks.setAttribute('aria-label', 'Almacenamiento no disponible'); }
    const highlights = [['CPU', value(m.cpu, percent), '100 % por núcleo'], ['RAM utilizada', value(m.memory, bytes), `Límite: ${value(m.memoryLimit, bytes)}`], ['Jugadores', value(m.game?.players), `Capacidad anunciada: ${value(m.game?.capacity)}`], ['Latencia del servidor', value(m.game?.latencyMs, n => `${n} ms`), 'Consulta UDP desde el panel'], ['Mundo activo', value(storage.worldBytes, bytes), `${value(storage.worldFiles)} archivos`], ['Disco disponible', value(storage.diskFree, bytes), `Total del sistema de archivos: ${value(storage.diskTotal, bytes)}`], ['Copias guardadas', value(storage.backupsCount), value(storage.backupsBytes, bytes)], ['Tiempo activo', value(m.uptime, duration), 'Desde el inicio del contenedor']];
    $('#metrics-highlights').replaceChildren(...highlights.map(([title, main, detail]) => { const card = el('article', '', 'metric'); card.append(el('div', title, 'metric-label'), el('strong', main), el('small', detail)); return card; }));
    const groups = [
      ['Procesador y memoria', [['Núcleos visibles', m.cores], ['CPU / todos los núcleos', m.cpuNormalized, percent], ['RAM / límite', m.memoryPercent, percent], ['RAM con caché', m.memoryRaw, bytes], ['Caché descontada', m.memoryCache, bytes], ['Procesos e hilos', m.pids], ['Periodos limitados por CPU', m.throttledPeriods], ['Tiempo limitado por CPU', m.throttledSeconds, n => `${n.toFixed(2)} s`]]],
      ['Red y disco del contenedor', [['Red recibida', m.rx, bytes], ['Red enviada', m.tx, bytes], ['Velocidad de descarga', m.rxRate, rate], ['Velocidad de subida', m.txRate, rate], ['Paquetes recibidos', m.rxPackets], ['Paquetes enviados', m.txPackets], ['Errores de red', m.networkErrors], ['Paquetes descartados', m.networkDropped], ['Bytes leídos', m.diskRead, bytes], ['Bytes escritos', m.diskWrite, bytes], ['Lectura / segundo', m.diskReadRate, rate], ['Escritura / segundo', m.diskWriteRate, rate]]],
      ['Mundos y contenido', [['Todos los mundos', storage.worldsBytes, bytes], ['Paquetes instalados / bytes', storage.packsBytes, bytes], ['Behavior packs', storage.behaviorPacks], ['Resource packs', storage.resourcePacks], ['Paquetes activos del mundo', storage.activePacks], ['Jugadores en whitelist', storage.allowlistedPlayers], ['Versión anunciada por Bedrock', m.game?.version]]],
      ['Estado y protección', [['Reinicios automáticos', m.restarts], ['Última salida', m.exitCode], ['Cierre por falta de RAM', m.oomKilled == null ? null : m.oomKilled ? 'Sí' : 'No'], ['Healthcheck Docker', m.health], ['Última copia', storage.lastBackup, when], ['Duración de última copia', storage.lastBackupDurationMs, n => `${(n / 1000).toFixed(1)} s`], ['Espacio libre para copias', storage.backupDiskFree, bytes], ['Imagen del contenedor', m.image]]]
    ];
    $('#metrics-details').replaceChildren(...groups.map(([title, rows]) => { const card = el('article', '', 'card'); const heading = el('div', '', 'card-heading'); heading.append(el('h3', title)); const dl = el('dl', '', 'metric-definition'); for (const [name, data, format] of rows) { const row = el('div', ''); row.append(el('dt', name), el('dd', value(data, format))); dl.append(row); } card.append(heading, dl); return card; }));
    draw($('#telemetry-cpu'), m.history || [], ['cpu'], 1, '%'); draw($('#telemetry-memory'), m.history || [], ['memory'], 1024 ** 2, 'MB'); draw($('#telemetry-network'), m.history || [], ['rxRate', 'txRate'], 1024, 'KB/s'); draw($('#telemetry-disk'), m.history || [], ['diskReadRate', 'diskWriteRate'], 1024, 'KB/s');
  }
  async function loadMetrics() { renderMetrics(await api('/server/stats')); }
  async function loadWorlds() {
    const data = await api('/worlds'); $('#world-active-label').textContent = data.active ? `Seleccionado: ${data.active}` : 'Sin mundo activo';
    $('#worlds-list').replaceChildren();
    if (!data.worlds.length) $('#worlds-list').append(el('div', 'Todavía no hay mundos. Instala el servidor o importa tu primera aventura.', 'empty'));
    for (const world of data.worlds) {
      const row = el('article', '', 'world-row card'), mark = el('span', '', 'shortcut-icon'); mark.append(icon('layers'));
      const copy = el('div', '', 'world-copy'); copy.append(el('strong', world.name), el('small', world.error || `${bytes(world.bytes)} · ${world.files} archivos · ${world.generated ? when(world.modifiedAt) : 'Se generará al iniciar'}`));
      const button = el('button', world.active ? 'Seleccionado' : 'Usar este mundo', 'secondary');
      if (!world.active && !world.error) button.dataset.managed = ''; else button.disabled = true;
      button.addEventListener('click', async () => {
        if (!await confirmAction(`¿Cambiar a ${world.name}?`, 'El servidor se detendrá y los jugadores se desconectarán. El mundo anterior se conserva. Tendrás que iniciar Bedrock para aplicar el cambio.')) return;
        await perform(button, async () => { await api('/worlds/select', { method: 'POST', body: { name: world.name } }); toast('Cambio iniciado. Espera a que termine antes de iniciar el servidor.'); });
      }); row.append(mark, copy, button); $('#worlds-list').append(row);
    }
    renderStatus(getStatus());
  }
  const worldFile = $('#world-file'), dropzone = $('#world-dropzone');
  let dragDepth = 0;
  function showWorldFile() {
    const file = worldFile.files[0];
    dropzone.classList.toggle('has-file', !!file);
    $('#world-file-selection').hidden = !file;
    $('#world-drop-title').textContent = file ? file.name : 'Arrastra tu mundo aquí';
    $('#world-drop-description').replaceChildren(document.createTextNode(file ? 'Listo para importar · ' : 'o '), el('span', file ? 'elige otro archivo' : 'explora tus archivos', 'world-browse'));
    $('#world-file-details').textContent = file ? `${bytes(file.size)} · Archivo seleccionado` : '';
  }
  function validWorldFile(file) {
    if (!/\.(mcworld|zip)$/i.test(file.name)) { toast('Selecciona un mundo .mcworld o .zip.', true); return false; }
    if (!file.size || file.size > 1024 ** 3) { toast('El archivo debe contener datos y no superar 1 GB.', true); return false; }
    return true;
  }
  worldFile.addEventListener('change', () => { if (worldFile.files[0] && !validWorldFile(worldFile.files[0])) worldFile.value = ''; showWorldFile(); });
  $('#world-file-remove').addEventListener('click', () => { worldFile.value = ''; showWorldFile(); worldFile.focus(); });
  dropzone.addEventListener('dragenter', e => { e.preventDefault(); if (!worldFile.disabled) { dragDepth++; dropzone.classList.add('dragover'); } });
  dropzone.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = worldFile.disabled ? 'none' : 'copy'; });
  dropzone.addEventListener('dragleave', e => { e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) dropzone.classList.remove('dragover'); });
  dropzone.addEventListener('drop', e => {
    e.preventDefault(); dragDepth = 0; dropzone.classList.remove('dragover');
    if (worldFile.disabled) return toast('Conecta el servidor y espera a que terminen las operaciones para importar un mundo.', true);
    const files = e.dataTransfer.files;
    if (files.length !== 1) return toast('Arrastra un solo mundo a la vez.', true);
    if (!validWorldFile(files[0])) return;
    const selected = new DataTransfer(); selected.items.add(files[0]); worldFile.files = selected.files; showWorldFile();
  });
  $('#world-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form), file = data.get('file');
    if (!file?.size || !validWorldFile(file)) return toast('Selecciona un archivo de mundo válido para importar.', true);
    if (!await confirmAction('¿Importar este mundo?', 'Primero se detendrá Bedrock. Tus mundos anteriores se conservan. El mundo importado quedará seleccionado, con el inicio pendiente.')) return;
    await perform(form.querySelector('button[type="submit"]'), async () => { await api('/worlds/import', { method: 'POST', body: data }); toast('Importación iniciada. Puedes seguir el progreso en la parte superior.'); });
  });
  $('#world-create-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget, name = new FormData(form).get('name');
    if (!await confirmAction('¿Crear este mundo?', 'Primero se detendrá Bedrock. Tus mundos anteriores se conservan. El nuevo mundo quedará seleccionado y se generará cuando inicies el servidor.')) return;
    await perform(form.querySelector('button[type=submit]'), async () => { await api('/worlds/create', { method: 'POST', body: { name } }); toast('Creación iniciada. Inicia Bedrock cuando termine la preparación.'); });
  });
  function scheduleFields() { const interval = $('#schedule-form').elements.mode.value === 'interval'; $('#schedule-hours-field').hidden = !interval; $('#schedule-time-field').hidden = interval; }
  $('#schedule-form').elements.mode.addEventListener('change', scheduleFields);
  async function loadBackups() {
    const { backups, schedule } = await api('/backups'); $('#backup-count').textContent = backups.length; $('#backup-size').textContent = bytes(backups.reduce((n, b) => n + b.bytes, 0));
    $('#backup-next').textContent = schedule.enabled ? when(schedule.nextRun) : 'Sin programar'; $('#backup-timezone').textContent = schedule.enabled ? `Hora mostrada en tu dispositivo · Programación: ${schedule.timezone}` : 'Activa una programación para proteger tu mundo.';
    $('#schedule-summary').textContent = schedule.enabled ? (schedule.mode === 'interval' ? `Cada ${schedule.intervalHours} h · ${schedule.timezone}` : `Diaria · ${schedule.time} · ${schedule.timezone}`) : 'Desactivada';
    const form = $('#schedule-form');
    if (!form.dataset.loaded) { for (const [key, value] of Object.entries(schedule)) { const input = form.elements.namedItem(key); if (input) { if (input.type === 'checkbox') input.checked = value; else input.value = value; } } form.dataset.loaded = 'true'; scheduleFields(); }
    $('#schedule-result').textContent = schedule.lastRun ? `${schedule.lastRun.status === 'done' ? 'Última copia completada' : 'Última copia falló'}: ${when(schedule.lastRun.at)}${schedule.lastRun.error ? ` · ${schedule.lastRun.error}` : ''}` : 'Sin ejecuciones programadas todavía.';
    $('#backups-list').replaceChildren();
    if (!backups.length) $('#backups-list').append(el('div', 'Tu historial empieza con la primera copia. Guarda tu mundo para poder volver a él.', 'empty'));
    for (const b of backups) {
      const row = el('article', '', 'backup-row card'), copy = el('div', '', 'world-copy'); copy.append(el('strong', b.world), el('small', `${when(b.createdAt)} · ${bytes(b.bytes)} · ${b.files} archivos`));
      const label = el('span', kindName[b.kind] || b.kind, 'badge'), actions = el('div', '', 'backup-actions');
      for (const [action, title, style] of [['verify', 'Verificar', 'secondary'], ['restore', 'Restaurar', 'primary'], ['delete', 'Eliminar', 'danger']]) {
        const button = el('button', title, style); button.dataset.managed = '';
        button.addEventListener('click', async () => {
          if (action === 'restore' && !await confirmAction('¿Volver a esta versión?', `Se detendrá el servidor, se guardará una copia del estado actual y se restaurará ${b.world} del ${when(b.createdAt)}. Bedrock quedará detenido hasta que lo inicies.`)) return;
          if (action === 'delete' && !await confirmAction('¿Eliminar esta copia?', `Se eliminará únicamente esta copia de ${b.world} del ${when(b.createdAt)}. Esta eliminación no se puede deshacer.`)) return;
          await perform(button, async () => { await api(`/backups/${b.id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'POST' }); if (action === 'delete') { await loadBackups(); toast('Copia eliminada.'); } else toast(action === 'restore' ? 'Restauración iniciada.' : 'Verificación iniciada.'); });
        }); actions.append(button);
      } row.append(copy, label, actions); $('#backups-list').append(row);
    }
    renderStatus(getStatus());
  }
  $('#schedule-form').addEventListener('submit', e => {
    e.preventDefault(); const form = e.currentTarget, data = new FormData(form), body = Object.fromEntries(data); body.enabled = data.has('enabled');
    perform(form.querySelector('button'), async () => { await api('/backups/schedule', { method: 'PUT', body }); delete form.dataset.loaded; await loadBackups(); toast('Programación guardada.'); });
  });
  $('#backup-now').addEventListener('click', async e => {
    const button = e.currentTarget;
    if (!await confirmAction('¿Guardar una copia del mundo?', 'El servidor se detendrá para guardar una copia consistente. Los jugadores se desconectarán. Al terminar se volverá a iniciar si estaba encendido.')) return;
    perform(button, async () => { await api('/backups', { method: 'POST', body: { label: 'Copia manual' } }); toast('Copia iniciada. El progreso aparece en la parte superior.'); });
  });
  $('#worlds-refresh').addEventListener('click', e => perform(e.currentTarget, loadWorlds)); $('#backups-refresh').addEventListener('click', e => perform(e.currentTarget, loadBackups)); $('#metrics-refresh').addEventListener('click', e => perform(e.currentTarget, loadMetrics));
  async function loadPage() { if (getPage() === 'worlds') await loadWorlds(); if (getPage() === 'backups') await loadBackups(); if (getPage() === 'metrics') await loadMetrics(); }
  window.addEventListener('resize', () => { if (getPage() === 'metrics' && lastMetrics) renderMetrics(lastMetrics); });
  return { renderStatus, loadPage, loadMetrics };
}
