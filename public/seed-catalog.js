import { biomeLabels } from './seed-biomes.js';
import { structures } from './seed-engine.js';
const nether = new Set([8, 170, 171, 172, 173]), end = new Set([9, 40, 41, 42, 43]);
export const biomeDimension = id => nether.has(id) ? 'nether' : end.has(id) ? 'end' : 'overworld';
export const structureDimension = id => [12, 22, 23].includes(id) ? 'nether' : id === 24 ? 'end' : 'overworld';
export const catalogEntries = [
  ...structures.map(([id, name]) => ({ id, name, kind: 'structure', dimension: structureDimension(id), minVersion: id === 13 ? '1.19' : id === 27 ? '1.20' : id === 28 ? '1.21' : '1.18' })),
  ...Object.entries(biomeLabels).filter(([id]) => Number(id) !== 47).map(([id, name]) => ({ id: Number(id), name, kind: 'biome', dimension: biomeDimension(Number(id)), minVersion: Number(id) === 186 ? '1.21.50' : Number(id) === 185 ? '1.20' : [183, 184].includes(Number(id)) ? '1.19' : '1.18' })),
];
export const atlasImage = (kind, id) => `/atlas/${kind}-${id}.svg`;
export function versionSupports(version, minVersion) {
  const a = version.split('.').map(Number), b = minVersion.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return true;
}
export function initCatalog({ host, el, getState, choose }) {
  host.innerHTML = `<div class="card-heading"><div><p class="eyebrow">GUÍA DE EXPLORACIÓN</p><h3>¿Qué quieres encontrar?</h3></div><span id="atlas-count" class="badge"></span></div><div class="atlas-controls"><label>Buscar por nombre<input id="atlas-query" type="search" placeholder="Aldea, cerezal, tesoro…"></label><label>Categoría<select id="atlas-kind"><option value="all">Todo</option><option value="structure">Estructuras</option><option value="biome">Biomas</option></select></label><label>Dimensión<select id="atlas-dimension"><option value="all">Todas</option><option value="overworld">Overworld</option><option value="nether">Nether</option><option value="end">The End</option></select></label></div><p class="seed-note">Selecciona una imagen para buscar en el área del mapa. Los elementos de otra dimensión te permiten cambiar a ella. Las ilustraciones son orientativas.</p><div id="atlas-gallery" class="atlas-gallery"></div><p id="atlas-status" class="seed-note" role="status"></p>`;
  const $ = s => host.querySelector(s); let selected = '';
  const disclosure = el('details', '', 'atlas-disclosure'); disclosure.id = 'atlas-disclosure';
  disclosure.open = true;
  try { disclosure.open = localStorage.getItem('bedrock-atlas-open') !== 'false'; } catch {}
  const heading = $('.card-heading'), summary = el('summary', '', 'card-heading');
  summary.append(...heading.childNodes); heading.remove();
  const arrow = el('span', '', 'atlas-chevron'); arrow.setAttribute('aria-hidden', 'true'); summary.append(arrow);
  const body = el('div', '', 'atlas-body'); body.append(...host.childNodes);
  disclosure.append(summary, body); host.append(disclosure);
  disclosure.addEventListener('toggle', () => { try { localStorage.setItem('bedrock-atlas-open', String(disclosure.open)); } catch {} });
  const dimensions = el('div', '', 'atlas-dimension-tabs'); dimensions.setAttribute('role', 'group'); dimensions.setAttribute('aria-label', 'Filtrar por dimensión');
  for (const [id, name] of [['all', 'Todas'], ['overworld', 'Overworld'], ['nether', 'Nether'], ['end', 'The End']]) {
    const button = el('button', name); button.type = 'button'; button.dataset.dimension = id;
    button.onclick = () => { $('#atlas-dimension').value = id; render(); $('#atlas-gallery').scrollTop = 0; };
    dimensions.append(button);
  }
  $('#atlas-gallery').before(dimensions);
  const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function render() {
    const state = getState(), query = norm($('#atlas-query').value.trim()), kind = $('#atlas-kind').value, dimension = $('#atlas-dimension').value;
    dimensions.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dimension === dimension)));
    const entries = catalogEntries.filter(e => (kind === 'all' || kind === e.kind) && (dimension === 'all' || dimension === e.dimension) && norm(e.name).includes(query));
    $('#atlas-count').textContent = `${entries.length} / ${catalogEntries.length}`;
    const gallery = $('#atlas-gallery'); gallery.replaceChildren();
    if (!entries.length) gallery.append(el('p', 'No hay coincidencias. Prueba otro nombre o filtro.', 'seed-note'));
    for (const [dimensionId, title] of [['overworld', 'Overworld'], ['nether', 'Nether'], ['end', 'The End']]) {
      const groupEntries = entries.filter(e => e.dimension === dimensionId); if (!groupEntries.length) continue;
      const section = el('section', '', 'atlas-dimension-group'); section.dataset.dimension = dimensionId;
      const heading = el('h4', '', 'atlas-dimension-heading'); heading.append(el('span', title), el('small', `${groupEntries.length} elementos`));
      const grid = el('div', '', 'atlas-dimension-grid'); section.append(heading, grid); gallery.append(section);
    for (const entry of groupEntries) {
      const b = el('button', '', 'atlas-item'); b.type = 'button'; b.dataset.kind = entry.kind; b.dataset.id = entry.id;
      const key = `${entry.kind}-${entry.id}`; b.setAttribute('aria-pressed', String(selected === key));
      const image = el('img', ''); image.src = `${atlasImage(entry.kind, entry.id)}?v=2`; image.alt = ''; image.width = 50; image.height = 40; image.loading = 'lazy';
      const compatible = versionSupports(state.version, entry.minVersion), same = state.dimension === entry.dimension;
      const count = entry.kind === 'structure' ? state.map?.points.filter(p => p.type === entry.id).length : state.map?.catalog.some(p => p.id === entry.id) ? 1 : 0;
      const status = !compatible ? `Desde ${entry.minVersion}` : !same ? `Cambiar a ${entry.dimension === 'end' ? 'The End' : entry.dimension}` : !state.map ? 'Genera un mapa' : count ? entry.kind === 'structure' ? `${count} en el área` : 'En el área' : 'Fuera del área';
      b.disabled = !compatible; b.dataset.found = String(Boolean(same && count)); b.append(image, el('strong', entry.name), el('small', status));
      b.onclick = () => { selected = key; choose(entry); render(); $('#atlas-status').textContent = `Seleccionado: ${entry.name}. Consulta el mapa y sus resultados.`; };
      grid.append(b);
    }
    }
  }
  $('#atlas-query').oninput = render; $('#atlas-kind').onchange = render; $('#atlas-dimension').onchange = render;
  render(); return { render };
}
