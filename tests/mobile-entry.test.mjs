import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Expo explicitly registers the existing Vetit App for both native platforms', async () => {
  const read = path => readFile(new URL(path, import.meta.url), 'utf8');
  const pkg = JSON.parse(await read('../mobile/package.json'));
  const config = JSON.parse(await read('../mobile/app.json'));
  assert.equal(pkg.main, 'index.js');
  assert.equal(config.expo.name, 'Vetit Online');
  assert.equal(config.expo.ios.bundleIdentifier, 'com.vetitonline.app');
  assert.equal(config.expo.android.package, 'com.vetitonline.app');
  const entry = await read('../mobile/index.js');
  assert.match(entry, /import App from '\.\/App'/);
  assert.match(entry, /import \{registerRootComponent\} from 'expo'/);
  const component = {};
  let registered;
  // Exercise the registration body without booting native modules in Node.
  new Function('registerRootComponent', 'App', entry.replace(/^import .*;\n/gm, ''))(value => {registered = value;}, component);
  assert.equal(registered, component);
  const app = await read('../mobile/App.tsx');
  for (const label of ['Home', 'Shop', 'Services', 'Cart', 'Account']) assert.ok(app.includes(`label: '${label}'`));
  assert.doesNotMatch(app, /Hello,? world!/i);
});
