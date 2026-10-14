const base = 'http://127.0.0.1:3000';
const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Panel-Request': '1' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) });
if (!login.ok) throw new Error('No se pudo autenticar con el panel.');
const cookie = login.headers.get('set-cookie')?.split(';')[0];
const response = await fetch(`${base}/api/network/migrate`, { method: 'POST', headers: { Cookie: cookie, 'X-Panel-Request': '1' } });
if (!response.ok) throw new Error(await response.text());
for (;;) {
  await new Promise(resolve => setTimeout(resolve, 1000));
  const stateResponse = await fetch(`${base}/api/status`, { headers: { Cookie: cookie } });
  if (!stateResponse.ok) throw new Error('No se pudo consultar el estado. Revisa el panel.');
  const state = await stateResponse.json();
  if (state.job.status === 'error') throw new Error(state.job.message);
  if (!state.busy) { console.log(state.job.message); break; }
}
