/** Opt-in REAL two-session PostgreSQL tests. NOT run in the current task.
 * Requires an explicitly approved, empty local database named vetit_disposable_*.
 * Creates test schema only there; no remote/Supabase host or automatic cleanup.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { executePostgresSql } from './appointment-postgres-runner.mjs';
import { testAppointmentOperations } from './appointment-operations.postgres.mjs';
const enabled = process.env.VETIT_APPOINTMENT_DB_TESTS === '1';
const fullMarketplace = process.env.VETIT_APPOINTMENT_FULL_MARKETPLACE_TESTS === '1';
const owner = '10000000-0000-4000-8000-000000000001', alice = '10000000-0000-4000-8000-000000000002', bob = '10000000-0000-4000-8000-000000000003', charlie = '10000000-0000-4000-8000-000000000004', manager = '10000000-0000-4000-8000-000000000005';
const business = '20000000-0000-4000-8000-000000000001', category = '30000000-0000-4000-8000-000000000001', service = '40000000-0000-4000-8000-000000000001';
let connection;
function target() {
  if (!enabled) throw new Error('Database tests are disabled.');
  const url = new URL(process.env.VETIT_APPOINTMENT_TEST_DATABASE_URL || '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)
    || !/^\/vetit_disposable_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash || url.password) throw new Error('Only a named, empty, local disposable database without embedded credentials is permitted.');
  return url.toString();
}
async function sql(source) {
  return executePostgresSql(source, { connection, executable: process.env.VETIT_TEST_PSQL || 'psql' });
}
async function command(actor,input) {
  const body = JSON.stringify(input).replaceAll("'","''");
  const result = await sql(`set role authenticated; set request.jwt.claim.sub = '${actor}'; select public.appointment_lifecycle_command('${body}'::jsonb);`);
  return JSON.parse(result);
}
const fixtures = `
  insert into auth.users(id) values ('${owner}'),('${alice}'),('${bob}'),('${charlie}'),('${manager}');
  insert into public.businesses(id,display_name,verification_status) values ('${business}','Disposable clinic','verified');
  insert into public.business_memberships(business_id,profile_id,member_role) values ('${business}','${owner}','owner'),('${business}','${manager}','catalog_manager');
  insert into public.categories(id,name,slug,kind) values ('${category}','Disposable appointments','disposable-appointments','service');
  insert into public.markets(country_code,currency_code,market_status) values ('IN','INR','active');
  insert into public.listings(id,business_id,category_id,kind,title,slug,moderation_status) values ('${service}','${business}','${category}','service','Disposable consultation','disposable-consultation','published');
  insert into public.service_offerings(listing_id,appointment_required,duration_minutes) values ('${service}',true,30);
  insert into public.listing_markets(listing_id,market_code,availability_status,compliance_status) values ('${service}','IN','available','approved');
  insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor) values ('${service}','IN','INR',25000);
`;
const expiryService='40000000-0000-4000-8000-000000000002';
const expiryFixtures=`
  insert into public.listings(id,business_id,category_id,kind,title,slug,moderation_status) values ('${expiryService}','${business}','${category}','service','Expiry fixture','expiry-fixture','published');
  insert into public.service_offerings(listing_id,appointment_required,duration_minutes) values ('${expiryService}',true,30);
  insert into public.listing_markets(listing_id,market_code,availability_status,compliance_status) values ('${expiryService}','IN','available','approved');
  insert into public.listing_prices(listing_id,market_code,currency_code,amount_minor) values ('${expiryService}','IN','INR',25000);
`;
test('appointment lifecycle: isolated PostgreSQL transactions, FIFO, security and payment review', { skip: !enabled }, async t => {
  connection = target();
  // Do not create roles outside this database or overwrite an existing schema.
  assert.equal(await sql("select count(*) from pg_roles where rolname in ('anon','authenticated','service_role');"),'3','Dedicated test cluster must already have API roles.');
  assert.equal(await sql("select count(*) from information_schema.tables where table_schema in ('public','auth','vetit_appointments');"),'0','Refusing a nonempty database.');
  await sql(`create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb default '{}', phone text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid(),auth.jwt() to anon,authenticated,service_role;`);
  if (fullMarketplace) {
    // Minimal local SQL compatibility shim; this does not emulate Storage delivery.
    await sql(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid);
      alter table storage.objects enable row level security;
      create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
      grant usage on schema storage to anon,authenticated,service_role;
      grant select,insert,update,delete on storage.objects to authenticated; grant select on storage.objects to anon;`);
  }
  const files = fullMarketplace ? [
    'test-project/20261009000000_vetit_marketplace_baseline.sql',
    'migrations/20261008092024_vetit_seller_backend_foundation.sql',
    'migrations/20261008210707_vetit_seller_security_hardening.sql',
    'test-project/20261009010000_business_private_fields.sql',
    'test-project/20261009100000_vetit_buyer_cart_inventory_fulfilment.sql',
    'test-project/20261009110000_vetit_service_booking_transaction.sql',
    'test-project/appointment-lifecycle.proposal.sql',
  ] : ['test-project/20261009000000_vetit_marketplace_baseline.sql','test-project/20261009110000_vetit_service_booking_transaction.sql','test-project/appointment-lifecycle.proposal.sql'];
  for (const file of files) {
    const source=await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8');
    if(fullMarketplace && file.endsWith('appointment-lifecycle.proposal.sql')) {
      // Fail safely before accepting ambiguous legacy capacity; all DDL rolls back.
      await assert.rejects(()=>sql(`begin;
        insert into public.appointment_slots(service_listing_id,starts_at,ends_at) values
        ('${service}',now()+interval '50 days',now()+interval '50 days 30 minutes'),
        ('${expiryService}',now()+interval '50 days',now()+interval '50 days 30 minutes');
        ${source}`),/Reconcile legacy overlapping provider resources/);
      assert.equal(await sql("select count(*) from information_schema.columns where table_schema='public' and table_name='appointment_slots' and column_name='lifecycle_resource_key';"),'0');
    }
    await sql(source);
    if(fullMarketplace && file.endsWith('vetit_marketplace_baseline.sql')) {
      // Fixtures precede seller write guards; do not weaken those guards for tests.
      await sql(fixtures+expiryFixtures+`
        insert into public.appointment_slots(id,service_listing_id,starts_at,ends_at,status) values
        ('50000000-0000-4000-8000-000000000001','${service}',now()+interval '40 days',now()+interval '40 days 30 minutes','booked');
        insert into public.bookings(id,customer_profile_id,provider_business_id,service_listing_id,appointment_slot_id,requested_start,requested_end,price_minor,currency_code,cancellation_policy_snapshot)
        select '60000000-0000-4000-8000-000000000001','${alice}','${business}','${service}',id,starts_at,ends_at,25000,'INR','Legacy terms require provider review' from public.appointment_slots where id='50000000-0000-4000-8000-000000000001';
      `);
    }
  }
  if(!fullMarketplace) await sql(fixtures);
  if(fullMarketplace) await t.test('legacy terms remain unchanged, customers fail closed and provider cancellation preserves history',async()=>{
    const bookingId='60000000-0000-4000-8000-000000000001';
    assert.equal(await sql(`select cancellation_policy_snapshot || ':' || (lifecycle_policy_snapshot is null)::text from public.bookings where id='${bookingId}';`),'Legacy terms require provider review:true');
    await assert.rejects(()=>command(alice,{action:'cancel',bookingId}),/policy|required/i);
    await command(owner,{action:'cancel',bookingId,providerCancellation:true});
    assert.equal(await sql(`select status || ':' || (appointment_slot_id is null)::text from public.bookings where id='${bookingId}';`),'cancelled:true');
  });
  let offset = 3;
  async function slot(resourceKey='default', listingId=service, days=offset++) {
    const startsAt = new Date(Date.now() + days * 86400000).toISOString(), endsAt = new Date(Date.parse(startsAt)+1800000).toISOString();
    const result = await command(owner,{ action:'scheduleSlot',serviceListingId:listingId,startsAt,endsAt,resourceKey });
    return { id:result.slotId, startsAt, endsAt };
  }
  await t.test('two real concurrent sessions claim one slot: one winner and one conflict',async()=>{
    const s=await slot();
    const results=await Promise.allSettled([alice,bob].map(actor=>command(actor,{ action:'book',slotId:s.id })));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await sql(`select count(*) from public.bookings where appointment_slot_id = '${s.id}';`),'1');
  });
  await t.test('separate daycare places can share a start; overlapping times for the same resource are rejected',async()=>{
    const first=await slot('place_1');
    const second=await command(owner,{action:'scheduleSlot',serviceListingId:service,startsAt:first.startsAt,endsAt:first.endsAt,resourceKey:'place_2'});
    assert.notEqual(second.slotId,first.id);
    await assert.rejects(()=>command(owner,{action:'scheduleSlot',serviceListingId:service,startsAt:new Date(Date.parse(first.startsAt)+1000).toISOString(),endsAt:first.endsAt,resourceKey:'place_1'}));
    await Promise.all([command(alice,{action:'book',slotId:first.id}),command(bob,{action:'book',slotId:second.slotId})]);
    assert.equal(await sql(`select count(*) from public.bookings where appointment_slot_id in ('${first.id}','${second.slotId}');`),'2');
  });
  await t.test('cancellation releases capacity, preserves history and requests rather than executes a refund',async()=>{
    const s=await slot(); const {bookingId}=await command(alice,{action:'book',slotId:s.id});
    await sql(`insert into public.payments(booking_id,customer_profile_id,provider,status,amount_minor,currency_code) values ('${bookingId}','${alice}','disposable','captured',25000,'INR');`);
    await command(alice,{action:'cancel',bookingId}); await command(alice,{action:'cancel',bookingId});
    assert.equal(await sql(`select status || ':' || (appointment_slot_id is null)::text from public.bookings where id='${bookingId}';`),'cancelled:true');
    assert.equal(await sql(`select refund_minor || ':' || status from vetit_appointments.refund_requests where booking_id='${bookingId}';`),'25000:review_required');
    assert.equal(await sql(`select status from public.payments where booking_id='${bookingId}';`),'captured');
    assert.equal(await sql(`select count(*) from vetit_appointments.events where booking_id='${bookingId}' and event_type='cancelled';`),'1');
    const replacement=await command(bob,{action:'book',slotId:s.id}); assert.notEqual(replacement.bookingId,bookingId);
  });
  await t.test('failed reschedule rolls back both allocations; successful move preserves identity and agreed price',async()=>{
    const original=await slot(), replacement=await slot(), busy=await slot();
    const {bookingId}=await command(alice,{action:'book',slotId:original.id}); await command(bob,{action:'book',slotId:busy.id});
    await assert.rejects(()=>command(alice,{action:'reschedule',bookingId,slotId:busy.id}));
    assert.equal(await sql(`select appointment_slot_id from public.bookings where id='${bookingId}';`),original.id);
    await command(alice,{action:'reschedule',bookingId,slotId:replacement.id});
    assert.equal(await sql(`select appointment_slot_id || ':' || price_minor from public.bookings where id='${bookingId}';`),`${replacement.id}:25000`);
    assert.equal(await sql(`select status from public.appointment_slots where id='${original.id}';`),'available');
  });
  await t.test('cancelled slot offers FIFO to one customer; another cannot book or steal the offer',async()=>{
    const s=await slot(); const {bookingId}=await command(alice,{action:'book',slotId:s.id});
    const startsAt=new Date(Date.parse(s.startsAt)-1000).toISOString(), endsAt=new Date(Date.parse(s.endsAt)+1000).toISOString();
    await command(bob,{action:'joinWaitlist',serviceListingId:service,startsAt,endsAt});
    await command(charlie,{action:'joinWaitlist',serviceListingId:service,startsAt,endsAt});
    await command(alice,{action:'cancel',bookingId});
    const offerId=await sql(`select id from vetit_appointments.offers where slot_id='${s.id}' and status='offered';`);
    assert.equal(await sql(`select customer_profile_id from vetit_appointments.offers where id='${offerId}';`),bob);
    await assert.rejects(()=>command(charlie,{action:'acceptOffer',offerId}));
    await assert.rejects(()=>command(charlie,{action:'book',slotId:s.id}));
    await command(bob,{action:'acceptOffer',offerId});
    const retry=await command(bob,{action:'acceptOffer',offerId}); assert.ok(retry.bookingId);
    assert.equal(await sql(`select count(*) from public.bookings where appointment_slot_id='${s.id}';`),'1');
  });
  await t.test('concurrent rescheduling uses booking revisions so only one move can succeed',async()=>{
    const original=await slot(), first=await slot(), second=await slot();
    const {bookingId}=await command(alice,{action:'book',slotId:original.id});
    const results=await Promise.allSettled([first,second].map(s=>command(alice,{action:'reschedule',bookingId,slotId:s.id,expectedRevision:1})));
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(await sql(`select lifecycle_revision from public.bookings where id='${bookingId}';`),'2');
    assert.equal(await sql(`select count(*) from public.appointment_slots where id in ('${first.id}','${second.id}') and status='booked';`),'1');
  });
  await t.test('expiry worker rotates to the next waiting customer and disabled outbox never sends',async()=>{
    // Isolate this queue from all earlier active waiting-list entries.
    if(!fullMarketplace) await sql(expiryFixtures);
    const s=await slot('expiry_place',expiryService); const {bookingId}=await command(alice,{action:'book',slotId:s.id});
    const startsAt=s.startsAt, endsAt=s.endsAt;
    await command(bob,{action:'joinWaitlist',serviceListingId:expiryService,startsAt,endsAt}); await command(charlie,{action:'joinWaitlist',serviceListingId:expiryService,startsAt,endsAt});
    await command(alice,{action:'cancel',bookingId});
    await sql(`update vetit_appointments.offers set expires_at=now()-interval '1 second' where slot_id='${s.id}' and status='offered'; select public.appointment_lifecycle_tick();`);
    assert.equal(await sql(`select customer_profile_id from vetit_appointments.offers where slot_id='${s.id}' and status='offered';`),charlie);
    assert.equal(await sql("select count(*) from vetit_appointments.notification_outbox where status <> 'disabled';"),'0');
  });
  await t.test('provider/customer role overlap requires authorised provider mode',async()=>{
    const own=await slot('owner_overlap',service,0.04);
    const {bookingId}=await command(owner,{action:'book',slotId:own.id});
    await assert.rejects(()=>command(owner,{action:'cancel',bookingId}));
    await command(owner,{action:'cancel',bookingId,providerCancellation:true});
    assert.equal(await sql(`select status from public.appointment_slots where id='${own.id}';`),'cancelled');
    for(const actor of [alice,manager]) {
      const ownSlot=await slot(actor===alice?'customer_overlap':'catalog_overlap',service,0.05);
      const booking=await command(actor,{action:'book',slotId:ownSlot.id});
      await assert.rejects(()=>command(actor,{action:'cancel',bookingId:booking.bookingId,providerCancellation:true}));
      assert.equal(await sql(`select status from public.bookings where id='${booking.bookingId}';`),'requested');
    }
  });
  await t.test('shared resource conflicts across services and reopening roll back safely',async()=>{
    const otherService='40000000-0000-4000-8000-000000000002';
    const existing=await slot('shared_clinician');
    await assert.rejects(()=>command(owner,{action:'scheduleSlot',serviceListingId:otherService,startsAt:existing.startsAt,endsAt:existing.endsAt,resourceKey:'shared_clinician'}));
    await command(owner,{action:'blockSlot',slotId:existing.id});
    const replacement=await command(owner,{action:'scheduleSlot',serviceListingId:otherService,startsAt:existing.startsAt,endsAt:existing.endsAt,resourceKey:'shared_clinician'});
    await assert.rejects(()=>command(owner,{action:'reopenSlot',slotId:existing.id}));
    assert.equal(await sql(`select status from public.appointment_slots where id='${existing.id}';`),'cancelled');
    assert.equal(await sql(`select status from public.appointment_slots where id='${replacement.slotId}';`),'available');
  });
  await t.test('customers and catalogue managers cannot manage schedules, other histories, or lifecycle ledgers',async()=>{
    const startsAt=new Date(Date.now()+20*86400000).toISOString(),endsAt=new Date(Date.parse(startsAt)+1800000).toISOString();
    for(const actor of [alice,manager]) {
      await assert.rejects(()=>command(actor,{action:'scheduleSlot',serviceListingId:service,startsAt,endsAt}));
      await assert.rejects(()=>sql(`set role authenticated; set request.jwt.claim.sub='${actor}'; select public.appointment_lifecycle_dashboard('${business}');`));
    }
    await assert.rejects(()=>sql(`set role authenticated; set request.jwt.claim.sub='${alice}'; select * from vetit_appointments.offers;`));
    await assert.rejects(()=>sql(`set role authenticated; select public.appointment_lifecycle_tick();`));
  });
  if(process.env.VETIT_APPOINTMENT_OPERATIONS_TESTS==='1') await testAppointmentOperations(t,sql,command);
});
