import test from 'node:test';
import assert from 'node:assert/strict';
import { safeNextPath, sessionLoginPath } from '../src/lib/auth/navigation.js';
import { createSessionController } from '../src/lib/auth/session-controller.js';
import { completeAuthCallback } from '../src/lib/auth/callback.js';
import { assertTestSupabaseUrl, resolveMobileApiBase, TEST_SUPABASE_ORIGIN } from '../src/lib/supabase/test-endpoints.js';
const origin = 'https://test.example.invalid';
test('redirects preserve local paths, query and fragment', () => {
  assert.equal(safeNextPath('/seller/../appointments?a=1#booking', origin), '/appointments?a=1#booking');
});
test('redirects reject external, backslash, controls and malformed paths', () => {
  for (const value of [null, '', 'https://evil.invalid', '//evil.invalid', '/\\evil.invalid', '/\tevil.invalid', '/\nevil.invalid', ' /seller', 'javascript:alert(1)']) assert.equal(safeNextPath(value, origin), '/');
});
test('expired session return path remains same-origin', () => {
  assert.equal(new URL(sessionLoginPath('/\\evil.invalid', origin), origin).searchParams.get('next'), '/');
});
test('web development accepts exclusively the exact Test Supabase origin', () => {
  assert.doesNotThrow(() => assertTestSupabaseUrl(TEST_SUPABASE_ORIGIN));
  for (const value of [undefined, '', 'https://production.supabase.co', `${TEST_SUPABASE_ORIGIN}.evil.invalid`, `${TEST_SUPABASE_ORIGIN}/`]) assert.throws(() => assertTestSupabaseUrl(value));
});
test('mobile development requires an explicit matching Test origin and rejects production', () => {
  assert.equal(resolveMobileApiBase('http://localhost:4321', 'http://localhost:4321', true), 'http://localhost:4321');
  assert.equal(resolveMobileApiBase('http://10.0.2.2:4321', 'http://10.0.2.2:4321', true), 'http://10.0.2.2:4321');
  assert.equal(resolveMobileApiBase('http://192.168.1.10:4321', 'http://192.168.1.10:4321', true), 'http://192.168.1.10:4321');
  assert.equal(resolveMobileApiBase(origin, origin, true), origin);
  for (const [url, expected] of [[undefined, undefined], [origin, undefined], [origin, 'https://other.invalid'], ['https://vetit.online', 'https://vetit.online'], ['https://www.vetit.online', 'https://www.vetit.online'], ['http://remote.invalid', 'http://remote.invalid'], [`${origin}/path`, origin], ['https://user:synthetic@test.example.invalid', origin]]) assert.throws(() => resolveMobileApiBase(url, expected, true));
  assert.throws(() => resolveMobileApiBase(undefined, undefined));
});
function fixture(result = { data: { user: { id: 'synthetic' } }, error: null }) {
  let listener;
  let unsubscribed = false;
  const redirects = [], renders = [], scopes = [];
  const auth = {
    onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() { unsubscribed = true; } } } }; },
    async getUser() { return result; },
    async signOut(options) { scopes.push(options); listener('SIGNED_OUT', null); return { error: null }; },
  };
  const controller = createSessionController({ auth, location: { origin, pathname: '/seller', search: '?tab=products', replace: path => redirects.push(path) }, render: state => renders.push(state) });
  return { auth, controller, redirects, renders, scopes, emit: event => listener(event, null), unsubscribed: () => unsubscribed };
}
test('verified session renders signed-in state', async () => {
  const f = fixture(); await f.controller.check(); assert.deepEqual(f.renders, [true]); assert.deepEqual(f.redirects, []);
});
test('missing and expired sessions redirect with return path', async () => {
  for (const error of [null, { status: 401 }, { name: 'AuthSessionMissingError' }]) {
    const f = fixture({ data: { user: null }, error }); await f.controller.check();
    assert.equal(new URL(f.redirects[0], origin).searchParams.get('next'), '/seller?tab=products');
  }
});
test('network failure does not falsely sign the user out', async () => {
  const f = fixture({ data: { user: null }, error: { status: 503 } }); await f.controller.check(); assert.deepEqual(f.redirects, []); assert.deepEqual(f.renders, []);
});
test('logout is local, clears UI, redirects once and disposes subscription', async () => {
  const f = fixture(); await f.controller.logout(); assert.deepEqual(f.scopes, [{ scope: 'local' }]); assert.deepEqual(f.redirects, ['/login?reason=signed-out']); assert.equal(f.renders.at(-1), false);
  f.controller.dispose(); assert.equal(f.unsubscribed(), true);
});
test('logout failure is reported without success redirect', async () => {
  const f = fixture(); f.auth.signOut = async () => ({ error: new Error('synthetic failure') });
  await assert.rejects(f.controller.logout()); assert.deepEqual(f.redirects, []);
});
test('cross-tab sign-out redirects protected pages', () => {
  const f = fixture(); f.emit('SIGNED_OUT'); assert.equal(f.redirects.length, 1);
});
test('stale verification cannot overwrite a newer sign-out', async () => {
  const f = fixture(); let resolve;
  f.auth.getUser = () => new Promise(done => { resolve = done; });
  const pending = f.controller.check(); f.emit('SIGNED_OUT'); resolve({ data: { user: { id: 'synthetic' } }, error: null }); await pending;
  assert.deepEqual(f.renders, [false]);
});
test('PKCE callback exchanges once and returns only a safe private redirect', async () => {
  let calls = 0;
  const response = await completeAuthCallback(`${origin}/auth/callback?code=synthetic&next=%2Fseller`, async code => { calls++; assert.equal(code, 'synthetic'); return { error: null }; });
  assert.equal(calls, 1); assert.equal(response.status, 303); assert.equal(response.headers.get('location'), '/seller');
  assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const unsafe = await completeAuthCallback(`${origin}/auth/callback?code=synthetic&next=%2F%5Cevil.invalid`, async () => ({ error: null }));
  assert.equal(unsafe.headers.get('location'), '/');
});
test('callback errors and missing codes never reflect provider data', async () => {
  let calls = 0;
  for (const query of ['', '?error=synthetic-private', '?code=synthetic&error=denied']) {
    const response = await completeAuthCallback(origin + '/auth/callback' + query, async () => { calls++; return { error: null }; });
    assert.equal(response.headers.get('location'), '/login?reason=callback-failed');
  }
  assert.equal(calls, 0);
  for (const exchange of [async () => ({ error: new Error('synthetic-private') }), async () => { throw new Error('synthetic-private'); }]) {
    const response = await completeAuthCallback(origin + '/auth/callback?code=synthetic', exchange);
    assert.equal(response.headers.get('location'), '/login?reason=callback-failed');
  }
});
test('public browsing does not redirect when signed out', async () => {
  const redirects = [];
  const auth = { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: null }, error: null }) };
  const controller = createSessionController({ auth, location: { origin, pathname: '/shop', search: '', replace: value => redirects.push(value) }, render() {} });
  await controller.check(); assert.deepEqual(redirects, []);
});
test('normalized double-slash paths cannot become external redirects', () => {
  for (const path of ['/a/..//evil.invalid', '/a/%2e%2e//evil.invalid', '/.//evil.invalid']) {
    assert.equal(safeNextPath(path, origin), '/');
    assert.equal(new URL(safeNextPath(path, origin), origin).origin, origin);
  }
});
test('email callback also rejects normalized double-slash redirect targets', async () => {
  const response = await completeAuthCallback(`${origin}/auth/callback?code=synthetic&next=${encodeURIComponent('/a/..//evil.invalid')}`, async () => ({ error: null }));
  assert.equal(response.headers.get('location'), '/');
});
test('production DNS names with trailing dots are rejected', () => {
  for (const host of ['vetit.online.', 'www.vetit.online.', 'vetit.online..']) assert.throws(() => resolveMobileApiBase(`https://${host}`, `https://${host}`));
});
test('Test-only endpoints have no release-mode production fallback', () => {
  assert.throws(() => resolveMobileApiBase(undefined, undefined));
  assert.throws(() => resolveMobileApiBase('https://vetit.online', 'https://vetit.online'));
});
test('disposed controller ignores pending results, callbacks and later checks', async () => {
  const f = fixture(); let finish; let calls = 0;
  f.auth.getUser = () => { calls++; return new Promise(resolve => { finish = resolve; }); };
  const pending = f.controller.check(); f.controller.dispose();
  finish({ data: { user: null }, error: null }); await pending;
  f.emit('SIGNED_OUT'); f.emit('SIGNED_IN'); await Promise.resolve(); await f.controller.check();
  assert.equal(calls, 1); assert.deepEqual(f.renders, []); assert.deepEqual(f.redirects, []);
});
test('logout invalidates in-flight verification and blocks checks while pending', async () => {
  const f = fixture(); let finishCheck, finishLogout; let checks = 0;
  f.auth.getUser = () => { checks++; return new Promise(resolve => { finishCheck = resolve; }); };
  f.auth.signOut = () => new Promise(resolve => { finishLogout = resolve; });
  const check = f.controller.check(); const logout = f.controller.logout();
  await f.controller.check();
  finishCheck({ data: { user: { id: 'synthetic' } }, error: null }); await check;
  assert.equal(checks, 1); assert.deepEqual(f.renders, []);
  finishLogout({ error: null }); await logout;
  assert.deepEqual(f.renders, [false]); assert.deepEqual(f.redirects, ['/login?reason=signed-out']);
});
test('disposed controller does not navigate after pending logout', async () => {
  const f = fixture(); let finish;
  f.auth.signOut = () => new Promise(resolve => { finish = resolve; });
  const pending = f.controller.logout(); f.controller.dispose(); finish({ error: null }); await pending;
  assert.deepEqual(f.renders, []); assert.deepEqual(f.redirects, []);
});
test('trailing-slash protected workspaces retain safe session-expiry behavior', async () => {
  const redirects = [];
  const auth = { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), getUser: async () => ({ data: { user: null }, error: null }) };
  for (const pathname of ['/appointments/', '/admin/login/']) {
    const controller = createSessionController({ auth, location: { origin, pathname, search: '', replace: value => redirects.push(value) }, render() {} });
    await controller.check(); controller.dispose();
  }
  assert.equal(redirects.length, 1); assert.equal(new URL(redirects[0], origin).searchParams.get('next'), '/appointments/');
});
