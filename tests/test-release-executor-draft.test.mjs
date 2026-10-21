import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { draftTestExecution } from '../scripts/draft-test-release-executor.mjs';

const root = new URL('../supabase/test-project/releases/vetit-test-20261021-r1/', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('release-manifest.json', root), 'utf8'));
const read = relative => fs.readFileSync(new URL(relative, root));

test('real frozen release produces a disabled offline plan with explicit partial-commit and ledger gates', () => {
  const plan = draftTestExecution(manifest, read);
  assert.equal(plan.steps.length, 14);
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.networkOrDatabaseAccess, false);
  assert.equal(plan.wholeReleaseAtomic, false);
  assert.ok(plan.steps.every(step => step.ledger.startsWith('UNRESOLVED:')));
  assert.ok(plan.gates.some(gate => gate.includes('backup')));
});

test('wrong target, missing steps, foundation replay, duplicate versions and path traversal fail closed', () => {
  for (const mutate of [m => { m.targetProject = 'wrong'; }, m => m.entries.pop(),
    m => { m.entries[0].version = m.foundationPreserve[0].version; },
    m => { m.entries[1].version = m.entries[0].version; },
    m => { m.entries[0].migrationPath = '../../secret'; }]) {
    const m = structuredClone(manifest); mutate(m);
    assert.throws(() => draftTestExecution(m, read));
  }
});

test('payload corruption is rejected before producing a plan', () => {
  assert.throws(() => draftTestExecution(manifest, () => Buffer.from('altered payload')), /hash mismatch/);
});
