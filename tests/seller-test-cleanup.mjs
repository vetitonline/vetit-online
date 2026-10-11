import { cleanupRun, createTestClients, loadManifest, verifyTestTarget } from './seller-test-support.mjs';

const runId = process.env.VETIT_TEST_RUN_ID;
if (!runId) throw new Error('Set VETIT_TEST_RUN_ID to the exact run ID shown in the local manifest.');

const target = await verifyTestTarget(process.env);
const clients = createTestClients(process.env, target);
const manifest = await loadManifest(runId, process.env);
if (manifest.projectRef !== (clients.target.projectRef || 'local-disposable')
  || manifest.mode !== clients.target.mode) {
  throw new Error('Manifest target does not match the verified current Test/local-disposable target.');
}
await cleanupRun(clients.admin, manifest, process.env);
