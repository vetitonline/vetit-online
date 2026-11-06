import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfileHandler } from '../src/lib/account/profile-api.js';
import { normalizeProfileUpdate } from '../src/lib/account/profile-contract.js';
import { requestProfile } from '../src/lib/account/profile-client.js';
import { isProtectedPath } from '../src/lib/auth/navigation.js';

const id = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const origin = 'https://test.example.invalid';
function setup({ state = 'authenticated', data = { id, full_name: 'Asha' }, error = null } = {}) {
  const calls = [];
  const query = {};
  for (const method of ['select', 'eq', 'update']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.maybeSingle = async () => ({ data, error });
  const handler = createProfileHandler({ authenticate: async () => ({ state, user: { id }, supabase: { from(table) { calls.push(['from', table]); return query; } } }) });
  return { calls, invoke: (request) => handler({ request, cookies: {} }) };
}
function request(body, headers = {}) {
  return new Request(origin + '/api/account/profile', {
    method: 'PATCH', headers: { origin, 'content-type': 'application/json', 'x-vetit-profile-id': id, ...headers }, body: JSON.stringify(body),
  });
}
test('profile supports Indian names, trims NFC text and rejects mass assignment', () => {
  assert.deepEqual(normalizeProfileUpdate({ fullName: '  आशा देवी  ' }), { full_name: 'आशा देवी' });
  assert.deepEqual(normalizeProfileUpdate({ fullName: 'e\u0301' }), { full_name: 'é' });
  for (const value of [null, [], {}, { fullName: '' }, { fullName: 'x'.repeat(101) }, { fullName: 'a\nb' }, { fullName: 'A', role: 'admin' }, { fullName: 'A', id: other }, { fullName: 'A', phone: '+919876543210' }]) assert.throws(() => normalizeProfileUpdate(value));
});
test('profile requires a verified identity before querying', async () => {
  for (const state of ['unauthenticated', 'unavailable']) {
    const s = setup({ state });
    assert.equal((await s.invoke(new Request(origin + '/api/account/profile'))).status, state === 'unavailable' ? 503 : 401);
    assert.deepEqual(s.calls, []);
  }
});
test('GET reads only the caller profile and exposes no role or auth data', async () => {
  const s = setup({ data: { id, full_name: 'Asha', role: 'admin', secret: 'PRIVATE' } });
  const r = await s.invoke(new Request(origin + '/api/account/profile?id=' + other));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(await r.json(), { apiVersion: 1, state: 'available', profile: { id, fullName: 'Asha' } });
  assert.deepEqual(s.calls, [['from', 'profiles'], ['select', 'id,full_name'], ['eq', 'id', id]]);
});
test('cookie mutation rejects foreign/missing origins and stale account identities', async () => {
  for (const headers of [{ origin: 'https://foreign.invalid' }, { origin: '' }, { 'sec-fetch-site': 'cross-site' }, { 'x-vetit-profile-id': other }, { 'x-vetit-profile-id': '' }]) {
    const s = setup(); const r = await s.invoke(request({ fullName: 'New' }, headers));
    assert.ok([403, 409].includes(r.status)); assert.deepEqual(s.calls, []);
  }
});
test('PATCH changes only full_name for the verified user', async () => {
  const s = setup(); const r = await s.invoke(request({ fullName: ' Asha ' }));
  assert.equal(r.status, 200);
  assert.deepEqual(s.calls, [['from', 'profiles'], ['update', { full_name: 'Asha' }], ['eq', 'id', id], ['select', 'id,full_name']]);
});
test('native bearer mutation is allowed without Origin after authentication', async () => {
  const s = setup();
  const r = await s.invoke(request({ fullName: 'Asha' }, { origin: '', authorization: 'Bearer synthetic.test.token' }));
  assert.equal(r.status, 200);
});
test('malformed, oversized, unsupported and privileged updates cannot write', async () => {
  for (const [req, status] of [
    [request({ fullName: 'A', role: 'admin' }), 400],
    [request({ fullName: 'A' }, { 'content-type': 'text/plain' }), 415],
    [request({ fullName: 'x'.repeat(3000) }), 413],
    [new Request(origin + '/api/account/profile', { method: 'PATCH', headers: { origin, 'content-type': 'application/json', 'x-vetit-profile-id': id }, body: '{' }), 400],
  ]) { const s = setup(); assert.equal((await s.invoke(req)).status, status); assert.deepEqual(s.calls, []); }
});
test('missing rows and database failures never synthesize a successful profile', async () => {
  for (const [options, status] of [[{ data: null }, 404], [{ error: { message: 'PRIVATE SQL' } }, 503], [{ data: { id: other, full_name: 'Other' } }, 503]]) {
    const r = await setup(options).invoke(request({ fullName: 'A' }));
    assert.equal(r.status, status); assert.equal((await r.text()).includes('PRIVATE'), false);
  }
});
test('shared client uses cookies on web and omits cookies for bearer sessions', async () => {
  for (const accessToken of [undefined, 'synthetic.test.token']) {
    const result = await requestProfile({ baseUrl: origin, accessToken, profileId: id, update: { fullName: ' Asha ' }, fetchImpl: async (url, options) => {
      assert.equal(url, origin + '/api/account/profile'); assert.equal(options.method, 'PATCH');
      assert.equal(options.credentials, accessToken ? 'omit' : 'same-origin');
      assert.equal(options.redirect, 'error'); assert.equal(options.cache, 'no-store');
      assert.equal(options.headers['x-vetit-profile-id'], id);
      assert.deepEqual(JSON.parse(options.body), { fullName: 'Asha' });
      return setup().invoke(new Request(url, { ...options, headers: { ...options.headers, ...(accessToken ? {} : { origin }) } }));
    } });
    assert.deepEqual(result, { id, fullName: 'Asha' });
  }
});
test('client rejects unsafe configuration and malformed/foreign responses without retrying writes', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw Error('offline'); };
  for (const baseUrl of ['https://user:pass@test.invalid', origin + '/path', 'file:///tmp/a']) await assert.rejects(requestProfile({ baseUrl, fetchImpl }));
  await assert.rejects(requestProfile({ baseUrl: origin, update: { fullName: 'Asha' }, fetchImpl }));
  assert.equal(calls, 0);
  await assert.rejects(requestProfile({ baseUrl: origin, profileId: id, update: { fullName: 'Asha' }, fetchImpl }), /Reload/);
  assert.equal(calls, 1);
  for (const body of [{ apiVersion: 2 }, { apiVersion: 1, state: 'available', profile: { id: other, fullName: 'Other' } }]) {
    await assert.rejects(requestProfile({ baseUrl: origin, profileId: id, update: { fullName: 'Asha' }, fetchImpl: async () => Response.json(body) }), /invalid response/);
  }
});
test('account route participates in session protection and private cache policy', () => {
  assert.equal(isProtectedPath('/account'), true); assert.equal(isProtectedPath('/account/'), true);
});
