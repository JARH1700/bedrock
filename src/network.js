import { isIP } from 'node:net';
export function bedrockNetwork(settings, env = process.env) {
  const ip = env.BEDROCK_PUBLIC_IP || '<public_ip>';
  if (ip !== '<public_ip>' && isIP(ip) !== 4) throw new Error('BEDROCK_PUBLIC_IP debe ser una IPv4 pública.');
  const range = env.BEDROCK_UDP_RANGE || '19140-19239';
  const match = /^(\d+)-(\d+)$/.exec(range);
  if (!match) throw new Error('BEDROCK_UDP_RANGE debe tener formato inicio-fin.');
  const [, a, b] = match.map(Number);
  if (a < 1024 || b > 65535 || a > b || b - a >= 1000 || b - a + 1 < settings.maxPlayers) throw new Error('Rango UDP inválido: requiere un puerto por jugador y máximo 1000.');
  const signalPort = Number(env.BEDROCK_SIGNAL_BIND_PORT || settings.port);
  if (!Number.isInteger(signalPort) || signalPort < 1024 || signalPort > 65535) throw new Error('Puerto TCP de Bedrock inválido.');
  const ports = { '19132/tcp': [{ HostPort: String(signalPort) }] };
  for (let port = a; port <= b; port++) ports[`${port}/udp`] = [{ HostPort: String(port) }];
  return { Env: ['TRANSPORT=nethernet', 'SERVER_PORT=19132', `SERVER_UDP_PORTS=${ip}:${range}:${range}`], ExposedPorts: Object.fromEntries(Object.keys(ports).map(key => [key, {}])), PortBindings: ports };
}
