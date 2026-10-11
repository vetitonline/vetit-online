import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

export const VERIFIED_TEST_PROJECT_REF = 'apfyfmokcynqiaxqvvxx';
export const VERIFIED_TEST_PROJECT_NAME = 'Vetit Online Test';
export const TEST_RUN_PREFIX = 'vetit-test-';
const CLOUD_OPT_IN = 'I_UNDERSTAND_TEST_PROJECT_WRITES';
const LOCAL_OPT_IN = 'I_CONFIRM_LOCAL_DISPOSABLE_DATABASE';
const SERVICE_ROLE_KEY_NAME = 'SUPABASE_SERVICE_ROLE_KEY';
const manifestWriteQueues = new WeakMap();

export function resolveTestTarget(env = process.env) {
  let url;
  try { url = new URL(env.SUPABASE_URL); }
  catch { throw new Error('Seller integration requires a valid SUPABASE_URL.'); }

  const local = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (local) {
    if (url.protocol !== 'http:' || url.pathname !== '/' || url.search || url.hash || url.username || url.password
      || env.VETIT_LOCAL_DISPOSABLE_CONFIRM !== LOCAL_OPT_IN) {
      throw new Error('Local integration requires explicit disposable-database confirmation.');
    }
    return { url: url.toString().replace(/\/$/, ''), projectRef: null, mode: 'local-disposable' };
  }

  const ref = url.hostname.endsWith('.supabase.co') ? url.hostname.slice(0, -'.supabase.co'.length) : '';
  if (url.protocol !== 'https:' || url.port
    || url.pathname !== '/' || url.search || url.hash || url.username || url.password
    || ref !== VERIFIED_TEST_PROJECT_REF
    || env.VETIT_VERIFIED_TEST_PROJECT_REF !== VERIFIED_TEST_PROJECT_REF
    || env.VETIT_VERIFIED_TEST_PROJECT_NAME !== VERIFIED_TEST_PROJECT_NAME
    || env.VETIT_ALLOW_CLOUD_TEST_WRITES !== CLOUD_OPT_IN) {
    throw new Error('Cloud seller integration is restricted to the explicitly verified Vetit Online Test project.');
  }
  return { url: url.toString().replace(/\/$/, ''), projectRef: ref, mode: 'verified-cloud-test' };
}

