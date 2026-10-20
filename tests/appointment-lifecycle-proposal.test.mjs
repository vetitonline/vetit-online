import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { INITIAL_APPOINTMENT_POLICY } from '../src/lib/services/appointment-lifecycle.js';
const sql = await readFile(new URL('../supabase/test-project/appointment-lifecycle.proposal.sql',import.meta.url),'utf8');
const api = await readFile(new URL('../src/pages/api/appointments.ts',import.meta.url),'utf8');

test('lifecycle remains a separate transaction proposal without destructive data/schema operations',()=>{
  assert.match(sql,/^-- REVIEW PROPOSAL ONLY/); assert.equal((sql.match(/^commit;/gm)||[]).length,1);
  assert.doesNotMatch(sql,/\b(drop\s+(table|schema|policy|function)|truncate\s+|delete\s+from)\b/i);
  assert.match(sql,/alter function public\.book_my_appointment\(uuid,text\) set schema vetit_appointments/);
});
test('private lifecycle ledgers have RLS and no authenticated direct-write grants',()=>{
  for(const table of ['policies','waitlist','offers','events','notifications','notification_outbox','refund_requests']) assert.ok(sql.includes(`alter table vetit_appointments.${table} enable row level security;`));
  assert.match(sql,/revoke all on all tables in schema vetit_appointments from public, anon, authenticated/);
  assert.doesNotMatch(sql,/grant (insert|update|delete|all)\b/i);
  assert.match(sql,/member_role in \('owner','admin'\)/);
  assert.match(sql,/Only the customer may reschedule/);
});
test('allocation serializes on the provider lock and retains unique slot and live-offer protection',()=>{
  assert.match(sql,/from public\.businesses where id = v_business_id for update/);
  assert.match(sql,/create unique index offers_one_live_per_slot/);
  assert.match(sql,/create unique index offers_one_live_per_entry/);
  assert.match(sql,/Resource is already scheduled/);
  assert.match(sql,/unique\(service_listing_id,lifecycle_resource_key,starts_at\)/);
  assert.match(sql,/drop constraint %I/);
  assert.match(sql,/v_booking_id := vetit_appointments\.book_my_appointment/);
  assert.doesNotMatch(sql,/drop index.*bookings_one_per_appointment_slot/i);
});
test('cancellation releases the unique slot reference and records history without pretending money was refunded',()=>{
  assert.match(sql,/status = 'cancelled', appointment_slot_id = null/);
  assert.match(sql,/refund_requests[\s\S]*review_required/);
  assert.match(sql,/record_event\(b.id, 'cancelled'/);
  assert.match(sql,/offer_slot\(old_slot\)/);
  assert.doesNotMatch(sql,/update public\.payments/i);
});
test('rescheduling preserves the booking and payment links while allocating the replacement and offering the old slot transactionally',()=>{
  assert.match(sql,/s\.service_listing_id <> b\.service_listing_id or s\.status <> 'available'/);
  assert.match(sql,/update public\.bookings set appointment_slot_id = s.id, requested_start = s.starts_at/);
  assert.match(sql,/record_event\(b.id, 'rescheduled'/);
  assert.match(sql,/offer_slot\(v_old_slot\)/);
  assert.match(sql,/b.lifecycle_revision <> \(p_command->>'expectedRevision'\)::integer/);
  assert.match(sql,/so.provider_location_id is not distinct from b.provider_location_id/);
});
test('waiting-list offers use deterministic FIFO, hold the slot, enforce expiry and snapshot terms and price',()=>{
  assert.match(sql,/order by candidate.created_at, candidate.id limit 1 for update of candidate/);
  assert.match(sql,/least\(s.starts_at, now\(\) \+/);
  assert.match(sql,/status = 'held', hold_expires_at = expiry/);
  assert.match(sql,/o.status <> 'offered' or o.expires_at <= now\(\)/);
  assert.match(sql,/policy := o.policy_snapshot/);
  assert.match(sql,/b.price_minor <> o.price_minor/);
  assert.match(sql,/grant execute on function public.appointment_lifecycle_tick\(\) to service_role/);
  assert.doesNotMatch(sql,/cron\.schedule/);
});
test('approved defaults and disabled notification outbox are explicit and cannot be run by customers',()=>{
  assert.match(sql,/"noticeMinutes":1440/); assert.match(sql,/"offerExpiryMinutes":15/);
  assert.match(sql,/"refundBasisPoints":10000/); assert.match(sql,/"allowLateCancellation":false/);
  assert.match(sql,/status text not null default 'disabled'/);
  assert.match(sql,/unique \(notification_id, channel\)/);
});
test('existing-service seeds and new-service initialization use the same approved default policy as shared web/mobile logic',()=>{
  const seeds = [...sql.matchAll(/'(\{"allowCustomerCancellation"[^']+\})'::jsonb/g)].map(match=>JSON.parse(match[1]));
  assert.equal(seeds.length,2); seeds.forEach(policy=>assert.deepEqual(policy,INITIAL_APPOINTMENT_POLICY));
  assert.match(sql,/Late cancellation charge must be permitted and disclosed/);
  assert.match(sql,/charge_status text not null default 'not_collected'/);
});
test('HTTP mutations retain authentication, origin checks, bounded bodies and uncached responses',()=>{
  assert.match(api,/if \(!isSameOriginMutation\(request\)\)/); assert.match(api,/authenticateApiRequest/);
  assert.match(api,/readJsonBody\(request, 8192\)/); assert.match(api,/'Cache-Control': 'no-store'/);
  assert.doesNotMatch(api,/service_role|SUPABASE_SERVICE_ROLE/);
});

test('provider cancellation intent requires manager authorisation even for an owned booking',async()=>{
  assert.match(sql,/jsonb_typeof\(p_command->'providerCancellation'\) <> 'boolean'/);
  assert.match(sql,/v_provider_cancellation := b.customer_profile_id <> actor or coalesce/);
  assert.match(sql,/if v_provider_cancellation then perform vetit_appointments.assert_manager\(v_business_id\)/);
  assert.match(sql,/cancel_booking\(v_booking_id, v_provider_cancellation\)/);
  const page=await readFile(new URL('../src/pages/appointments.astro',import.meta.url),'utf8');
  assert.match(page,/'Cancel as provider',[^\n]+providerCancellation:true/);
});
test('database regression fixtures isolate expiry queues and cover cross-service resource conflicts',async()=>{
  const suite=await readFile(new URL('./appointment-lifecycle.postgres.test.mjs',import.meta.url),'utf8');
  const expiry=suite.slice(suite.indexOf("await t.test('expiry worker"),suite.indexOf("await t.test('provider/customer"));
  assert.match(expiry,/slot\('expiry_place',expiryService\)/);
  assert.equal((expiry.match(/action:'joinWaitlist',serviceListingId:expiryService/g)||[]).length,2);
  assert.doesNotMatch(expiry,/action:'joinWaitlist',serviceListingId:service\b/);
  assert.match(suite,/action:'reopenSlot',slotId:existing.id/);
  assert.match(sql,/x.lifecycle_resource_key = resource and x.status <> 'cancelled'/);
  assert.match(sql,/x.lifecycle_resource_key = s.lifecycle_resource_key and x.status <> 'cancelled'/);
});
