import test from 'node:test';
import {createServer} from 'node:net';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {phonePreviewPlan} from '../scripts/start-phone-preview.mjs';
test('Windows-compatible preview uses fixture-only session settings and offline Expo Go', () => {
  const plan = phonePreviewPlan('192.168.1.20');
  assert.equal(plan.origin, 'http://192.168.1.20:4324');
  assert.equal(plan.env.EXPO_PUBLIC_VETIT_API_BASE_URL, plan.env.EXPO_PUBLIC_VETIT_TEST_API_ORIGIN);
  assert.equal(plan.env.REACT_NATIVE_PACKAGER_HOSTNAME, '192.168.1.20');
  assert.deepEqual(plan.args, ['start', '--offline', '--go']);
});
test('preview rejects public, loopback, ambiguous and credential-bearing addresses', () => {
  for (const host of ['127.0.0.1', '8.8.8.8', 'vetit.online', 'https://192.168.1.20', '192.168.1.20@evil.com', '192.168.1.256', '192.168.001.20', '172.32.0.1', '']) assert.throws(() => phonePreviewPlan(host));
  for (const host of ['10.0.0.2', '172.16.0.2']) assert.ok(phonePreviewPlan(host));
});

test('CLI dry run starts no services and invalid input fails before launching', () => {
  const script = new URL('../scripts/start-phone-preview.mjs', import.meta.url);
  const run = args => spawnSync(process.execPath, [fileURLToPath(script), ...args], {encoding: 'utf8'});
  const valid = run(['--host', '192.168.1.20', '--check']);
  assert.equal(valid.status, 0);
  assert.equal(JSON.parse(valid.stdout).origin, 'http://192.168.1.20:4324');
  assert.equal(run(['--host', '8.8.8.8']).status, 1);
  assert.equal(run(['--host', '192.168.1.20', '--unexpected']).status, 1);
});

test('occupied fixture port fails safely before Metro without stopping existing processes', async () => {
  const server = createServer();
  let owned = false;
  await new Promise((resolve, reject) => {
    server.once('error', error => error.code === 'EADDRINUSE' ? resolve() : reject(error));
    server.listen(4324, '0.0.0.0', () => {owned = true; resolve();});
  });
  try {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/start-phone-preview.mjs', import.meta.url)), '--host', '192.168.1.20'], {encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already in use/);
    assert.doesNotMatch(result.stdout, /scan the Expo Go/);
  } finally {if (owned) await new Promise(resolve => server.close(resolve));}
});

test('changed Wi-Fi address is selected only when unambiguous', async () => {
  const {resolvePhoneHost} = await import('../scripts/start-phone-preview.mjs');
  const iface = address => ({address, family: 'IPv4', internal: false});
  assert.equal(resolvePhoneHost('auto', {WiFi: [iface('192.168.50.35')], loopback: [{address: '127.0.0.1', family: 'IPv4', internal: true}]}), '192.168.50.35');
  assert.equal(resolvePhoneHost('auto', {WiFi: [iface('192.168.50.35'), iface('192.168.50.35')]}), '192.168.50.35');
  assert.throws(() => resolvePhoneHost('auto', {}), /No private IPv4/);
  assert.throws(() => resolvePhoneHost('auto', {WiFi: [iface('192.168.50.35')], Ethernet: [iface('10.0.0.2')]}), /Multiple private adapters/);
  assert.throws(() => resolvePhoneHost('auto', {public: [iface('8.8.8.8')]}), /No private IPv4/);
  assert.equal(resolvePhoneHost('192.168.50.35', {}), '192.168.50.35');
});

test('CLI options keep LAN defaults and permit a separate Metro port without port collision', async () => {
  const {parsePhonePreviewArgs} = await import('../scripts/start-phone-preview.mjs');
  assert.deepEqual(parsePhonePreviewArgs([]), {host: 'auto', port: 8081, check: false});
  assert.deepEqual(parsePhonePreviewArgs(['--check', '--port', '8090', '--host', 'auto']), {host: 'auto', port: 8090, check: true});
  assert.deepEqual(phonePreviewPlan('192.168.50.35', {port: 8090}).args, ['start', '--offline', '--go', '--port', '8090']);
  for (const args of [['--port'], ['--port', 'abc'], ['--host', '--check'], ['--check', '--check'], ['--host', 'auto', '--host', 'auto']]) assert.throws(() => parsePhonePreviewArgs(args));
  for (const port of [4324, 80, 65536, NaN, 8090.5]) assert.throws(() => phonePreviewPlan('192.168.50.35', {port}));
});