export async function verifyTestTarget(env = process.env, fetchImpl = fetch) {
  const target = resolveTestTarget(env);
  if (target.mode === 'local-disposable') return { ...target, authenticated: false };
  const accessToken = env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) throw new Error('Cloud Test runs require a Supabase Management API access token in the process environment.');
  let response;
  try {
    response = await fetchImpl(`https://api.supabase.com/v1/projects/${target.projectRef}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    });
  } catch {
    throw new Error('Could not verify the Test project through the authenticated Supabase connection.');
  }
  if (!response.ok) throw new Error('The authenticated Supabase connection could not verify the Test project identity.');
  const project = await response.json();
  if (project.id !== VERIFIED_TEST_PROJECT_REF || project.name !== VERIFIED_TEST_PROJECT_NAME) {
    throw new Error('The authenticated Supabase project name/ref does not match Vetit Online Test.');
  }
  return { ...target, authenticated: true };
}

export function createRunManifest(target, runId = randomUUID()) {
  return {
    version: 1,
    runId,
    projectRef: target.projectRef || 'local-disposable',
    mode: target.mode,
    createdAt: new Date().toISOString(),
    status: 'provisioning',
    users: [],
    businesses: [],
    listings: [],
    imagePaths: [],
    taxonomyOwnership: [],
  };
}

export function manifestPath(runId, env = process.env) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error('Invalid seller test run ID.');
  }
  const root = env.VETIT_TEST_MANIFEST_DIR || path.join(os.tmpdir(), 'vetit-seller-test-runs');
  return path.join(root, `${runId}.json`);
}

export async function saveManifest(manifest, env = process.env) {
  const previous = manifestWriteQueues.get(manifest) || Promise.resolve();
  const current = previous.then(() => writeManifestAtomically(manifest, env));
  manifestWriteQueues.set(manifest, current.catch(() => {}));
  return current;
}

async function writeManifestAtomically(manifest, env) {
  const destination = manifestPath(manifest.runId, env);
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await chmod(temporary, 0o600); } catch { /* Windows ACLs provide the platform-specific protection. */ }
  await rename(temporary, destination);
  return destination;
}

export async function loadManifest(runId, env = process.env) {
  const contents = await readFile(manifestPath(runId, env), 'utf8');
  const manifest = JSON.parse(contents);
  if (manifest.runId !== runId || manifest.version !== 1
    || !Array.isArray(manifest.users) || !Array.isArray(manifest.businesses)
    || !Array.isArray(manifest.listings) || !Array.isArray(manifest.imagePaths)
    || !Array.isArray(manifest.taxonomyOwnership)) throw new Error('Seller test manifest identity is invalid.');
  return manifest;
}

export function fixtureEmail(runId, role) {
  if (!['seller-a', 'seller-b', 'buyer', 'admin'].includes(role)) throw new Error('Unsupported seller test identity role.');
  return `vetit-test-${runId}-${role}@example.invalid`;
}

export function assertRunOwnedPath(manifest, objectPath) {
  const prefixes = new Set(manifest.listings.map(({ businessId, listingId }) => `${businessId}/${listingId}/`));
  if (typeof objectPath !== 'string' || ![...prefixes].some(prefix => objectPath.startsWith(prefix))) {
    throw new Error('Refusing to clean a Storage path outside this run’s tracked listings.');
  }
  if (!/^[0-9a-f-]{36}\.(?:jpe?g|png|webp|avif)$/i.test(objectPath.split('/').at(-1) || '')) {
    throw new Error('Refusing to clean a non-canonical seller image path.');
  }
  return true;
}

export function createTestClients(env = process.env, verifiedTarget) {
  const target = resolveTestTarget(env);
  if (!verifiedTarget || verifiedTarget.projectRef !== target.projectRef || verifiedTarget.mode !== target.mode
    || (target.mode === 'verified-cloud-test' && verifiedTarget.authenticated !== true)) {
    throw new Error('Verify the exact Test/local-disposable target before creating integration clients.');
  }
  const anonKey = env.SUPABASE_ANON_KEY;
  const serviceKey = env[SERVICE_ROLE_KEY_NAME];
  if (!anonKey || !serviceKey) throw new Error('Seller integration requires Supabase anon and service-role credentials in the process environment.');
  return {
    target,
    anonymous: createClient(target.url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    admin: createClient(target.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

export async function beginRun(admin, manifest, env = process.env) {
  await saveManifest(manifest, env);
  const { error } = await admin.rpc('vetit_test_begin_run', {
    p_run_id: manifest.runId,
    p_project_ref: manifest.projectRef,
  });
  if (error) throw new Error(`Test cleanup support is not installed or run registration failed (${error.code || 'unknown'}).`);
  manifest.status = 'active';
  await saveManifest(manifest, env);
}

export async function ensureMarketplaceFixtures(admin, manifest, env = process.env) {
  const { data, error } = await admin.rpc('vetit_test_ensure_marketplace_fixtures', { p_run_id: manifest.runId });
  if (error || !data?.dogFoodCategoryId || !data?.dogSpeciesId) {
    throw new Error(`Test taxonomy fixtures are unavailable (${error?.code || 'unknown'}).`);
  }
  manifest.taxonomyOwnership = Array.isArray(data.created) ? data.created : [];
  await saveManifest(manifest, env);
  return { categoryId: data.dogFoodCategoryId, speciesId: data.dogSpeciesId };
}

export async function provisionIdentity(admin, anonymous, manifest, role, env = process.env) {
  const password = randomBytes(36).toString('base64url');
  const appMetadata = { vetit_test_run_id: manifest.runId, vetit_test_role: role };
  if (role === 'admin') appMetadata.vetit_admin = true;
  const { data, error } = await admin.auth.admin.createUser({
    email: fixtureEmail(manifest.runId, role),
    password,
    email_confirm: true,
    app_metadata: appMetadata,
  });
  if (error || !data.user) throw new Error(`Could not provision the ${role} Test identity (${error?.code || 'unknown'}).`);

  const record = { id: data.user.id, role };
  manifest.users.push(record);
  await saveManifest(manifest, env);
  const registered = await admin.rpc('vetit_test_register_user', {
    p_run_id: manifest.runId, p_user_id: record.id, p_role: role,
  });
  if (registered.error) throw new Error(`Could not register the ${role} Test identity (${registered.error.code || 'unknown'}).`);

  const signInClient = createClient(anonymous.supabaseUrl, anonymous.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await signInClient.auth.signInWithPassword({ email: fixtureEmail(manifest.runId, role), password });
  if (signedIn.error || !signedIn.data.session) throw new Error(`Could not obtain a short-lived ${role} Test session (${signedIn.error?.code || 'unknown'}).`);
  const client = createClient(anonymous.supabaseUrl, anonymous.supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${signedIn.data.session.access_token}` } },
  });
  client.vetitTestUserId = data.user.id;
  return client;
}

