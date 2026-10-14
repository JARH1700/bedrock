// Runs before styles load to avoid flashing the wrong theme on navigation.
(() => {
  let dark = true;
  try { dark = localStorage.getItem('bedrock-theme') !== 'light'; } catch {}
  const root = document.documentElement;
  let toggle;
  function apply() {
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c1311' : '#f5f6f8');
    toggle?.setAttribute('aria-checked', String(dark));
    window.dispatchEvent(new Event('bedrock-theme-change'));
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    toggle = document.createElement('button'); toggle.type = 'button'; toggle.id = 'theme-toggle'; toggle.className = 'theme-toggle';
    toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', 'Modo oscuro');
    const label = document.createElement('span'); label.textContent = 'Modo oscuro';
    const track = document.createElement('span'); track.className = 'theme-toggle-track'; track.setAttribute('aria-hidden', 'true');
    toggle.append(label, track); document.querySelector('.topbar-right').prepend(toggle);
    toggle.addEventListener('click', () => {
      dark = !dark;
      try { localStorage.setItem('bedrock-theme', dark ? 'dark' : 'light'); } catch {}
      apply();
    });
    apply();
  });
  window.addEventListener('storage', event => {
    if (event.key === 'bedrock-theme') { dark = event.newValue !== 'light'; apply(); }
  });
})();
