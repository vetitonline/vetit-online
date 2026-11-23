import test from 'node:test';
import {createServer} from 'node:net';
import {spawnSync} from 'node:child_process';
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
  const run = args => spawnSync(process.execPath, [script.pathname, ...args], {encoding: 'utf8'});
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
    const result = spawnSync(process.execPath, [new URL('../scripts/start-phone-preview.mjs', import.meta.url).pathname, '--host', '192.168.1.20'], {encoding: 'utf8', timeout: 15000});
    assert.equal(result.status, 1);
    assert.match(result.stderr, /already in use/);
    assert.doesNotMatch(result.stdout, /scan the Expo Go/);
  } finally {if (owned) await new Promise(resolve => server.close(resolve));}
});