export async function recordBusiness(admin, manifest, businessId, role, env = process.env) {
  const entry = { id: businessId, role };
  if (!manifest.businesses.some(item => item.id === businessId)) manifest.businesses.push(entry);
  await saveManifest(manifest, env);
  const { error } = await admin.rpc('vetit_test_register_record', {
    p_run_id: manifest.runId, p_kind: 'business', p_entity_key: businessId, p_parent_key: null,
  });
  if (error) throw new Error(`Could not track a Test-created business (${error.code || 'unknown'}).`);
}

export async function recordListing(admin, manifest, listingId, businessId, env = process.env) {
  const entry = { listingId, businessId };
  if (!manifest.listings.some(item => item.listingId === listingId)) manifest.listings.push(entry);
  await saveManifest(manifest, env);
  const { error } = await admin.rpc('vetit_test_register_record', {
    p_run_id: manifest.runId, p_kind: 'listing', p_entity_key: listingId, p_parent_key: businessId,
  });
  if (error) throw new Error(`Could not track a Test-created listing (${error.code || 'unknown'}).`);
}

export async function recordImagePath(admin, manifest, imagePath, listingId, env = process.env) {
  assertRunOwnedPath(manifest, imagePath);
  if (!manifest.imagePaths.includes(imagePath)) manifest.imagePaths.push(imagePath);
  await saveManifest(manifest, env);
  const { error } = await admin.rpc('vetit_test_register_record', {
    p_run_id: manifest.runId, p_kind: 'storage_path', p_entity_key: imagePath, p_parent_key: listingId,
  });
  if (error) throw new Error(`Could not track a Test-created image path (${error.code || 'unknown'}).`);
}

export async function cleanupRun(admin, manifest, env = process.env) {
  if (manifest.status === 'cleaned') return;
  manifest.status = 'cleanup_pending';
  await saveManifest(manifest, env);

  const listed = await admin.rpc('vetit_test_cleanup_paths', { p_run_id: manifest.runId });
  if (listed.error) throw new Error(`Could not retrieve exact Test Storage cleanup paths (${listed.error.code || 'unknown'}).`);
  for (const item of listed.data || []) {
    if (!manifest.listings.some(row => row.listingId === item.listing_id)) {
      manifest.listings.push({ listingId: item.listing_id, businessId: item.business_id });
    }
    if (!manifest.imagePaths.includes(item.storage_object_path)) manifest.imagePaths.push(item.storage_object_path);
  }
  await saveManifest(manifest, env);
  const paths = new Set(manifest.imagePaths);
  for (const objectPath of paths) assertRunOwnedPath(manifest, objectPath);

  const bucket = admin.storage.from('listing-images');
  for (const objectPath of paths) {
    const directory = objectPath.slice(0, objectPath.lastIndexOf('/'));
    const filename = objectPath.slice(objectPath.lastIndexOf('/') + 1);
    const existing = await bucket.list(directory, { search: filename, limit: 100 });
    if (existing.error) throw new Error(`Could not inspect a run-owned Storage object (${existing.error.statusCode || 'unknown'}).`);
    if ((existing.data || []).some(item => item.name === filename)) {
      const removed = await bucket.remove([objectPath]);
      if (removed.error) throw new Error(`Could not remove a run-owned Storage object (${removed.error.statusCode || 'unknown'}).`);
    }
  }

  const dbCleanup = await admin.rpc('vetit_test_cleanup_run', { p_run_id: manifest.runId });
  if (dbCleanup.error) throw new Error(`Test database cleanup was blocked (${dbCleanup.error.code || 'unknown'}).`);

  const users = await listRunUsers(admin, manifest.runId);
  for (const user of users) {
    const deleted = await admin.auth.admin.deleteUser(user.id);
    if (deleted.error && deleted.error.code !== 'user_not_found') {
      throw new Error(`Could not remove a run-owned Test Auth user (${deleted.error.code || 'unknown'}).`);
    }
  }
  const finalized = await admin.rpc('vetit_test_finish_cleanup', { p_run_id: manifest.runId });
  if (finalized.error) throw new Error(`Could not finalize Test cleanup (${finalized.error.code || 'unknown'}).`);
  manifest.status = 'cleaned';
  await saveManifest(manifest, env);
}

async function listRunUsers(admin, runId) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Could not enumerate Test Auth fixtures for cleanup (${error.code || 'unknown'}).`);
    for (const user of data.users) {
      if (user.app_metadata?.vetit_test_run_id === runId
        && ['seller-a', 'seller-b', 'buyer', 'admin'].includes(user.app_metadata?.vetit_test_role)) users.push(user);
    }
    if (data.users.length < 1000) break;
  }
  return users;
}
