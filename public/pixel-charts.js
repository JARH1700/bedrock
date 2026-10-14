// Native canvas rendering: square cells and step lines, without smoothing data.
export function drawPixelChart(canvas, samples, keys, scale = 1, unit = '') {
  const width = Math.max(1, canvas.getBoundingClientRect().width), height = 180, dpr = devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr); canvas.height = height * dpr;
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.imageSmoothingEnabled = false;
  const left = 57, right = width - 18, top = 18, bottom = 142;
  ctx.fillStyle = '#14251e'; ctx.fillRect(0, 0, width, height);
  for (let x = left; x < right; x += 12) for (let y = top; y < bottom; y += 12) {
    ctx.fillStyle = ((x - left) / 12 + (y - top) / 12) % 2 ? '#1c3026' : '#1a2b23';
    ctx.fillRect(x, y, Math.min(10, right - x), Math.min(10, bottom - y));
  }
  ctx.font = '10px monospace'; ctx.fillStyle = '#b9cbb4';
  if (samples.length < 2 || !samples.some(s => keys.some(k => Number.isFinite(s[k])))) {
    ctx.textAlign = 'center'; ctx.fillText('Esperando datos reales…', width / 2, 88);
    canvas.setAttribute('aria-label', 'Gráfica de bloques: esperando datos reales del servidor'); return;
  }
  const max = Math.max(1, ...samples.flatMap(s => keys.map(k => Number.isFinite(s[k]) ? s[k] / scale : 0))) * 1.15;
  for (let row = 0; row < 4; row++) {
    const y = Math.round(top + (bottom - top) * row / 3);
    ctx.fillStyle = '#33493a'; ctx.fillRect(left, y, right - left, 1);
    ctx.fillStyle = '#b9cbb4'; ctx.textAlign = 'right'; ctx.fillText((max * (1 - row / 3)).toFixed(1), left - 7, y + 3);
  }
  keys.forEach((key, series) => {
    const color = series ? '#72d5ee' : '#a8d46b';
    let previous = null;
    samples.forEach((sample, i) => {
      if (!Number.isFinite(sample[key])) { previous = null; return; }
      const x = Math.round(left + i / (samples.length - 1) * (right - left));
      const y = Math.round(bottom - sample[key] / scale / max * (bottom - top));
      if (previous) {
        ctx.fillStyle = series ? '#72d5ee13' : '#a8d46b18';
        ctx.fillRect(previous.x, previous.y, x - previous.x, bottom - previous.y);
        ctx.fillStyle = color;
        ctx.fillRect(previous.x, previous.y - 1, x - previous.x + 1, 2);
        ctx.fillRect(x - 1, Math.min(y, previous.y), 2, Math.max(2, Math.abs(y - previous.y)));
      }
      ctx.fillStyle = color; ctx.fillRect(x - 2, y - 2, 4, 4);
      previous = { x, y };
    });
  });
  ctx.fillStyle = '#b9cbb4'; ctx.textAlign = 'left'; ctx.fillText(unit, 7, 166);
  ctx.fillText(new Date(samples[0].at).toLocaleTimeString('es'), left, 166);
  ctx.textAlign = 'right'; ctx.fillText(new Date(samples.at(-1).at).toLocaleTimeString('es'), right, 166);
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Historial en bloques. Última lectura: ${keys.map(k => `${k}: ${Number.isFinite(samples.at(-1)[k]) ? (samples.at(-1)[k] / scale).toFixed(2) + ' ' + unit : 'no disponible'}`).join(', ')}`);
}
