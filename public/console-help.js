const commands = [
  ['Consulta', 'Jugadores conectados', 'list', 'Muestra quién está conectado.'],
  ['Consulta', 'Ayuda disponible', 'help', 'Lista los comandos admitidos por tu servidor.'],
  ['Consulta', 'Ayuda de un comando', 'help gamemode', 'Explica la sintaxis. Sustituye gamemode por otro comando.'],
  ['Mensajes', 'Anuncio para todos', 'say Bienvenidos al servidor', 'Edita el mensaje antes de enviarlo. Lo verán todos los jugadores.'],
  ['Mensajes', 'Mensaje privado', 'tell {player} Hola, bienvenido', 'Envía un mensaje al gamertag indicado. Puedes editar el texto.'],
  ['Jugadores', 'Modo supervivencia', 'gamemode survival {player}', 'Cambia el modo de juego de este jugador.', true],
  ['Jugadores', 'Modo creativo', 'gamemode creative {player}', 'Permite a este jugador construir en modo creativo.', true],
  ['Jugadores', 'Modo aventura', 'gamemode adventure {player}', 'Activa las restricciones del modo aventura para este jugador.', true],
  ['Jugadores', 'Dar antorchas', 'give {player} minecraft:torch 16', 'Entrega 16 antorchas. Puedes editar el objeto y la cantidad.', true],
  ['Moderación', 'Expulsar jugador', 'kick {player} Contacta con el administrador', 'Desconecta al jugador; puede volver a entrar. Edita el motivo.'],
  ['Moderación', 'Dar permisos de operador', 'op {player}', 'Otorga permisos administrativos al jugador.'],
  ['Moderación', 'Quitar permisos de operador', 'deop {player}', 'Retira sus permisos de operador.'],
  ['Mundo', 'Hacer de día', 'time set day', 'Cambia la hora del mundo a día.', true],
  ['Mundo', 'Hacer de noche', 'time set night', 'Cambia la hora del mundo a noche.', true],
  ['Mundo', 'Despejar el cielo', 'weather clear', 'Cambia el clima a despejado.', true],
  ['Mundo', 'Activar lluvia', 'weather rain', 'Cambia el clima a lluvia.', true],
  ['Mundo', 'Dificultad normal', 'difficulty normal', 'Establece la dificultad normal para el mundo.', true],
  ['Reglas', 'Conservar inventario', 'gamerule keepinventory true', 'Los jugadores conservan el inventario al morir.'],
  ['Reglas', 'Soltar inventario al morir', 'gamerule keepinventory false', 'Restaura la pérdida de inventario al morir.'],
  ['Reglas', 'Pausar ciclo de día y noche', 'gamerule dodaylightcycle false', 'Mantiene fija la hora del mundo.'],
  ['Reglas', 'Reanudar ciclo de día y noche', 'gamerule dodaylightcycle true', 'Permite que vuelva a avanzar la hora del mundo.']
];

export function initConsoleHelp({ textElement: el, toast }) {
  const section = el('section', '', 'card console-help'); section.setAttribute('aria-labelledby', 'console-help-title');
  section.innerHTML = `<div class="card-heading"><div><span class="card-overline">COMANDOS A MANO</span><h3 id="console-help-title">¿Qué quieres hacer?</h3></div><span id="command-help-count" class="badge"></span></div><div class="command-help-intro"><p>Elige un comando, revísalo en la barra de la consola y pulsa <strong>Enviar</strong>. Prepararlo no lo ejecuta.</p><p>El servidor debe estar encendido para enviar comandos. Algunos necesitan trucos habilitados y los permisos que exige Bedrock.</p></div><div class="command-help-filters"><label>Buscar comando<input id="command-help-search" type="search" placeholder="Lluvia, inventario, jugadores…"></label><label>Categoría<select id="command-help-category"><option value="">Todas las categorías</option></select></label><label>Gamertag del jugador<input id="command-help-player" maxlength="32" placeholder="Solo para comandos de jugadores" autocomplete="off"><small>Escribe el nombre exacto; se admiten espacios.</small></label></div><div id="command-help-list" class="command-help-list"></div><div class="command-help-footer"><span>Desde la consola, indica siempre a qué jugador se aplica el comando. No hace falta escribir / al inicio.</span><a href="https://learn.microsoft.com/en-us/minecraft/creator/commands/commands?view=minecraft-bedrock-stable" target="_blank" rel="noreferrer">Referencia oficial de Bedrock ↗</a></div>`;
  document.querySelector('#page-console').append(section);
  const search = section.querySelector('#command-help-search'), category = section.querySelector('#command-help-category'), player = section.querySelector('#command-help-player'), list = section.querySelector('#command-help-list');
  for (const group of new Set(commands.map(c => c[0]))) { const option = el('option', group); option.value = group; category.append(option); }
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function render() {
    const filtered = commands.filter(c => (!category.value || c[0] === category.value) && normalize(c.join(' ')).includes(normalize(search.value.trim())));
    section.querySelector('#command-help-count').textContent = `${filtered.length} comandos`;
    list.replaceChildren();
    for (const [group, title, command, description, cheats] of filtered) {
      const card = el('article', '', 'command-help-item'), heading = el('div', '', 'command-help-heading');
      heading.append(el('span', group, 'card-overline'));
      if (cheats) heading.append(el('span', 'Requiere trucos', 'command-cheats'));
      const button = el('button', 'Preparar comando', 'secondary'); button.type = 'button'; button.setAttribute('aria-label', `Preparar: ${title}`);
      button.addEventListener('click', () => {
        const name = player.value.trim();
        if (command.includes('{player}') && !/^[A-Za-z0-9 _-]{1,32}$/.test(name)) {
          player.setCustomValidity('Escribe un gamertag válido: letras, números, espacios, guiones o guion bajo.'); player.reportValidity(); player.focus(); return;
        }
        const input = document.querySelector('#command-form').elements.command;
        input.value = command.replace('{player}', `"${name}"`); input.dispatchEvent(new Event('input', { bubbles: true }));
        input.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        if (!input.disabled) { input.focus({ preventScroll: true }); input.select(); }
        toast(input.disabled ? 'Comando preparado. Inicia el servidor para poder enviarlo.' : 'Comando preparado. Revisa los datos y pulsa Enviar.');
      });
      card.append(heading, el('h4', title), el('code', command.replace('{player}', '"Gamertag"')), el('p', description), button); list.append(card);
    }
    if (!filtered.length) list.append(el('p', 'No hay coincidencias. Prueba otro término o categoría.', 'empty'));
  }
  player.addEventListener('input', () => player.setCustomValidity(''));
  search.addEventListener('input', render); category.addEventListener('change', render); render();
}
