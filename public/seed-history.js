import { seedValue, coordinate } from './seed-utils.js';
import { engineVersions } from './seed-engine.js';
export const HISTORY_KEY = 'bedrock-seed-history-v1';
export function validHistoryEntry(value) {
  try {
    if (!value || !engineVersions.includes(value.version) || !['overworld', 'nether', 'end'].includes(value.dimension)) return null;
    const y = coordinate(value.y), range = Number(value.range), visited = Number(value.visited);
    if (y < -64 || y > 320 || !Number.isInteger(range) || range < 128 || range > 4096 || !Number.isFinite(visited) || visited < 0) return null;
    return { seed: seedValue(value.seed), version: value.version, dimension: value.dimension, x: coordinate(value.x), z: coordinate(value.z), y, range, visited };
  } catch { return null; }
}
export function readHistory(raw) {
  try {
    const rows = JSON.parse(raw || '[]'); if (!Array.isArray(rows)) return [];
    const seen = new Set();
    return rows.map(validHistoryEntry).filter(Boolean).sort((a,b) => b.visited - a.visited).filter(row => { if (seen.has(row.seed)) return false; seen.add(row.seed); return true; }).slice(0, 100);
  } catch { return []; }
}
export function rememberSeed(rows, view, visited = Date.now()) {
  const entry = validHistoryEntry({ ...view, visited }); if (!entry) throw new Error('No se puede guardar esta semilla.');
  return [entry, ...rows.filter(row => row.seed !== entry.seed)].slice(0, 100);
}
export function initSeedHistory({ host, el, open }) {
  host.innerHTML = `<details open><summary>Semillas buscadas <span id="seed-history-count" class="badge">0</span></summary><p id="seed-history-status" class="seed-note" role="status">Se guardan automáticamente las últimas 100 semillas en este navegador, con la última vista de cada una.</p><div id="seed-history-list"></div></details>`;
  const list = host.querySelector('#seed-history-list'), status = host.querySelector('#seed-history-status');
  let rows = [];
  function load() { try { rows = readHistory(localStorage.getItem(HISTORY_KEY)); } catch { status.textContent = 'El navegador no permite acceder al historial.'; } }
  function persist(next) { try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); rows = next; status.textContent = 'Guardado en este navegador. Cada semilla conserva su última versión, dimensión y coordenadas consultadas.'; render(); } catch { status.textContent = 'No se pudo guardar el historial. Revisa el espacio o los permisos de almacenamiento del navegador.'; } }
  function render() {
    host.querySelector('#seed-history-count').textContent = rows.length; list.replaceChildren();
    if (!rows.length) list.append(el('p', 'Las semillas aparecerán aquí cuando generes un mapa.', 'seed-note'));
    for (const row of rows) {
      const item = el('div', '', 'seed-history-row'), restore = el('button', '', 'seed-history-open'); restore.type = 'button';
      restore.append(el('strong', row.seed), el('small', `Bedrock ${row.version} · ${row.dimension === 'end' ? 'The End' : row.dimension} · X ${row.x} · Y ${row.y} · Z ${row.z}`));
      restore.setAttribute('aria-label', `Abrir semilla ${row.seed}`); restore.onclick = () => open(row);
      const date = el('time', new Date(row.visited).toLocaleDateString('es-MX')); const remove = el('button', 'Eliminar', 'secondary'); remove.type = 'button'; remove.setAttribute('aria-label', `Eliminar semilla ${row.seed} del historial`);
      remove.onclick = () => { load(); persist(rows.filter(r => r.seed !== row.seed)); };
      item.append(restore, date, remove); list.append(item);
    }
  }
  load(); render();
  window.addEventListener('storage', event => { if (event.key === HISTORY_KEY || event.key === null) { load(); render(); } });
  return { remember(view) { load(); persist(rememberSeed(rows, view)); } };
}
