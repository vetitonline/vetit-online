import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { localSsrNodeResolution } from '../scripts/local-ssr-node-resolution.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const astroManifest = fs.realpathSync(require.resolve('astro/package.json'));
const astroRequire = createRequire(astroManifest);
function harness(platform = 'win32') {
  const calls = [];
  const fetchModule = async (...args) => { calls.push(args); return { code: 'original transform' }; };
  const server = { config: { root }, environments: { ssr: { fetchModule }, client: { fetchModule } } };
  localSsrNodeResolution({ platform }).configureServer(server);
  return { server, calls, fetchModule };
}

test('native ESM resolution preserves conditional EventEmitter exports', async () => {
  const { server } = harness();
  const queue = astroRequire.resolve('p-queue');
  const result = await server.environments.ssr.fetchModule('eventemitter3', queue);
  assert.equal(result.type, 'module');
  assert.match(result.externalize, /index\.mjs$/);
  assert.equal(typeof (await import(result.externalize)).EventEmitter, 'function');
});

test('root-relative Vite and native CommonJS entries load without require globals', async () => {
  const { server } = harness();
  const vite = astroRequire.resolve('vite').replaceAll('\\', '/');
  const relative = vite.slice(root.replaceAll('\\', '/').replace(/\/$/, '').length);
  const result = await server.environments.ssr.fetchModule(relative, astroManifest);
  assert.equal(typeof (await import(result.externalize)).createServer, 'function');
  const cjs = await server.environments.ssr.fetchModule('picomatch', vite);
  assert.equal(cjs.type, 'commonjs');
  assert.equal(typeof (await import(cjs.externalize)).default, 'function');
});

test('application, Astro transforms, browser and non-Windows environments stay delegated', async () => {
  const { server, calls, fetchModule } = harness();
  assert.equal(server.environments.client.fetchModule, fetchModule);
  await server.environments.ssr.fetchModule('/src/pages/index.astro', astroManifest);
  await server.environments.ssr.fetchModule('astro:middleware', astroManifest);
  await server.environments.ssr.fetchModule('astro', astroManifest);
  assert.equal(calls.length, 3);
  const linux = harness('linux');
  assert.equal(linux.server.environments.ssr.fetchModule, linux.fetchModule);
});

test('uninstalled packages still fail instead of being fabricated', async () => {
  const { server } = harness();
  await assert.rejects(server.environments.ssr.fetchModule('vetit-nonexistent-runtime-fixture', astroManifest),
    { code: 'ERR_MODULE_NOT_FOUND' });
});
