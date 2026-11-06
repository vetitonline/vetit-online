import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createSavedCartWorkspace } from '../src/lib/buyer/saved-cart-workspace.js';
import { cartId } from '../src/lib/buyer/saved-cart-contract.js';

const owner = '10000000-0000-4000-8000-000000000001', listing = '10000000-0000-4000-8000-000000000002', line = '10000000-0000-4000-8000-000000000003';
const item = { id: line, listing_id: listing, product_variant_id: null, quantity: 2, title: '<script>untrusted title</script>' };
const saved = items => ({ apiVersion: 1, state: 'available', profileId: owner, marketCode: 'IN', cart: { id: line, market_code: 'IN', currency_code: 'INR', status: 'active' }, items });
const product = { id: listing, title: 'Food', priceMinor: 12500, priceIsFrom: false, currencyCode: 'INR' };
class Element {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.events = {}; this.value = ''; this.disabled = false; this.hidden = false; this.text = ''; this.attributes = {}; }
  set textContent(value) { this.text = value; this.children = []; }
  get textContent() { return this.text + this.children.map(child => child.textContent).join(' '); }
  set innerHTML(_) { throw Error('Unsafe HTML rendering'); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.text = ''; this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, listener) { this.events[name] = listener; }
  reportValidity() { return true; }
  emit(name) { return this.events[name]?.({ preventDefault() {}, currentTarget: this }); }
}
async function mount({ initial = saved([item]), candidate = product, query = '', read } = {}) {
  const source = fs.readFileSync(new URL('../src/pages/account/cart.astro', import.meta.url), 'utf8');
  const nodes = new Map();
  for (const match of source.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^<>]*\bid="([^"]+)"[^<>]*)>/g)) {
    const element = new Element(match[1]); element.hidden = /\bhidden\b/.test(match[2]); element.disabled = /\bdisabled\b/.test(match[2]); nodes.set(match[3], element);
  }
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const code = ts.transpileModule(script, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const calls = [], events = {}; let authListener, unsubscribed = false, stored = initial;
  const request = read ?? (async options => {
    calls.push(options);
    if (options.command) {
      if (options.command.action === 'set') stored = saved([{ ...item, quantity: options.command.item.quantity }]);
      else stored = saved([]);
      return { apiVersion: 1, state: options.command.action === 'set' ? 'saved' : 'deleted', cartItemId: line };
    }
    return stored;
  });
  const modules = {
    '../../lib/buyer/saved-cart-workspace.js': { createSavedCartWorkspace: options => createSavedCartWorkspace({ ...options, read: request }) },
    '../../lib/buyer/saved-cart-contract.js': { cartId },
    '../../lib/marketplace/catalog-client.js': { fetchCatalog: async () => ({ products: candidate ? [candidate] : [] }) },
    '../../lib/supabase/browser': { createSupabaseBrowserClient: () => ({ auth: { onAuthStateChange(listener) { authListener = listener; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; } } }) },
  };
  new Function('require', 'exports', 'document', 'window', 'location', code)(name => {
    assert.ok(name in modules, 'Unexpected import ' + name); return modules[name];
  }, {}, { getElementById: id => nodes.get(id), createElement: tag => new Element(tag) }, { addEventListener(name, fn) { events[name] = fn; }, location: { reload() {} } }, { pathname: '/account/cart', search: query });
  const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
  await flush();
  return { get: name => nodes.get('saved-' + name), calls, flush, emit: event => authListener(event), hide: () => events.pagehide(), unsubscribed: () => unsubscribed };
}
test('actual saved-cart page renders titles as text, updates quantities and removes confirmed lines', async () => {
  const ui = await mount();
  assert.match(ui.get('items').textContent, /<script>untrusted title<\/script>/);
  const row = ui.get('items').children[0], form = row.children.find(node => node.tagName === 'FORM');
  form.children[0].children[0].value = '5'; form.emit('submit'); await ui.flush();
  assert.deepEqual(ui.calls[1].command, { action: 'set', item: { listingId: listing, productVariantId: null, quantity: 5, marketCode: 'IN' } });
  assert.equal(ui.calls[1].profileId, owner);
  assert.match(ui.get('status').textContent, /updated/);
  const remove = ui.get('items').children[0].children.find(node => node.tagName === 'BUTTON'); remove.emit('click'); await ui.flush();
  assert.match(ui.get('items').textContent, /empty/);
});
test('product handoff loads current catalogue data and saves an explicit absolute quantity', async () => {
  const ui = await mount({ query: '?listingId=' + listing });
  assert.equal(ui.get('product-title').textContent, 'Food'); assert.equal(ui.get('add-button').disabled, false);
  assert.equal(ui.get('quantity').value, '2'); ui.get('quantity').value = '7';
  ui.get('add').emit('submit'); await ui.flush();
  assert.equal(ui.calls[1].command.item.quantity, 7); assert.equal(ui.calls[1].command.item.productVariantId, null);
});
test('variant-only, missing and malformed candidates cannot enable account-cart additions', async () => {
  for (const options of [{ candidate: { ...product, priceIsFrom: true } }, { candidate: null }, { candidate: { ...product, priceMinor: null } }, { query: '?listingId=invalid' }]) {
    const ui = await mount({ query: '?listingId=' + listing, ...options });
    assert.equal(ui.get('add-button').disabled, true); assert.match(ui.get('product-title').textContent, /cannot be saved/);
    ui.get('add').emit('submit'); await ui.flush(); assert.equal(ui.calls.filter(call => call.command).length, 0);
  }
});
test('sign-out clears private cart immediately and disables edits; page exit releases auth', async () => {
  const ui = await mount({ query: '?listingId=' + listing }); ui.emit('SIGNED_OUT');
  assert.equal(ui.get('items').children.length, 0); assert.equal(ui.get('add-button').disabled, true); assert.equal(ui.get('quantity').value, '1');
  assert.equal(ui.get('signin').hidden, false); assert.match(ui.get('signin').attributes.href, /next=%2Faccount%2Fcart/);
  ui.hide(); assert.equal(ui.unsubscribed(), true);
});
test('expired sessions and unavailable saved-cart RPCs expose clear states without private rows or automatic writes', async () => {
  for (const status of [401, 503]) {
    let calls = 0;
    const ui = await mount({ read: async () => { calls++; const error = Error('Saved cart is unavailable.'); error.status = status; throw error; } });
    assert.equal(calls, 1); assert.equal(ui.get('items').children.length, 0); assert.equal(ui.get('signin').hidden, status !== 401); assert.equal(ui.get('reload').disabled, false);
  }
});
