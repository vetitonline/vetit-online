import test from 'node:test';
import assert from 'node:assert/strict';
import {publicTestSettings,publicKeyReadiness,assessTestReadiness} from '../src/lib/supabase/local-test-readiness.js';
import {executionBody,guardedCorrection,sha256} from '../scripts/prepare-test-release.mjs';
import {normalizeServiceSearch} from '../src/lib/services/service-search.js';
import {sendAppointmentCommand} from '../src/lib/services/appointment-lifecycle-client.js';
import {readFileSync} from 'node:fs';
const id='10000000-0000-4000-8000-000000000001';
test('configuration parsing keeps only approved public fields and handles quotes/comments',()=>{
  const values=publicTestSettings('PASSWORD=SYNTHETIC_PRIVATE\nexport PUBLIC_SUPABASE_URL="https://apfyfmokcynqiaxqvvxx.supabase.co"\nEXPO_PUBLIC_VETIT_TEST_API_ORIGIN=http://localhost:4321 # local\nOTHER_SECRET=hidden');
  assert.deepEqual(Object.keys(values),['PUBLIC_SUPABASE_URL','EXPO_PUBLIC_VETIT_TEST_API_ORIGIN']);assert.equal(JSON.stringify(values).includes('SYNTHETIC_PRIVATE'),false);assert.equal(values.EXPO_PUBLIC_VETIT_TEST_API_ORIGIN,'http://localhost:4321');
});
const jwt=payload=>'synthetic.'+btoa(JSON.stringify(payload)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')+'.synthetic';
test('readiness identifies missing, forbidden, wrong-project and syntactically public keys without verifying signatures',()=>{
  assert.equal(publicKeyReadiness(''),'missing');assert.equal(publicKeyReadiness('sb_secret_synthetic'),'forbidden-secret');assert.equal(publicKeyReadiness(jwt({role:'service_role'})),'forbidden-secret');
  assert.equal(publicKeyReadiness(jwt({role:'anon',ref:'other'})),'wrong-project-or-role');assert.equal(publicKeyReadiness(jwt({role:'anon',ref:'apfyfmokcynqiaxqvvxx'})),'test-anon-format-signature-unverified');assert.equal(publicKeyReadiness('sb_publishable_synthetic_local_test_only'),'public-format-project-unverified');
});
test('configuration readiness never claims runtime verification or accepts production origins',()=>{
  const web={PUBLIC_SUPABASE_URL:'https://apfyfmokcynqiaxqvvxx.supabase.co',PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic_local_test_only'};
  const mobile={EXPO_PUBLIC_VETIT_API_BASE_URL:'http://localhost:4321',EXPO_PUBLIC_VETIT_TEST_API_ORIGIN:'http://localhost:4321'};
  assert.equal(assessTestReadiness(web,mobile).configurationReady,true);assert.equal(assessTestReadiness(web,mobile).runtimeVerified,false);
  assert.equal(assessTestReadiness({},{}).configurationReady,false);assert.equal(assessTestReadiness(web,{EXPO_PUBLIC_VETIT_API_BASE_URL:'https://vetit.online',EXPO_PUBLIC_VETIT_TEST_API_ORIGIN:'https://vetit.online'}).configurationReady,false);
});
const source='-- synthetic\nbegin;\nselect 1;\ncommit;\n';
const entry={releaseVersion:'20261018115337',releaseName:'vetit_seller_variant_key_count',sha256:sha256(source)};
const foundation=[{version:'20261008223605',name:'baseline'}];
test('guarded correction checks approval, locks ledger, checks hashes and records only new history atomically',()=>{
  const {sql,bodyHash}=guardedCorrection(entry,source,foundation,[],[entry]);
  assert.equal(bodyHash,sha256(executionBody(source)));assert.ok(sql.indexOf('lock table')<sql.indexOf('execute payload;'));assert.ok(sql.indexOf('Payload checksum mismatch')<sql.indexOf('execute payload;'));
  assert.match(sql,/Already applied and checksum matched/);assert.match(sql,/Applied migration differs/);assert.match(sql,/insert into supabase_migrations.schema_migrations/);assert.match(sql,/vetit.approved_test_release/);assert.match(sql,/Unknown migration history/);
  assert.doesNotMatch(sql,/(?:update|delete from|truncate) supabase_migrations/i);assert.match(sql,/commit;\n$/);
});
test('guarded correction retains exact SQL body and requires ordered predecessors',()=>{
  const later={...entry,releaseVersion:'20261018115339',releaseName:'vetit_booking_participant_rls'};
  const first=guardedCorrection(entry,source,foundation,[],[entry,later]);
  const second=guardedCorrection(later,source,foundation,[{...entry,bodyHash:first.bodyHash}],[entry,later]);
  assert.ok(second.sql.includes(first.bodyHash));assert.ok(second.sql.includes(executionBody(source)));assert.match(first.sql,/Migration history has a gap/);
});
test('changed sources, missing transactions and extra outer transactions are rejected before preparation',()=>{
  assert.throws(()=>guardedCorrection(entry,source+'-- changed',foundation,[],[entry]));
  for(const invalid of ['select 1;','begin;\nselect 1;','begin;\nbegin;\ncommit;'])assert.throws(()=>executionBody(invalid));
});
test('supplemental resubmission proposal retains all guard behavior except the narrow review-clear transition',()=>{
  const base=readFileSync(new URL('../supabase/migrations/20261008210707_vetit_seller_security_hardening.sql',import.meta.url),'utf8').replaceAll('\r\n','\n');
  const supplement=readFileSync(new URL('../supabase/test-project/release-corrections/seller-rejected-resubmission.proposal.sql',import.meta.url),'utf8');
  const begin=base.indexOf('create or replace function public.guard_seller_catalog_mutations()');
  const ending='revoke all on function public.guard_seller_catalog_mutations() from public, anon, authenticated;';
  const original=base.slice(begin,base.indexOf(ending,begin)+ending.length);
  const proposal=supplement.slice(supplement.indexOf('create or replace function'),supplement.indexOf(ending)+ending.length);
  const added=`        -- Only the scoped, authorized resubmission transition may clear old review metadata.\n        if seller_action = 'submit' and old.moderation_status in ('draft', 'rejected')\n           and new.moderation_status = 'submitted'\n           and new.moderated_by is null and new.moderated_at is null then\n          null;\n        elsif not is_vetit_admin or seller_action <> 'moderation' then`;
  assert.equal(proposal.replace(added,"        if not is_vetit_admin or seller_action <> 'moderation' then"),original);
  assert.match(proposal,/new\.listing_id is distinct from old\.listing_id/);assert.match(proposal,/Products in review or published cannot be edited/);
});
test('location search rejects embedded controls before whitespace normalization',()=>{
  for(const city of ['Pu\nne','Pu\tne','Pune\r'])assert.throws(()=>normalizeServiceSearch({city}));
  assert.equal(normalizeServiceSearch({city:'  New   Delhi  '}).city,'New Delhi');
});
test('cancel, reschedule and waitlist transports are uncached and preserve revision checks',async()=>{
  for(const input of [{action:'cancel',bookingId:id,expectedRevision:2},{action:'reschedule',bookingId:id,slotId:id,expectedRevision:2},{action:'joinWaitlist',serviceListingId:id,startsAt:'2026-12-01T10:00:00Z',endsAt:'2026-12-02T10:00:00Z'}]){
    let sent;
    await sendAppointmentCommand(input,{baseUrl:'http://localhost:4321',fetchImpl:async(_url,options)=>{sent=options;return new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{status:'synthetic'}}));}});
    assert.equal(sent.cache,'no-store');assert.equal(sent.credentials,'same-origin');assert.equal(JSON.parse(sent.body).action,input.action);if(input.expectedRevision)assert.equal(JSON.parse(sent.body).expectedRevision,input.expectedRevision);
  }
});
