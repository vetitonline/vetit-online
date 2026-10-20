import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');
const record=JSON.parse(read('supabase/test-project/release-corrections/resubmission-release.json'));
const migration=read(record.migrationPath);
const definition=source=>source.slice(source.indexOf('create or replace function public.guard_seller_catalog_mutations()'),source.indexOf('revoke all on function public.guard_seller_catalog_mutations() from public, anon, authenticated;')+'revoke all on function public.guard_seller_catalog_mutations() from public, anon, authenticated;'.length).replaceAll('\r\n','\n');
test('CLI-versioned supplemental migration is Test-only, unapproved and checksum-bound',()=>{
  assert.equal(record.target,'apfyfmokcynqiaxqvvxx');assert.equal(record.releaseOrder,7);assert.match(record.version,/^\d{14}$/);assert.ok(record.version>record.afterVersion);assert.equal(record.hostedApproved,false);assert.equal(record.hostedApplied,false);
  assert.ok(record.migrationPath.startsWith('supabase/test-project/migrations/'));assert.equal(hash(migration),record.sha256);assert.equal(hash(read(record.proposalPath)),record.proposalSha256);
});
test('versioned function exactly matches the locally validated proposal',()=>{
  assert.equal(definition(migration),definition(read(record.proposalPath)));
  assert.match(migration,/create or replace function/);assert.match(migration,/security definer\s+set search_path = ''/);assert.match(migration,/revoke all on function public\.guard_seller_catalog_mutations\(\) from public, anon, authenticated/);
});
test('all original guards remain unchanged except the scoped resubmission metadata branch',()=>{
  const original=definition(read('supabase/migrations/20261008210707_vetit_seller_security_hardening.sql'));
  const addition="        -- Only the scoped, authorized resubmission transition may clear old review metadata.\n        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected')\n           and new.moderation_status = 'submitted'\n           and new.moderated_by is null and new.moderated_at is null then\n          null;\n        elsif not is_vetit_admin or seller_action <> 'moderation' then";
  assert.equal(definition(migration).replace(addition,"        if not is_vetit_admin or seller_action <> 'moderation' then"),original);
  assert.doesNotMatch(migration,/\b(?:create|alter|drop)\s+policy\b|\bgrant\s+|\b(?:insert\s+into|delete\s+from|truncate\s+|create\s+table|alter\s+table)\b/i);
});
test('acceptance source is bounded, loopback-only and rollback-only',()=>{
  const source=read('tests/seller-review-acceptance.sql');
  assert.match(source,/vetit_disposable_corrections_20261018_1302/);assert.match(source,/127\.0\.0\.1/);assert.match(source,/inet_server_port\(\)<>55432/);assert.match(source,/set local role authenticated/);assert.match(source,/rollback;\s*$/);
  assert.doesNotMatch(source,/\bcommit\s*;|\bdrop\s+database|\btruncate\b|PGPASSWORD|sb_secret_/i);
  for(const state of ['draft','submitted','rejected','published'])assert.ok(source.includes("'"+state+"'"));
});
test('the original four foundation and six correction payloads retain their hashes',()=>{
  const original=JSON.parse(read('supabase/test-project/release-corrections/source-manifest.json'));
  assert.equal(original.foundation.length,4);assert.equal(original.additive.length,6);
  for(const row of [...original.foundation,...original.additive])assert.equal(hash(fs.readFileSync(new URL(row.path,root))),row.sha256,row.path);
});
