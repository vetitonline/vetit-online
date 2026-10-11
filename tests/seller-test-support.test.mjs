import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  VERIFIED_TEST_PROJECT_NAME, VERIFIED_TEST_PROJECT_REF, assertRunOwnedPath,
  createRunManifest, fixtureEmail, resolveTestTarget, saveManifest, verifyTestTarget,
} from './seller-test-support.mjs';

const cloudEnv = overrides => ({
  SUPABASE_URL: `https://${VERIFIED_TEST_PROJECT_REF}.supabase.co`,
  VETIT_VERIFIED_TEST_PROJECT_REF: VERIFIED_TEST_PROJECT_REF,
  VETIT_VERIFIED_TEST_PROJECT_NAME: VERIFIED_TEST_PROJECT_NAME,
  VETIT_ALLOW_CLOUD_TEST_WRITES: 'I_UNDERSTAND_TEST_PROJECT_WRITES',
  ...overrides,
});

test('cloud target fails closed unless exact verified Test identity and explicit write opt-in match', () => {
  assert.equal(resolveTestTarget(cloudEnv({})).projectRef, VERIFIED_TEST_PROJECT_REF);
  assert.throws(() => resolveTestTarget(cloudEnv({ SUPABASE_URL: 'https://example.com' })), /restricted/);
  assert.throws(() => resolveTestTarget(cloudEnv({ VETIT_VERIFIED_TEST_PROJECT_NAME: 'Vetitonline' })), /restricted/);
  assert.throws(() => resolveTestTarget(cloudEnv({ VETIT_VERIFIED_TEST_PROJECT_REF: 'aaqnglzqcfdytythqzju' })), /restricted/);
  assert.throws(() => resolveTestTarget(cloudEnv({ VETIT_ALLOW_CLOUD_TEST_WRITES: '' })), /restricted/);
});

test('local target requires explicit disposable database confirmation', () => {
  assert.throws(() => resolveTestTarget({ SUPABASE_URL: 'http://127.0.0.1:54321' }), /disposable/);
  const target = resolveTestTarget({
    SUPABASE_URL: 'http://127.0.0.1:54321',
    VETIT_LOCAL_DISPOSABLE_CONFIRM: 'I_CONFIRM_LOCAL_DISPOSABLE_DATABASE',
  });
  assert.equal(target.mode, 'local-disposable');
  assert.equal(target.projectRef, null);
});

test('cloud identity is verified through an authenticated project-scoped Management API read', async () => {
  const env = cloudEnv({ SUPABASE_ACCESS_TOKEN: 'never-log-this-token' });
  let requestedUrl;
  let sentAuthorization;
  const verified = await verifyTestTarget(env, async (url, options) => {
    requestedUrl = url;
    sentAuthorization = options.headers.Authorization;
    return { ok: true, json: async () => ({ id: VERIFIED_TEST_PROJECT_REF, name: VERIFIED_TEST_PROJECT_NAME }) };
  });
  assert.equal(requestedUrl, `https://api.supabase.com/v1/projects/${VERIFIED_TEST_PROJECT_REF}`);
  assert.equal(sentAuthorization, `Bearer ${env.SUPABASE_ACCESS_TOKEN}`);
  assert.equal(verified.authenticated, true);
  await assert.rejects(verifyTestTarget(cloudEnv({ SUPABASE_ACCESS_TOKEN: 'x' }), async () => ({
    ok: true, json: async () => ({ id: VERIFIED_TEST_PROJECT_REF, name: 'Vetitonline' }),
  })), /does not match/);
  await assert.rejects(verifyTestTarget(cloudEnv({}), async () => { throw new Error('should not be called'); }), /access token/);
});

test('run manifest persists IDs only, uses a private temp file, and never stores credentials', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vetit-test-support-'));
  try {
    const manifest = createRunManifest({ projectRef: VERIFIED_TEST_PROJECT_REF, mode: 'verified-cloud-test' });
    manifest.users.push({ id: 'd2b398e1-df43-4e97-bc96-5c863c1e3b0d', role: 'seller-a' });
    manifest.listings.push({ businessId: 'b2b398e1-df43-4e97-bc96-5c863c1e3b0d', listingId: 'a2b398e1-df43-4e97-bc96-5c863c1e3b0d' });
    const filename = await saveManifest(manifest, { VETIT_TEST_MANIFEST_DIR: directory });
    const contents = await readFile(filename, 'utf8');
    assert.match(contents, /seller-a/);
    assert.doesNotMatch(contents, /SUPABASE_SERVICE_ROLE_KEY|access_token|password|eyJ/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fixture accounts are run-scoped and cleanup paths require a tracked listing', () => {
  const manifest = createRunManifest({ projectRef: VERIFIED_TEST_PROJECT_REF, mode: 'verified-cloud-test' }, '23b398e1-df43-4e97-bc96-5c863c1e3b0d');
  assert.match(fixtureEmail(manifest.runId, 'buyer'), new RegExp(manifest.runId));
  assert.throws(() => fixtureEmail(manifest.runId, 'provider'));
  manifest.listings.push({ businessId: 'b2b398e1-df43-4e97-bc96-5c863c1e3b0d', listingId: 'a2b398e1-df43-4e97-bc96-5c863c1e3b0d' });
  assert.equal(assertRunOwnedPath(manifest, 'b2b398e1-df43-4e97-bc96-5c863c1e3b0d/a2b398e1-df43-4e97-bc96-5c863c1e3b0d/12345678-1234-4234-8234-123456789abc.webp'), true);
  assert.throws(() => assertRunOwnedPath(manifest, 'other-business/a2b398e1-df43-4e97-bc96-5c863c1e3b0d/12345678-1234-4234-8234-123456789abc.webp'), /outside this run/);
  assert.throws(() => assertRunOwnedPath(manifest, 'b2b398e1-df43-4e97-bc96-5c863c1e3b0d/a2b398e1-df43-4e97-bc96-5c863c1e3b0d/../../secret.webp'), /canonical/);
});

test('cleanup SQL stays a separate proposal and keeps privileged RPCs unavailable to app roles', async () => {
  const sql = await readFile(new URL('../supabase/test-project/seller-integration-cleanup-proposal.sql', import.meta.url), 'utf8');
  assert.match(sql, /^-- UNAPPLIED TEST-ONLY PROPOSAL/m);
  assert.match(sql, /apfyfmokcynqiaxqvvxx/);
  assert.match(sql, /revoke all on function public\.vetit_test_cleanup_run\(uuid\) from public,anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.vetit_test_cleanup_run\(uuid\) to service_role/i);
  assert.match(sql, /disable trigger guard_seller_listing_images/i);
  assert.match(sql, /enable trigger guard_seller_listing_images/i);
  assert.doesNotMatch(sql, /\b(drop\s+table|truncate)\b/i);
});
