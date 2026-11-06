import test from 'node:test';
import assert from 'node:assert/strict';
import { createSavedCartHandler } from '../src/lib/buyer/saved-cart-api.js';
import { requestSavedCart } from '../src/lib/buyer/saved-cart-client.js';
import { normalizeSavedCart } from '../src/lib/buyer/saved-cart-contract.js';
import { createSavedCartWorkspace } from '../src/lib/buyer/saved-cart-workspace.js';
import { isProtectedPath } from '../src/lib/auth/navigation.js';

const owner = '10000000-0000-4000-8000-000000000001';
const listing = '10000000-0000-4000-8000-000000000002';
const itemId = '10000000-0000-4000-8000-000000000003';
const cartId = '10000000-0000-4000-8000-000000000004';
const other = '10000000-0000-4000-8000-000000000005';
const origin = 'https://test.example.invalid';
const cart = { id: cartId, market_code: 'IN', currency_code: 'INR', status: 'active' };
const item = { id: itemId, listing_id: listing, product_variant_id: null, quantity: 2, title: 'Dog food' };
const snapshot = (items = [item], profileId = owner) => ({ apiVersion: 1, state: 'available', profileId, marketCode: 'IN', cart, items });
function fixture({ state = 'authenticated', results, rpcResult = { data: itemId, error: null } } = {}) {
  const calls = [], rpcs = [];
  const queue = results ?? [{ data: cart }, { data: [item], count: 1 }, { data: [{ id: listing, title: item.title }], count: 1 }];
  const supabase = { from(table) {
    const record = [table]; calls.push(record); const result = queue.shift();
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'maybeSingle']) query[method] = (...args) => { record.push([method, ...args]); return query; };
    return query;
  } };
  const handler = createSavedCartHandler({ authenticate: async () => ({ state, user: { id: owner }, supabase }), rpc: async (_client, name, args) => { rpcs.push([name, args]); return rpcResult; } });
  return { calls, rpcs, invoke: request => handler({ request, cookies: {} }) };
}
const get = () => new Request(origin + '/api/buyer/cart');
const mutation = (body, { method = 'POST', headers = {} } = {}) => new Request(origin + '/api/buyer/cart', { method, headers: { origin, 'content-type': 'application/json', 'x-vetit-profile-id': owner, ...headers }, body: JSON.stringify(body) });
const setItem = { listingId: listing, productVariantId: null, quantity: 2, marketCode: 'IN' };

