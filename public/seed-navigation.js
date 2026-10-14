const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export function panView(view, dx, dy, width) {
  return { ...view, x: clamp(view.x - dx * 2 * view.range / width, -30000000, 30000000), z: clamp(view.z - dy * 2 * view.range / width, -30000000, 30000000) };
}
export function zoomView(view, range, u = .5, v = .5, aspect = 1) {
  range = clamp(range, 128, 4096);
  return { ...view, range, x: clamp(view.x + (u - .5) * 2 * (view.range - range), -30000000, 30000000), z: clamp(view.z + (v - .5) * 2 * (view.range - range) * aspect, -30000000, 30000000) };
}
export function attachNavigation(canvas, { getView, preview, commit, inspect }) {
  const pointers = new Map(); let base = null, start = null, draft = null, moved = false, timer;
  const geometry = () => { const p = [...pointers.values()]; return { x: p.reduce((n, p) => n + p.x, 0) / p.length, y: p.reduce((n, p) => n + p.y, 0) / p.length, distance: p.length > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 }; };
  function finish() { clearTimeout(timer); if (!draft) return; const v = { ...draft, x: Math.round(draft.x), z: Math.round(draft.z) }; draft = null; commit(v); }
  function changeZoom(range, u = .5, v = .5) { const view = draft || getView(); if (!view) return; const rect = canvas.getBoundingClientRect(); draft = zoomView(view, range, u, v, rect.height / rect.width); preview(draft); clearTimeout(timer); timer = setTimeout(finish, 180); }
  canvas.addEventListener('pointerdown', event => {
    if (!getView() || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); clearTimeout(timer); canvas.focus({ preventScroll: true }); canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); base = { ...(draft || getView()) }; start = geometry();
    if (pointers.size === 1) moved = false; else moved = true;
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY }); const g = geometry(), rect = canvas.getBoundingClientRect();
    if (Math.hypot(g.x - start.x, g.y - start.y) > 3 || pointers.size > 1) moved = true;
    if (!moved) return;
    draft = panView(base, g.x - start.x, g.y - start.y, rect.width);
    if (g.distance && start.distance) draft = zoomView(draft, base.range * start.distance / g.distance, (g.x - rect.left) / rect.width, (g.y - rect.top) / rect.height, rect.height / rect.width);
    preview(draft);
  });
  function release(event) {
    if (!pointers.has(event.pointerId)) return; pointers.delete(event.pointerId);
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (pointers.size) { base = { ...(draft || getView()) }; start = geometry(); return; }
    canvas.classList.remove('is-dragging');
    if (draft) finish(); else if (!moved && event.type === 'pointerup') inspect(event);
  }
  canvas.addEventListener('pointerup', release); canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('wheel', event => {
    if (!getView()) return; event.preventDefault(); const rect = canvas.getBoundingClientRect(), view = draft || getView();
    changeZoom(view.range * (event.deltaY > 0 ? 2 : .5), (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
  }, { passive: false });
  canvas.addEventListener('keydown', event => {
    const view = getView(); if (!view) return;
    const directions = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (directions[event.key]) { event.preventDefault(); const [x, z] = directions[event.key]; draft = panView(view, x, z, 4); finish(); }
    else if (['+', '=', '-'].includes(event.key)) { event.preventDefault(); changeZoom(view.range * (event.key === '-' ? 2 : .5)); }
  });
  return { zoom: factor => { const v = draft || getView(); if (v) changeZoom(v.range * factor); }, reset: () => { clearTimeout(timer); pointers.clear(); base = start = draft = null; canvas.classList.remove('is-dragging'); } };
}
