import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const id = '10000000-0000-4000-8000-000000000001';
const profile = { id, fullName: 'Asha' };
const tick = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function mount(read) {
  const nodes = new Map();
  const node = name => {
    if (!nodes.has(name)) nodes.set(name, { value: '', hidden: false, disabled: false, textContent: '', events: {}, addEventListener(event, fn) { this.events[event] = fn; } });
    return nodes.get(name);
  };
  let authListener, unsubscribed = false;
  const windowEvents = {};
  const source = readFileSync(new URL('../src/pages/account.astro', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'exports', 'document', 'window', compiled)(name => {
    if (name.endsWith('profile-client.js')) return { requestProfile: read };
    if (name.endsWith('/browser')) return { createSupabaseBrowserClient: () => ({ auth: { onAuthStateChange(listener) { authListener = listener; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; } } }) };
    throw Error('Unexpected dependency: ' + name);
  }, {}, { getElementById: node }, { addEventListener(event, fn) { windowEvents[event] = fn; }, location: { reload() {} } });
  return { node: name => node('profile-' + name), emit: event => authListener(event), hide: () => windowEvents.pagehide(), unsubscribed: () => unsubscribed };
}
test('actual account page loads and submits the loaded identity with a display name', async () => {
  const calls = [];
  const ui = mount(async options => { calls.push(options); return options.update ? { id, fullName: options.update.fullName.trim() } : profile; });
  await tick();
  assert.equal(ui.node('form').hidden, false); assert.equal(ui.node('name').value, 'Asha');
  ui.node('name').value = ' Asha Devi ';
  ui.node('form').events.submit({ preventDefault() {} });
  assert.equal(ui.node('save').disabled, true);
  await tick();
  assert.equal(calls[1].profileId, id); assert.deepEqual(calls[1].update, { fullName: ' Asha Devi ' });
  assert.equal(ui.node('name').value, 'Asha Devi');
  assert.equal(ui.node('status').textContent, 'Your display name has been saved.');
});
test('account switches clear private form state and discard pending reads and saves', async () => {
  let finish;
  const ui = mount(() => new Promise(resolve => { finish = resolve; }));
  ui.emit('SIGNED_IN'); finish(profile); await tick();
  assert.equal(ui.node('form').hidden, true); assert.equal(ui.node('name').value, '');
  ui.node('reload').events.click(); finish(profile); await tick();
  ui.node('name').value = 'New name';
  ui.node('form').events.submit({ preventDefault() {} });
  ui.emit('SIGNED_OUT'); finish({ id, fullName: 'New name' }); await tick();
  assert.equal(ui.node('form').hidden, true); assert.equal(ui.node('name').value, '');
  assert.match(ui.node('status').textContent, /sign-in changed/);
});
test('uncertain saves do not retry and require a fresh read before saving again', async () => {
  let calls = 0;
  const ui = mount(async options => { calls++; if (options.update) throw Error('Save could not be confirmed. Reload your account before trying again.'); return profile; });
  await tick(); ui.node('form').events.submit({ preventDefault() {} }); await tick();
  assert.equal(calls, 2); assert.equal(ui.node('form').hidden, true); assert.match(ui.node('status').textContent, /Reload/);
  ui.node('form').events.submit({ preventDefault() {} }); await tick(); assert.equal(calls, 2);
  ui.node('reload').events.click(); await tick(); assert.equal(calls, 3); assert.equal(ui.node('form').hidden, false);
});
test('page exit aborts pending work, clears profile and releases the auth listener', async () => {
  let finish, signal;
  const ui = mount(options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); });
  ui.hide(); finish(profile); await tick();
  assert.equal(signal.aborted, true); assert.equal(ui.unsubscribed(), true); assert.equal(ui.node('name').value, ''); assert.equal(ui.node('form').hidden, true);
});
