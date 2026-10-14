export function initPlayers({ api, textElement, icon }) {
  const page = document.querySelector('#page-players');
  const section = document.createElement('div');
  section.className = 'player-discovery';
  section.innerHTML = `<article class="card player-search"><div class="card-heading"><div><p class="eyebrow">IDENTIDAD BEDROCK</p><h3>Una cara para cada aventura.</h3></div></div><form id="profile-form" class="inline-form"><label>Buscar jugador<input name="query" placeholder="Gamertag, XUID o UUID de Floodgate" maxlength="36" required></label><button class="primary" type="submit">Buscar perfil</button></form><p class="muted profile-note">Skins públicas almacenadas por Geyser. Pueden diferir de la skin actual; los personajes del Marketplace pueden no ser compatibles.</p><div id="profile-result" aria-live="polite"></div></article><article class="card"><div class="card-heading"><div><p class="eyebrow">TU COMUNIDAD</p><h3>Jugadores detectados</h3></div><span id="roster-count" class="badge">0</span></div><p id="roster-state" class="muted profile-note" role="status"></p><div id="roster-list" class="roster-grid"></div></article>`;
  page.querySelector('.community-banner').after(section);
  section.querySelector('.profile-note').textContent = 'Busca primero en Bedrock, después en Java con el mismo nombre y, si no hay skin, muestra Steve o Alex. La fuente se indica debajo del avatar.';
  section.querySelector('#profile-form input').placeholder = 'Nombre, gamertag, XUID o UUID';
  const profiles = new Map(), jobs = []; let active = 0, loading = false;
  function enqueue(work) { return new Promise((resolve, reject) => { jobs.push({ work, resolve, reject }); pump(); }); }
  function pump() { while (active < 3 && jobs.length) { const job = jobs.shift(); active++; Promise.resolve().then(job.work).then(job.resolve, job.reject).finally(() => { active--; pump(); }); } }
  function lookup(query, refresh = false) {
    const key = query.toLowerCase();
    if (!refresh && profiles.get(key)?.until > Date.now()) return profiles.get(key).promise;
    const promise = enqueue(() => api(`/players/lookup?q=${encodeURIComponent(query)}${refresh ? '&refresh=1' : ''}`));
    profiles.set(key, { promise, until: Date.now() + 120000 });
    promise.catch(() => profiles.delete(key)); return promise;
  }
  function avatar(query, label = query, resolved = null) {
    const picture = textElement('span', '', 'player-picture'), state = textElement('small', 'Cargando…', 'picture-status');
    const box = textElement('span', '', 'skin-avatar'); box.append(icon('users')); box.title = 'Buscando skin…';
    picture.append(box, state);
    function showDefault(url = '/avatars/steve.svg') {
      const fallback = new Image(); fallback.src = url; fallback.alt = 'Avatar predeterminado, no es la skin del jugador';
      box.replaceChildren(fallback); box.classList.add('has-skin'); state.hidden = false; state.textContent = 'Predeterminada';
    }
    Promise.resolve(resolved || lookup(query)).then(profile => {
      box.title = profile.message || `Skin pública de ${label}`;
      if (!profile.skin) { showDefault(profile.avatar || profile.fallbackAvatar); picture.title = profile.message; return; }
      const image = new Image();
      image.onload = () => {
        if (image.width !== image.height && image.width !== image.height * 2) { box.title = 'Formato de skin no compatible. Se muestra un avatar predeterminado.'; showDefault(profile.fallbackAvatar); return; }
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
        canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `Skin de ${label}`);
        const ctx = canvas.getContext('2d'), scale = image.width / 64; ctx.imageSmoothingEnabled = false;
        ctx.drawImage(image, 8 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 64, 64);
        ctx.drawImage(image, 40 * scale, 8 * scale, 8 * scale, 8 * scale, 0, 0, 64, 64);
        box.replaceChildren(canvas); box.classList.add('has-skin');
        state.textContent = profile.source === 'local' ? 'PNG asignado' : profile.source === 'java-fallback' || profile.edition === 'java' ? 'Java' : 'Bedrock'; state.hidden = false;
      };
      image.onerror = () => { box.title = 'No se pudo cargar la skin. Se muestra un avatar predeterminado.'; showDefault(profile.fallbackAvatar); };
      image.src = profile.skin;
    }).catch(() => { box.title = 'Sin conexión: avatar predeterminado.'; showDefault(); });
    return picture;
  }
  async function load() {
    if (loading) return; loading = true;
    try {
      const data = await api('/players'), list = section.querySelector('#roster-list');
      section.querySelector('#roster-count').textContent = data.players.length;
      section.querySelector('#roster-state').textContent = data.error || 'Conexiones detectadas en los registros de Bedrock. Actualización automática; el estado puede ser desconocido si los registros se han rotado.';
      const signature = JSON.stringify(data.players) + Math.floor(Date.now() / 120000);
      if (list.dataset.signature === signature) return;
      list.dataset.signature = signature; list.replaceChildren();
      if (!data.players.length) list.append(textElement('p', 'Cuando alguien entre al servidor, su perfil aparecerá aquí.', 'empty'));
      for (const player of data.players.toSorted((a, b) => Number(b.online) - Number(a.online))) {
        const card = textElement('div', '', 'detected-player'), details = textElement('div', '', 'player-details');
        details.append(textElement('strong', player.name), textElement('small', player.online === true ? 'Conectado' : player.online === false ? 'Desconectado' : 'Estado desconocido', player.online ? 'player-online' : 'muted'), textElement('small', `XUID ${player.xuid}`, 'mono'));
        const button = textElement('button', 'Ver perfil', 'secondary'); button.type = 'button'; button.addEventListener('click', () => { form.elements.query.value = player.xuid; form.requestSubmit(); });
        card.append(avatar(player.xuid, player.name), details, button); list.append(card);
      }
    } finally { loading = false; }
  }
  const form = section.querySelector('#profile-form');
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = form.querySelector('button'), result = section.querySelector('#profile-result');
    button.disabled = true; button.classList.add('is-loading'); result.replaceChildren(textElement('p', 'Buscando perfil…', 'muted'));
    try {
      const profile = await lookup(form.elements.query.value.trim(), true);
      const card = textElement('div', '', 'profile-card'), details = textElement('div', '', 'player-details');
      details.append(textElement('strong', profile.name));
      details.append(textElement('span', profile.source === 'default' ? 'AVATAR PREDETERMINADO' : profile.source === 'java-fallback' ? 'JAVA · BÚSQUEDA AUTOMÁTICA' : profile.edition === 'java' ? 'JAVA EDITION · MOJANG' : 'BEDROCK EDITION', 'badge'));
      if (profile.javaUuid) details.append(textElement('small', `UUID del perfil Java · ${profile.javaUuid}`, 'mono'));
      if (profile.edition === 'java' && profile.uuid) details.append(textElement('small', `UUID Java · ${profile.uuid}`, 'mono'));
      if (profile.xuid) details.append(textElement('small', `XUID · ${profile.xuid}`, 'mono'), textElement('small', `UUID de Floodgate · ${profile.uuid}`, 'mono'));
      details.append(textElement('p', profile.message || 'Skin disponible · Caché pública de Geyser', 'muted'));
      const actions = textElement('div', '', 'profile-skin-actions');
      const retry = textElement('button', 'Volver a consultar', 'secondary'); retry.type = 'button'; retry.addEventListener('click', () => form.requestSubmit());
      const upload = textElement('label', 'Asignar skin PNG', 'secondary file-label');
      const file = document.createElement('input'); file.type = 'file'; file.accept = '.png,image/png'; file.setAttribute('aria-label', 'Asignar skin PNG a este perfil del panel'); upload.append(file);
      const feedback = textElement('p', 'El PNG solo se muestra en el panel; no cambia la skin dentro de Minecraft.', 'muted'); feedback.setAttribute('role', 'status');
      file.addEventListener('change', async () => {
        const selected = file.files[0]; if (!selected) return;
        file.disabled = true;
        try {
          if (selected.size > 1024 * 1024) throw new Error('El PNG debe pesar como máximo 1 MB.');
          const bitmap = await createImageBitmap(selected); bitmap.close();
          const body = new FormData(); body.append('file', selected);
          await api(`/players/skin?q=${encodeURIComponent(profile.xuid || profile.gamertag)}`, { method: 'POST', body });
          profiles.clear(); section.querySelector('#roster-list').dataset.signature = ''; await load();
          window.dispatchEvent(new Event('player-skin-updated')); form.requestSubmit();
        } catch (e) { feedback.textContent = e.message; }
        finally { file.disabled = false; file.value = ''; }
      });
      actions.append(retry);
      if (profile.edition !== 'java') actions.append(upload);
      details.append(actions);
      if (profile.edition !== 'java') details.append(feedback);
      if (profile.source === 'local') {
        const automatic = textElement('button', 'Usar skin automática', 'secondary'); automatic.type = 'button'; actions.append(automatic);
        automatic.addEventListener('click', async () => {
          automatic.disabled = true;
          try {
            await api(`/players/skin?q=${encodeURIComponent(profile.xuid || profile.gamertag)}`, { method: 'DELETE' });
            profiles.clear(); section.querySelector('#roster-list').dataset.signature = ''; await load();
            window.dispatchEvent(new Event('player-skin-updated')); form.requestSubmit();
          } catch (e) { feedback.textContent = e.message; } finally { automatic.disabled = false; }
        });
      }
      card.append(avatar(profile.xuid || profile.name, profile.name, profile), details); result.replaceChildren(card);
    } catch (e) { result.replaceChildren(textElement('p', e.message, 'notice')); }
    finally { button.disabled = false; button.classList.remove('is-loading'); }
  });
  return { avatar, load };
}
