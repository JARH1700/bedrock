import test from 'node:test';
import assert from 'node:assert/strict';
import { bedrockNetwork } from '../src/network.js';
test('NetherNet publica TCP y todo el rango UDP con dirección anunciada', () => {
  const n = bedrockNetwork({ port: 20000, maxPlayers: 10 }, { BEDROCK_PUBLIC_IP: '66.179.208.33', BEDROCK_UDP_RANGE: '19140-19159' });
  assert.deepEqual(n.PortBindings['19132/tcp'], [{ HostPort: '20000' }]);
  assert.equal(Object.keys(n.PortBindings).length, 21);
  assert.ok(n.Env.includes('SERVER_UDP_PORTS=66.179.208.33:19140-19159:19140-19159'));
  assert.ok(!n.ExposedPorts['19132/udp']);
});
test('NetherNet rechaza direcciones y rangos inválidos', () => {
  for (const env of [{ BEDROCK_PUBLIC_IP: 'example.com' }, { BEDROCK_UDP_RANGE: '19140-19141' }, { BEDROCK_UDP_RANGE: '65000-66000' }, { BEDROCK_UDP_RANGE: 'bad' }]) assert.throws(() => bedrockNetwork({ port: 19132, maxPlayers: 10 }, env));
});
