import { seedValue, coordinate } from './seed-utils.js';
import { engineVersions, structures } from './seed-engine.js';
import { biomeLabel } from './seed-biomes.js';
import { initCatalog, atlasImage, catalogEntries, versionSupports } from './seed-catalog.js';
import { attachNavigation } from './seed-navigation.js';
import { mapStructures, scaleBlocks } from './seed-detail.js';
import { initSeedHistory, readHistory, HISTORY_KEY } from './seed-history.js';

export function initSeedFinder({ api, toast, textElement: el, icon }) {
  const page = el('section', '', 'page seed-finder'); page.id = 'page-seedfinder'; page.hidden = true;
  page.innerHTML = `<div class="page-heading"><div><p class="eyebrow">EL ATLAS DE TU MUNDO</p><h1>Seed Finder<span class="mint">.</span></h1><p class="muted">Explora tu semilla, descubre biomas y prepara tu próxima expedición.</p></div><span class="badge">BEDROCK · BETA</span></div>
  <div class="seed-hero card"><div><p class="eyebrow">CADA BLOQUE TIENE UN DESTINO</p><h3>Tu próximo mundo, a la vista.</h3><p>Un mapa calculado aquí mismo. Elige una semilla y encuentra el lugar para tu próxima base.</p></div><svg class="icon" aria-hidden="true"><use href="#i-grid"/></svg></div>
  <form id="seed-form" class="card"><div class="card-heading"><h3>Mesa de exploración</h3><button type="button" id="seed-from-world" class="secondary">Usar mundo activo</button></div><div class="seed-fields">
  <label class="seed-main-field">Semilla numérica<input name="seed" required maxlength="21" placeholder="Ej. 262" autocomplete="off"><small>Precisión completa de 64 bits.</small></label>
  <label>Perfil de generación<select name="version"></select></label><label>Dimensión<select name="dimension"><option value="overworld">Overworld</option><option value="nether">Nether</option><option value="end">The End</option></select></label>
  <label>Coordenada X<input name="x" type="number" value="0" required min="-30000000" max="30000000" step="1"></label><label>Coordenada Z<input name="z" type="number" value="0" required min="-30000000" max="30000000" step="1"></label><label>Altura Y<input name="y" type="number" value="64" required min="-64" max="320" step="1"></label></div>
  <p id="seed-world-status" class="seed-note" role="status">Elige el perfil que generó la región. No se garantiza compatibilidad con parches posteriores, addons o chunks antiguos.</p>
  <div class="setup-footer seed-actions"><button type="button" class="secondary" id="seed-random">Semilla aleatoria</button><button type="button" class="secondary" id="seed-copy">Copiar semilla</button><button type="submit" class="primary" value="grid">Generar mapa</button></div></form>
  <article id="seed-history" class="card"></article>
  <article id="seed-atlas" class="card"></article>
  <div class="seed-workspace"><article class="card seed-coordinate-card"><div class="card-heading"><h3>Mapa de biomas</h3><label class="seed-zoom">Alcance<select id="seed-zoom"><option value="128">±128 bloques</option><option value="256">±256 bloques</option><option value="512">±512 bloques</option><option value="1024" selected>±1.024 bloques</option><option value="2048">±2.048 bloques</option><option value="4096">±4.096 bloques</option></select></label></div>
  <div class="seed-map-options"><label><input id="seed-structures-toggle" type="checkbox" checked> Estructuras previstas</label><label><input id="seed-grid-toggle" type="checkbox"> Cuadrícula</label><button id="seed-export" type="button" class="secondary" disabled>Descargar PNG</button></div>
  <p id="seed-map-status" class="seed-note" role="status">Introduce una semilla para crear tu mapa.</p><p id="seed-detail-status" class="seed-note" hidden>Escala ≥850 bloques: solo construcciones grandes. Acerca el mapa para ver las pequeñas.</p><progress id="seed-progress" max="100" value="0" hidden aria-label="Generación del mapa"></progress>
  <div class="seed-map-tools"><span>Arrastra para explorar · Rueda o dos dedos para zoom</span><button type="button" id="seed-zoom-in" class="secondary" aria-label="Acercar mapa">+</button><button type="button" id="seed-zoom-out" class="secondary" aria-label="Alejar mapa">−</button><button type="button" id="seed-home" class="secondary">X 0 · Z 0</button></div>
  <canvas id="seed-grid" height="400" tabindex="0" role="img" aria-label="Mapa interactivo: arrastra para moverte, usa la rueda o pellizca para zoom. Con teclado usa flechas y signos más y menos. Pulsa un punto para inspeccionarlo."></canvas>
  <div id="seed-selection" class="seed-selection" hidden></div>
  <p id="seed-hover" class="seed-note">Pasa el cursor por el mapa para consultar un bioma.</p><p id="seed-coordinate-status" class="seed-note" aria-live="polite"></p>
  <div class="seed-pan"><button class="secondary" type="button" data-pan="west">← Oeste</button><button class="secondary" type="button" data-pan="north">↑ Norte</button><button class="secondary" type="button" data-pan="south">↓ Sur</button><button class="secondary" type="button" data-pan="east">Este →</button></div>
  <div id="seed-legend" class="seed-legend"></div></article>
  <div class="seed-sidebar"><article class="card"><div class="card-heading"><h3>Buscar un bioma</h3></div><label>Biomas de esta dimensión<select id="seed-biome-search"><option value="">Genera un mapa primero</option></select></label><button id="seed-find-biome" class="primary" type="button" disabled>Ir al más cercano</button><p id="seed-search-feedback" class="seed-note" role="status">Busca entre las muestras del área visible a la altura seleccionada. Amplía el alcance para explorar más.</p><div class="card-heading"><h3>Estructuras previstas</h3><span id="seed-structure-count" class="badge">0</span></div><label>Tipo<select id="seed-structure-filter"><option value="all">Todas</option></select></label><div id="seed-structures" class="seed-results"></div></article>
  <article class="card"><div class="card-heading"><h3>Lugares guardados</h3><span id="seed-marker-count" class="badge">0</span></div><form id="seed-marker-form" class="seed-marker-form"><label>Nombre del lugar<input name="name" maxlength="50" placeholder="Mi próxima base" required></label><button class="primary" type="submit">Guardar coordenadas</button></form><p class="seed-note">Guardados en este navegador por semilla y dimensión.</p><div id="seed-markers"></div></article></div></div>
  <p class="notice subtle">Visor propio con el motor abierto Cubiomes Bedrock. Los colores representan muestras de biomas a una altura fija, no relieve ni bloques construidos. Las estructuras son predicciones con filtro de bioma; el terreno puede impedir su generación. Confirma los lugares en el juego. <a href="/engine/LICENSE.txt" target="_blank" rel="noopener">Licencia del motor</a>.</p>`;
  document.querySelector('.content').append(page);
  page.querySelector('.seed-hero').remove();
  const sidebar = page.querySelector('.seed-sidebar');
  sidebar.firstElementChild.id = 'seed-search-panel';
  const extras = el('div', '', 'seed-extras');
  page.querySelector('#seed-form').after(page.querySelector('#seed-atlas'));
  extras.append(page.querySelector('#seed-history'), sidebar.lastElementChild);
  page.querySelector('.seed-workspace').after(extras);
  const nav = el('a', ''); nav.href = '#seedfinder'; nav.dataset.page = 'seedfinder'; nav.append(icon('grid'), el('span', 'Seed Finder'));
  document.querySelector('nav').insertBefore(nav, document.querySelector('.nav-separator'));
  const $ = s => page.querySelector(s), form = $('#seed-form'), fields = form.elements, canvas = $('#seed-grid'), zoom = $('#seed-zoom');
  for (const version of [...engineVersions].reverse()) { const option = el('option', `Bedrock ${version}`); option.value = version; fields.version.append(option); }
  for (const [id, name] of structures) { const option = el('option', name); option.value = id; $('#seed-structure-filter').append(option); }
  let current = null, markers = [], map = null, worker = null, timer = null, generation = 0, preview = null, pendingEntry = null;
  function restoreView(row, scroll = true) {
    navigation.reset(); pendingEntry = null;
    for (const key of ['seed', 'version', 'dimension', 'x', 'y', 'z']) fields[key].value = row[key];
    if (![...zoom.options].some(o => Number(o.value) === row.range)) { zoom.querySelector('[data-custom]')?.remove(); const option = el('option', `±${row.range.toLocaleString('es')} bloques`); option.value = row.range; option.dataset.custom = 'true'; zoom.append(option); }
    zoom.value = row.range; $('#seed-structure-filter').value = 'all';
    $('#seed-world-status').textContent = 'Vista recuperada del historial de este navegador.';
    try { sync(); if (scroll) canvas.scrollIntoView({ block: 'nearest', behavior: 'auto' }); } catch (e) { toast(e.message, true); }
  }
  const history = initSeedHistory({ host: $('#seed-history'), el, open: row => restoreView(row) });
  const sprites = new Map();
  for (const [id] of structures) { const img = new Image(); img.src = atlasImage('structure', id); img.onload = () => draw(); sprites.set(id, img); }
  const catalog = initCatalog({ host: $('#seed-atlas'), el, getState: () => ({ version: fields.version.value, dimension: fields.dimension.value, map: canvas.getAttribute('aria-busy') === 'true' || fields.version.value !== current?.version || fields.dimension.value !== current?.dimension ? null : map }), choose: selectEntry });
  function selectEntry(entry) {
    if (!current) { toast('Introduce una semilla y genera el mapa para buscar.', true); return; }
    if (entry.dimension !== current.dimension || fields.version.value !== current.version || (entry.kind === 'biome' && [174,175,183].includes(entry.id) && current.y >= 32)) { fields.dimension.value = entry.dimension; if (entry.kind === 'biome' && [174,175,183].includes(entry.id)) fields.y.value = entry.id === 183 ? -32 : 16; pendingEntry = entry; sync(); return; }
    if (!map || canvas.getAttribute('aria-busy') === 'true') { pendingEntry = entry; return; }
    if (entry.kind === 'structure') { $('#seed-structure-filter').value = entry.id; showResults(); draw(); $('#seed-search-feedback').textContent = `Buscando ${entry.name}: ${filteredPoints().length} predicciones en el área visible.`; }
    else { $('#seed-biome-search').value = entry.id; findBiome(); }
    canvas.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  const storageKey = () => `bedrock-seed-markers:${current.seed}:${current.dimension}`;
  const typeName = id => structures.find(s => s[0] === id)?.[1] || 'Estructura';
  function values() {
    const y = coordinate(fields.y.value); if (y < -64 || y > 320) throw new Error('La altura debe estar entre -64 y 320.');
    return { seed: seedValue(fields.seed.value), version: fields.version.value, dimension: fields.dimension.value, x: coordinate(fields.x.value), z: coordinate(fields.z.value), y, range: Number(zoom.value) };
  }
  function readMarkers() {
    try { const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]'); markers = Array.isArray(saved) ? saved.filter(p => typeof p.name === 'string' && Number.isInteger(p.x) && Number.isInteger(p.z) && Math.abs(p.x) <= 30000000 && Math.abs(p.z) <= 30000000).slice(0, 100) : []; } catch { markers = []; }
  }
  function go(x, z) { fields.x.value = Math.max(-30000000, Math.min(30000000, x)); fields.z.value = Math.max(-30000000, Math.min(30000000, z)); try { sync(); } catch (e) { toast(e.message, true); } }
  function renderMarkers() {
    $('#seed-marker-count').textContent = markers.length; const list = $('#seed-markers'); list.replaceChildren();
    if (!markers.length) list.append(el('p', 'Todavía no hay lugares guardados.', 'empty'));
    markers.forEach((marker, index) => {
      const row = el('div', '', 'seed-marker'), copy = el('div', '', 'world-copy'); copy.append(el('strong', marker.name), el('small', `X ${marker.x} · Z ${marker.z}`));
      const jump = el('button', 'Ir', 'secondary'); jump.type = 'button'; jump.setAttribute('aria-label', `Ir a ${marker.name}`); jump.onclick = () => go(marker.x, marker.z);
      const remove = el('button', '×', 'secondary'); remove.type = 'button'; remove.setAttribute('aria-label', `Eliminar ${marker.name}`);
      remove.onclick = () => { try { const next = markers.filter((_, i) => i !== index); localStorage.setItem(storageKey(), JSON.stringify(next)); markers = next; renderMarkers(); draw(); } catch { toast('No se pudo guardar el cambio.', true); } };
      row.append(copy, jump, remove); list.append(row);
    });
  }
  function filteredPoints() { const filter = $('#seed-structure-filter').value; return (map?.points || []).filter(p => filter === 'all' || p.type === Number(filter)); }
  function visiblePoints() { const view = preview || current; return view && $('#seed-structures-toggle').checked ? mapStructures(filteredPoints(), view.range, canvas.getBoundingClientRect().width) : []; }
  function showResults() {
    const list = $('#seed-structures'); list.replaceChildren(); const points = filteredPoints().sort((a, b) => Math.hypot(a.x - current.x, a.z - current.z) - Math.hypot(b.x - current.x, b.z - current.z));
    $('#seed-structure-count').textContent = points.length;
    if (!points.length) list.append(el('p', 'Sin predicciones de este tipo en el área.', 'seed-note'));
    for (const p of points.slice(0, 80)) { const b = el('button', '', 'secondary seed-result'); b.type = 'button'; const img = el('img', ''); img.src = atlasImage('structure', p.type); img.alt = ''; img.width = 40; img.height = 32; b.append(img, el('strong', typeName(p.type)), el('small', `X ${p.x} · Z ${p.z}`)); b.onclick = () => go(p.x, p.z); list.append(b); }
    if (points.length > 80) list.append(el('p', 'Se muestran las 80 más cercanas; todas aparecen en el mapa.', 'seed-note'));
  }
  function draw() {
    const width = canvas.getBoundingClientRect().width; if (!width) return;
    const height = width * 80 / 128, dpr = devicePixelRatio || 1; canvas.style.height = `${height}px`; canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#152619'; ctx.fillRect(0, 0, width, height);
    ctx.font = '12px monospace'; ctx.textAlign = 'center';
    const view = preview || current;
    $('#seed-detail-status').hidden = !map || !view || !$('#seed-structures-toggle').checked || scaleBlocks(view.range, width) < 850;
    if (map && view) { const scale = map.view.range / view.range, left = width / 2 + (map.view.x - map.view.range - view.x) / (view.range * 2) * width, top = height / 2 + (map.view.z - map.view.range * map.rows / map.size - view.z) / (view.range * 2) * width; ctx.drawImage(map.image, left, top, width * scale, height * scale); }
    else { ctx.fillStyle = '#b6cc97'; ctx.fillText(current ? 'Calculando el mapa…' : 'Tu expedición empieza con una semilla', width / 2, height / 2); }
    if ($('#seed-grid-toggle').checked) { ctx.strokeStyle = '#ffffff40'; for (let i = 0; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(i * width / 8, 0); ctx.lineTo(i * width / 8, height); ctx.moveTo(0, i * width / 8); ctx.lineTo(width, i * width / 8); ctx.stroke(); } }
    if (!map) return;
    const px = x => width / 2 + (x - view.x) / (view.range * 2) * width, pz = z => height / 2 + (z - view.z) / (view.range * 2) * width;
    if ($('#seed-structures-toggle').checked) { const occupied = new Set(); for (const p of visiblePoints()) { const x = px(p.x), y = pz(p.z); if (x < 0 || y < 0 || x > width || y > height) continue; const cell = `${Math.floor(x / 22)},${Math.floor(y / 22)}`; if (occupied.has(cell)) continue; occupied.add(cell); const img = sprites.get(p.type); ctx.fillStyle = '#171c18'; ctx.fillRect(x - 13, y - 12, 26, 24); if (img?.complete && img.naturalWidth) ctx.drawImage(img, x - 12, y - 10, 24, 20); } }
    for (const p of markers) { const x = px(p.x), y = pz(p.z); if (x < 0 || x > width || y < 0 || y > height) continue; ctx.fillStyle = '#101810'; ctx.fillRect(x - 6, y - 6, 12, 12); ctx.fillStyle = '#fff'; ctx.fillRect(x - 3, y - 3, 6, 6); }
    ctx.fillStyle = '#111'; ctx.fillRect(width / 2 - 10, height / 2 - 2, 20, 4); ctx.fillRect(width / 2 - 2, height / 2 - 10, 4, 20); ctx.fillStyle = '#fff'; ctx.fillRect(width / 2 - 8, height / 2, 16, 1); ctx.fillRect(width / 2, height / 2 - 8, 1, 16);
    ctx.fillStyle = '#101810dd'; ctx.fillRect(width / 2 - 38, 4, 76, 22); ctx.fillStyle = '#fff'; ctx.fillText('N · −Z', width / 2, 19);
    ctx.fillStyle = '#101810dd'; ctx.fillRect(8, height - 37, 116, 29); ctx.fillStyle = '#fff'; ctx.fillRect(17, height - 17, 90, 2); ctx.fillText(`${scaleBlocks(view.range, width)} bloques`, 64, height - 23);
  }
  function sync() {
    const next = values(); if (!engineVersions.includes(next.version)) throw new Error('Selecciona un perfil compatible.');
    if (!map || ['seed', 'dimension', 'version', 'y'].some(key => map.view[key] !== next[key])) map = null;
    current = next; preview = null; readMarkers(); renderMarkers(); draw(); $('#seed-selection').hidden = true;
    $('#seed-coordinate-status').textContent = `X ${current.x} · Y ${current.y} · Z ${current.z} | Chunk ${Math.floor(current.x / 16)}, ${Math.floor(current.z / 16)}`;
    $('#seed-map-status').textContent = 'Calculando biomas y estructuras en tu navegador…'; $('#seed-progress').hidden = false; $('#seed-progress').value = 0; canvas.setAttribute('aria-busy', 'true');
    const selectedBiome = $('#seed-biome-search').value;
    $('#seed-export').disabled = true; $('#seed-find-biome').disabled = true; $('#seed-biome-search').replaceChildren(); $('#seed-legend').replaceChildren(); $('#seed-structures').replaceChildren(); $('#seed-structure-count').textContent = '0';
    worker?.terminate(); clearTimeout(timer); const id = ++generation;
    catalog.render();
    timer = setTimeout(() => {
      worker = new Worker(new URL('./seed-worker.js', import.meta.url), { type: 'module' });
      const fail = message => { if (id !== generation) return; $('#seed-map-status').textContent = `No se pudo generar el mapa: ${message}`; $('#seed-progress').hidden = true; canvas.setAttribute('aria-busy', 'false'); worker?.terminate(); map = null; pendingEntry = null; preview = null; draw(); catalog.render(); };
      worker.onerror = () => fail('No se pudo iniciar el motor. Recarga la página e inténtalo de nuevo.');
      worker.onmessage = ({ data }) => {
        if (id !== generation) return;
        if (data.error) return fail(data.error);
        if (!data.done) { $('#seed-progress').value = data.progress; return; }
        map = data; map.image = document.createElement('canvas'); map.image.width = data.size; map.image.height = data.rows; map.image.getContext('2d').putImageData(new ImageData(data.pixels, data.size, data.rows), 0, 0);
        $('#seed-progress').hidden = true; canvas.setAttribute('aria-busy', 'false'); $('#seed-export').disabled = false; $('#seed-find-biome').disabled = false;
        $('#seed-map-status').textContent = `${data.catalog.length} biomas · ${data.points.length} estructuras previstas · 1 muestra cada ${data.step} bloques · Y ${current.y}`;
        for (const b of catalogEntries.filter(e => e.kind === 'biome' && e.dimension === current.dimension && versionSupports(current.version, e.minVersion)).sort((a, b) => a.name.localeCompare(b.name))) { const option = el('option', `${b.name}${data.catalog.some(p => p.id === b.id) ? ' · En el área' : ''}`); option.value = b.id; $('#seed-biome-search').append(option); }
        for (const b of data.catalog.sort((a, b) => biomeLabel(a).localeCompare(biomeLabel(b)))) { const label = el('span', biomeLabel(b)); const swatch = el('i', ''); swatch.style.backgroundColor = `#${b.color.toString(16).padStart(6, '0')}`; label.prepend(swatch); $('#seed-legend').append(label); }
        if ([...$('#seed-biome-search').options].some(o => o.value === selectedBiome)) $('#seed-biome-search').value = selectedBiome;
        showResults(); draw(); catalog.render(); worker.terminate(); worker = null;
        history.remember(data.view);
        if (pendingEntry) { const entry = pendingEntry; pendingEntry = null; selectEntry(entry); }
      };
      worker.postMessage(current);
    }, 160);
  }
  form.addEventListener('submit', e => { e.preventDefault(); try { sync(); } catch (err) { toast(err.message, true); } });
  function at(event) { const r = canvas.getBoundingClientRect(), v = preview || current; return { x: Math.floor((v.x + ((event.clientX - r.left) / r.width - .5) * v.range * 2 - map.view.x + map.view.range) / map.step), z: Math.floor((v.z + ((event.clientY - r.top - r.height / 2) / r.width) * v.range * 2 - map.view.z + map.view.range * map.rows / map.size) / map.step) }; }
  function samplePoint(x, z) { return { x: Math.floor(map.view.x - map.view.range + (x + .5) * map.step), z: Math.floor(map.view.z - map.view.range * map.rows / map.size + (z + .5) * map.step) }; }
  canvas.addEventListener('mousemove', event => { if (!map) return; const p = at(event); if (p.x < 0 || p.z < 0 || p.x >= map.size || p.z >= map.rows) { $('#seed-hover').textContent = 'Suelta para calcular esta zona.'; return; } const world = samplePoint(p.x, p.z), b = map.catalog.find(b => b.id === map.ids[p.z * map.size + p.x]); const near = visiblePoints().find(s => Math.abs(s.x - world.x) < map.step * 2 && Math.abs(s.z - world.z) < map.step * 2); $('#seed-hover').textContent = `${biomeLabel(b)} · X ${world.x} · Z ${world.z}${near ? ` · ${typeName(near.type)} (${near.x}, ${near.z})` : ''}`; });
  const navigation = attachNavigation(canvas, { getView: () => map && current, preview: v => { preview = v; draw(); }, commit: v => {
    const range = Math.round(v.range); let option = [...zoom.options].find(o => Number(o.value) === range); if (!option) { zoom.querySelector('[data-custom]')?.remove(); option = el('option', `±${range.toLocaleString('es')} bloques`); option.value = range; option.dataset.custom = 'true'; zoom.append(option); } zoom.value = range; go(Math.round(v.x), Math.round(v.z));
  }, inspect: event => {
    if (!map) return; const p = at(event); if (p.x < 0 || p.z < 0 || p.x >= map.size || p.z >= map.rows) return;
    const world = samplePoint(p.x, p.z), b = map.catalog.find(b => b.id === map.ids[p.z * map.size + p.x]); const near = visiblePoints().filter(s => Math.hypot(s.x - world.x, s.z - world.z) < current.range * 30 / canvas.clientWidth).sort((a,b) => Math.hypot(a.x-world.x,a.z-world.z)-Math.hypot(b.x-world.x,b.z-world.z))[0];
    const box = $('#seed-selection'); box.replaceChildren(); box.hidden = false; const img = el('img', ''); img.src = atlasImage(near ? 'structure' : 'biome', near ? near.type : b?.id); img.alt = ''; img.width = 60; img.height = 48;
    const point = near || world, copy = el('div', ''); copy.append(el('strong', near ? typeName(near.type) : biomeLabel(b)), el('small', `X ${point.x} · Z ${point.z}`)); const jump = el('button', 'Centrar aquí', 'secondary'); jump.type = 'button'; jump.onclick = () => go(point.x, point.z); box.append(img, copy, jump);
  } });
  $('#seed-zoom-in').onclick = () => navigation.zoom(.5); $('#seed-zoom-out').onclick = () => navigation.zoom(2); $('#seed-home').onclick = () => { if (current) go(0, 0); };
  page.querySelectorAll('[data-pan]').forEach(button => button.onclick = () => { try { const v = values(), d = button.dataset.pan; go(v.x + (d === 'east' ? v.range : d === 'west' ? -v.range : 0), v.z + (d === 'south' ? v.range : d === 'north' ? -v.range : 0)); } catch (e) { toast(e.message, true); } });
  zoom.onchange = () => { if (current) { try { sync(); } catch (e) { toast(e.message, true); } } }; new ResizeObserver(draw).observe(canvas);
  $('#seed-structures-toggle').onchange = draw; $('#seed-grid-toggle').onchange = draw; $('#seed-structure-filter').onchange = () => { if (map) showResults(); draw(); };
  function findBiome() {
    if (!map) return; const id = Number($('#seed-biome-search').value); let nearest = null, distance = Infinity;
    for (let z = 0; z < map.rows; z++) for (let x = 0; x < map.size; x++) if (map.ids[z * map.size + x] === id) { const d = (x - (map.size - 1) / 2) ** 2 + (z - (map.rows - 1) / 2) ** 2; if (d < distance) { distance = d; nearest = samplePoint(x, z); } }
    if (nearest) { $('#seed-search-feedback').textContent = `Muestra encontrada: X ${nearest.x} · Z ${nearest.z}.`; go(nearest.x, nearest.z); }
    else $('#seed-search-feedback').textContent = 'No aparece entre las muestras de esta área y altura. Aleja el mapa, muévelo o cambia Y para seguir buscando.';
  }
  $('#seed-find-biome').onclick = findBiome;
  fields.dimension.addEventListener('change', () => catalog.render()); fields.version.addEventListener('change', () => catalog.render());
  $('#seed-export').onclick = () => { if (!map) return; const image = document.createElement('canvas'); image.width = canvas.width; image.height = canvas.height + 60; const ctx = image.getContext('2d'); ctx.fillStyle = '#152619'; ctx.fillRect(0, 0, image.width, image.height); ctx.drawImage(canvas, 0, 0); ctx.fillStyle = '#fff'; ctx.font = '14px monospace'; ctx.fillText(`Bedrock ${current.version} | ${current.seed} | ${current.dimension}`, 12, canvas.height + 23); ctx.fillText(`X ${current.x} Y ${current.y} Z ${current.z} | alcance +/-${current.range}`, 12, canvas.height + 46); const a = document.createElement('a'); a.download = `bedrock-${current.seed}-${current.dimension}.png`; a.href = image.toDataURL('image/png'); a.click(); };
  $('#seed-random').onclick = () => { const data = crypto.getRandomValues(new Uint32Array(2)); fields.seed.value = BigInt.asIntN(64, (BigInt(data[0]) << 32n) | BigInt(data[1])).toString(); try { sync(); } catch (e) { toast(e.message, true); } };
  $('#seed-copy').onclick = async () => { try { await navigator.clipboard.writeText(seedValue(fields.seed.value)); toast('Semilla copiada.'); } catch { fields.seed.focus(); fields.seed.select(); toast('Copia la semilla seleccionada con Ctrl+C o el menú del dispositivo.'); } };
  $('#seed-from-world').onclick = async event => {
    const button = event.currentTarget; button.disabled = true;
    try { const data = await api('/worlds/seed'); $('#seed-world-status').textContent = data.message || `Mundo: ${data.world}. Última versión registrada: ${data.version || 'desconocida'}.`;
      if (data.seed != null) { fields.seed.value = data.seed; fields.dimension.value = 'overworld'; fields.x.value = data.spawn?.x ?? 0; fields.z.value = data.spawn?.z ?? 0;
        const version = engineVersions.find(v => v === data.version || `${v}.0` === data.version);
        if (!version) { $('#seed-world-status').textContent += ' El motor no tiene un perfil exacto para esta versión. Elige conscientemente un perfil disponible y pulsa Generar mapa; el resultado puede diferir.'; worker?.terminate(); clearTimeout(timer); generation++; map = null; current = null; draw(); $('#seed-export').disabled = true; $('#seed-find-biome').disabled = true; $('#seed-progress').hidden = true; canvas.setAttribute('aria-busy', 'false'); $('#seed-map-status').textContent = 'Selecciona un perfil de generación para continuar.'; return; }
        fields.version.value = version; sync();
      }
    } catch (e) { toast(e.message, true); } finally { button.disabled = false; }
  };
  $('#seed-marker-form').onsubmit = event => { event.preventDefault(); try {
    if (!current) throw new Error('Genera un mapa primero.'); if (markers.length >= 100) throw new Error('Máximo 100 lugares por semilla y dimensión.');
    const name = event.currentTarget.elements.name.value.trim(); if (!name) throw new Error('Escribe un nombre.'); const next = [...markers, { name, x: current.x, z: current.z }]; localStorage.setItem(storageKey(), JSON.stringify(next)); markers = next; event.currentTarget.reset(); renderMarkers(); draw(); toast('Lugar guardado.');
  } catch (e) { toast(e.message, true); } };
  // Keep the current map in memory on panel navigation. Restore the latest
  // successful view only on the first visible visit after a page load.
  let restored = false;
  const resume = () => {
    if (page.hidden || document.querySelector('#app').hidden) return;
    if (!restored) {
      restored = true;
      if (!current) { try { const last = readHistory(localStorage.getItem(HISTORY_KEY))[0]; if (last) restoreView(last, false); } catch { /* Storage may be unavailable. */ } }
    }
    requestAnimationFrame(draw);
  };
  new MutationObserver(resume).observe(page, { attributes: true, attributeFilter: ['hidden'] });
  new MutationObserver(resume).observe(document.querySelector('#app'), { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resume(); });
}
