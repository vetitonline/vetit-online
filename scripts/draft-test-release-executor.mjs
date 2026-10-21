// Offline review draft: reads files only; does not connect or execute SQL.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export function draftTestExecution(manifest, readPayload) {
  if (manifest.targetProject !== 'apfyfmokcynqiaxqvvxx' || manifest.entries?.length !== 14 ||
      manifest.foundationPreserve?.length !== 4 || manifest.linked !== false) {
    throw new Error('Expected the frozen fourteen-step, unlinked Test package.');
  }
  const foundation = new Set(manifest.foundationPreserve.map(x => x.version));
  let previous = '';
  const steps = manifest.entries.map((entry, index) => {
    if (entry.order !== index + 1 || !/^\d{14}$/.test(entry.version) ||
        entry.version <= previous || foundation.has(entry.version) ||
        !/^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/.test(entry.migrationPath) ||
        !path.basename(entry.migrationPath).startsWith(entry.version + '_')) {
      throw new Error('Invalid version, order, foundation replay or payload path.');
    }
    const bytes = readPayload(entry.migrationPath);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== entry.payloadSha256?.toLowerCase() || hash !== entry.sourceSha256?.toLowerCase()) {
      throw new Error('Frozen payload/source hash mismatch.');
    }
    const sql = bytes.toString('utf8');
    if ((sql.match(/^\s*begin;\s*$/gim) ?? []).length !== 1 ||
        (sql.match(/^\s*commit;\s*$/gim) ?? []).length !== 1) {
      throw new Error('Unexpected transaction wrappers; manual review required.');
    }
    previous = entry.version;
    return { order: entry.order, version: entry.version, migrationPath: entry.migrationPath,
      sha256: hash, transaction: 'existing explicit BEGIN/COMMIT; not transformed',
      ledger: 'UNRESOLVED: require reviewed atomic schema-plus-ledger recording',
      onFailure: 'Stop. Preserve committed earlier steps; recheck ledger and hashes before any resume.' };
  });
  return { format: 1, targetProject: manifest.targetProject, executionEnabled: false,
    networkOrDatabaseAccess: false, wholeReleaseAtomic: false,
    gates: ['Verified recent Test backup, retention, recovery target and restore procedure',
      'Fresh exact project/ledger and aggregate prerequisite snapshot immediately before application',
      'Explicit approval of immutable payloads, role, executor, timeouts and partial-failure/resume plan',
      'Resolve transaction-wrapper and atomic migration-ledger recording compatibility',
      'Review residual service-role privileges and effective GRANT/RLS boundaries'],
    proposedLockTimeout: '5s; review only, never applied by this script',
    proposedStatementTimeout: '120s per step; review only, revise from measured DDL cost',
    strategy: 'Choose an approved wrapper-aware executor or separately hash/review normalized payloads. Do not wrap all files in a purported single transaction.',
    steps };
}

const ownFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === ownFile) {
  if (process.argv.length !== 3 || process.argv[2].startsWith('--')) {
    throw new Error('Review only. Usage: node scripts/draft-test-release-executor.mjs <release-directory>. Execution is unsupported.');
  }
  const root = path.resolve(process.argv[2]);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-manifest.json'), 'utf8'));
  console.log(JSON.stringify(draftTestExecution(manifest, relative => fs.readFileSync(path.join(root, relative))), null, 2));
}
