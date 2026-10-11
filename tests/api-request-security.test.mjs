import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOriginFormMutation, isSameOriginMutation } from '../src/lib/api/request-security.js';

const endpoint = 'https://vetit.online/api/change';
const jwt = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature_part';

test('cookie mutations require an exact same-origin Origin and reject cross-site fetch metadata', () => {
  assert.equal(isSameOriginMutation(new Request(endpoint, { method: 'POST', headers: { origin: 'https://vetit.online' } })), true);
  assert.equal(isSameOriginMutation(new Request(endpoint, { method: 'POST', headers: { origin: 'https://evil.example' } })), false);
  assert.equal(isSameOriginMutation(new Request(endpoint, { method: 'POST' })), false);
  assert.equal(isSameOriginMutation(new Request(endpoint, { method: 'POST', headers: { origin: 'https://vetit.online', 'sec-fetch-site': 'cross-site' } })), false);
});

test('native bearer requests work without Origin but cookie-backed seller forms never bypass Origin checks', () => {
  const nativeRequest = new Request(endpoint, { method: 'POST', headers: { authorization: jwt } });
  assert.equal(isSameOriginMutation(nativeRequest), true);
  assert.equal(isSameOriginFormMutation(nativeRequest), false);
  assert.equal(isSameOriginMutation(new Request(endpoint, { method: 'POST', headers: { authorization: 'Bearer malformed' } })), false);
});