test('saved cart reads only the verified profile and active India cart with bounded complete children', async () => {
  const f = fixture(); const r = await f.invoke(get());
  assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await r.json(), snapshot());
  assert.ok(f.calls[0].some(step => JSON.stringify(step) === JSON.stringify(['eq', 'profile_id', owner])));
  assert.ok(f.calls[1].some(step => JSON.stringify(step) === JSON.stringify(['eq', 'cart_id', cartId])));
  assert.ok(f.calls[1].some(step => JSON.stringify(step) === JSON.stringify(['limit', 201])));
  assert.deepEqual(f.rpcs, []);
});
test('no active cart is empty rather than a write; unavailable titles retain a removable saved line', async () => {
  const empty = fixture({ results: [{ data: null }] });
  assert.deepEqual(await (await empty.invoke(get())).json(), { apiVersion: 1, state: 'available', profileId: owner, marketCode: 'IN', cart: null, items: [] });
  assert.equal(empty.calls.length, 1); assert.equal(empty.rpcs.length, 0);
  const f = fixture({ results: [{ data: cart }, { data: [item], count: 1 }, { data: [], count: 0 }] });
  assert.equal((await (await f.invoke(get())).json()).items[0].title, null);
});
test('authentication, market and origin failures cannot reach queries or RPCs', async () => {
  for (const state of ['unauthenticated', 'unavailable']) {
    const f = fixture({ state }); assert.equal((await f.invoke(get())).status, state === 'unavailable' ? 503 : 401); assert.deepEqual(f.calls, []);
  }
  for (const headers of [{ origin: 'https://foreign.invalid' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'x-vetit-profile-id': other }]) {
    const f = fixture(); const r = await f.invoke(mutation(setItem, { headers })); assert.ok([403, 409].includes(r.status)); assert.deepEqual(f.rpcs, []);
  }
  const f = fixture(); assert.equal((await f.invoke(new Request(origin + '/api/buyer/cart?market=USA'))).status, 400); assert.deepEqual(f.calls, []);
});
test('set and remove delegate exact allowlisted arguments to existing scoped commerce RPCs', async () => {
  const f = fixture(); assert.equal((await f.invoke(mutation({ ...setItem, profileId: other, priceMinor: 1, status: 'paid' }))).status, 200);
  assert.deepEqual(f.rpcs, [['set_my_cart_item', { p_listing_id: listing, p_product_variant_id: null, p_quantity: 2, p_market_code: 'IN' }]]);
  const remove = fixture(); assert.equal((await remove.invoke(mutation({ itemId }, { method: 'DELETE' }))).status, 200);
  assert.deepEqual(remove.rpcs, [['remove_my_cart_item', { p_cart_item_id: itemId }]]);
});
test('native bearer mutation works without Origin, but a valid-looking token never bypasses authentication', async () => {
  const options = { headers: { origin: '', authorization: 'Bearer synthetic.test.token' } };
  assert.equal((await fixture().invoke(mutation(setItem, options))).status, 200);
  const f = fixture({ state: 'unauthenticated' }); assert.equal((await f.invoke(mutation(setItem, options))).status, 401); assert.deepEqual(f.rpcs, []);
});
test('invalid, oversized and unsupported payloads never write', async () => {
  for (const [request, status] of [
    [mutation({ ...setItem, quantity: 0 }), 400], [mutation({ ...setItem, quantity: 100 }), 400],
    [mutation({ ...setItem, marketCode: 'USA' }), 400], [mutation({ ...setItem, listingId: 'bad' }), 400],
    [mutation({ ...setItem, ignored: 'x'.repeat(3000) }), 413],
    [mutation(setItem, { headers: { 'content-type': 'text/plain' } }), 415],
  ]) { const f = fixture(); assert.equal((await f.invoke(request)).status, status); assert.deepEqual(f.rpcs, []); }
});
test('partial counted results, invalid rows and database errors fail closed without diagnostics', async () => {
  for (const result of [{ data: [item], count: 2 }, { data: [item], count: null }, { data: [item, item], count: 2 }, { data: [{ ...item, quantity: 100 }], count: 1 }, { error: { message: 'PRIVATE SQL' } }]) {
    const f = fixture({ results: [{ data: cart }, result, { data: [], count: 0 }] }); const r = await f.invoke(get());
    assert.equal(r.status, 503); assert.equal((await r.text()).includes('PRIVATE'), false);
  }
  const r = await fixture({ rpcResult: { error: { code: '22023', message: 'PRIVATE SQL' } } }).invoke(mutation(setItem));
  assert.equal(r.status, 422); assert.equal((await r.text()).includes('PRIVATE'), false);
});
test('client rejects malformed cart snapshots and refuses unsafe origins or invalid mutations before fetch', async () => {
  for (const bad of [{ ...snapshot(), profileId: 'bad' }, snapshot([item, item]), { ...snapshot(), cart: null }, { ...snapshot(), marketCode: 'US' }]) assert.throws(() => normalizeSavedCart(bad));
  let calls = 0; const fetchImpl = async () => { calls++; throw Error('offline'); };
  for (const baseUrl of [origin + '/path', 'https://user:pass@test.invalid', 'file:///tmp/cart']) await assert.rejects(requestSavedCart({ baseUrl, fetchImpl }));
  await assert.rejects(requestSavedCart({ baseUrl: origin, command: { action: 'set', item: setItem }, fetchImpl }));
  assert.equal(calls, 0);
  await assert.rejects(requestSavedCart({ baseUrl: origin, profileId: owner, command: { action: 'set', item: setItem }, fetchImpl }), /Reload/); assert.equal(calls, 1);
});
test('shared cookie/bearer client consumes the real handler and sends an account-bound mutation', async () => {
  for (const accessToken of [undefined, 'synthetic.test.token']) {
    const f = fixture();
    const fetchImpl = async (url, options) => {
      assert.equal(options.credentials, accessToken ? 'omit' : 'same-origin'); assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      return f.invoke(new Request(url, { ...options, headers: { ...options.headers, ...(accessToken ? {} : { origin }) } }));
    };
    assert.deepEqual(await requestSavedCart({ baseUrl: origin, accessToken, fetchImpl }), snapshot());
    const result = await requestSavedCart({ baseUrl: origin, accessToken, profileId: owner, command: { action: 'set', item: setItem }, fetchImpl });
    assert.equal(result.state, 'saved'); assert.equal(f.rpcs.length, 1);
  }
});
test('workspace coalesces writes and confirms updated quantities with a fresh same-account read', async () => {
  const states = [], commands = []; let finish, saved = snapshot();
  const ui = createSavedCartWorkspace({ render: state => states.push(state), read: async options => {
    if (options.command) { commands.push(options); await new Promise(resolve => { finish = resolve; }); saved = snapshot([{ ...item, quantity: 5 }]); return { state: 'saved' }; }
    return saved;
  } });
  await ui.load(); const pending = ui.mutate({ action: 'set', item: { ...setItem, quantity: 5 } });
  await ui.mutate({ action: 'set', item: { ...setItem, quantity: 8 } }); assert.equal(commands.length, 1);
  assert.equal(commands[0].profileId, owner); finish(); await pending;
  assert.equal(states.at(-1).phase, 'ready'); assert.equal(states.at(-1).cart.items[0].quantity, 5);
});
test('workspace failures require reload and never automatically repeat or claim an unconfirmed save', async () => {
  for (const mode of ['offline', 'mismatch', 'other-account']) {
    const states = []; let writes = 0, reads = 0;
    const ui = createSavedCartWorkspace({ render: s => states.push(s), read: async options => {
      if (options.command) { writes++; if (mode === 'offline') throw Error('Reload before retry.'); return { state: 'saved' }; }
      reads++; return reads > 1 && mode === 'other-account' ? snapshot([item], other) : snapshot();
    } });
    await ui.load(); await ui.mutate({ action: 'set', item: { ...setItem, quantity: 8 } });
    assert.equal(states.at(-1).phase, 'error'); assert.equal(states.at(-1).cart, null);
    await ui.mutate({ action: 'set', item: setItem }); assert.equal(writes, 1);
    await ui.load(); assert.equal(states.at(-1).phase, 'ready');
  }
});
test('account changes and disposal suppress stale private reads and pending write acknowledgements', async () => {
  const states = []; let finish, signal;
  const ui = createSavedCartWorkspace({ render: s => states.push(s), read: options => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); } });
  const pending = ui.load(); ui.clear(); finish(snapshot()); await pending;
  assert.equal(signal.aborted, true); assert.equal(states.at(-1).phase, 'signin'); assert.equal(states.at(-1).cart, null);
  const next = ui.load(); ui.dispose(); finish(snapshot()); await next; assert.equal(states.at(-1).phase, 'loading');
  assert.equal(isProtectedPath('/account/cart'), true); assert.equal(isProtectedPath('/account/cart/'), true);
});
test('removal succeeds only when readback confirms that the saved line is absent', async () => {
  let saved = snapshot(); const states = [];
  const ui = createSavedCartWorkspace({ render: s => states.push(s), read: async options => {
    if (options.command) { saved = snapshot([]); return { state: 'deleted' }; } return saved;
  } });
  await ui.load(); await ui.mutate({ action: 'remove', itemId });
  assert.equal(states.at(-1).phase, 'ready'); assert.deepEqual(states.at(-1).cart.items, []);
});
test('an account switch during a pending write discards its acknowledgement without reading the new account', async () => {
  let finish, reads = 0; const states = [];
  const ui = createSavedCartWorkspace({ render: s => states.push(s), read: async options => {
    if (options.command) return new Promise(resolve => { finish = resolve; });
    reads++; return snapshot();
  } });
  await ui.load(); const pending = ui.mutate({ action: 'set', item: setItem });
  ui.clear(); finish({ state: 'saved' }); await pending;
  assert.equal(reads, 1); assert.equal(states.at(-1).phase, 'signin'); assert.equal(states.at(-1).cart, null);
});
test('API retains explicit non-India market support while the new client remains India-only', async () => {
  const f = fixture({ results: [{ data: { ...cart, market_code: 'US', currency_code: 'USD' } }, { data: [], count: 0 }] });
  const r = await f.invoke(new Request(origin + '/api/buyer/cart?market=us'));
  assert.equal(r.status, 200); assert.equal((await r.json()).marketCode, 'US');
  assert.ok(f.calls[0].some(step => JSON.stringify(step) === JSON.stringify(['eq', 'market_code', 'US'])));
  const write = fixture(); assert.equal((await write.invoke(mutation({ ...setItem, marketCode: 'US' }))).status, 200);
  assert.equal(write.rpcs[0][1].p_market_code, 'US');
  await assert.rejects(requestSavedCart({ baseUrl: origin, fetchImpl: async () => Response.json({ ...snapshot(), marketCode: 'US', cart: { ...cart, market_code: 'US', currency_code: 'USD' } }) }), /invalid response/);
});
