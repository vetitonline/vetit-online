import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const owner='10000000-0000-4000-8000-000000000001',customer='10000000-0000-4000-8000-000000000002',catalog='10000000-0000-4000-8000-000000000005';
const business='20000000-0000-4000-8000-000000000001',service='40000000-0000-4000-8000-000000000001';
const ownedSlot='51000000-0000-4000-8000-000000000001',unknownSlot='51000000-0000-4000-8000-000000000002',booking='61000000-0000-4000-8000-000000000001';
const first='11000000-0000-4000-8000-000000000001',second='11000000-0000-4000-8000-000000000002';
const digest='a'.repeat(64);
export async function testAppointmentOperations(t,sql,command) {
  const source=await readFile(new URL('../supabase/test-project/appointment-operations.proposal.sql',import.meta.url),'utf8');
  await sql(source);await sql(source); // Proposal and settings seed are idempotent.
  const actorSql=(actor,source)=>sql(`set role authenticated;set request.jwt.claim.sub='${actor}';${source}`);
  const worker=(id,forceFailure=false)=>sql(`set role service_role;${forceFailure?"set vetit.test_force_worker_retry='1';":''}select public.appointment_expiry_worker_run('${id}',20);`).then(JSON.parse);
  const reconcile=(actor,slotId=ownedSlot,customerId=customer)=>actorSql(actor,`select public.appointment_reconcile_historical_hold('${slotId}','${booking}','${customerId}','verified_v1','${digest}');`).then(JSON.parse);
  await t.test('operations remain disabled and inaccessible to customers by default',async()=>{
    assert.equal((await worker('81000000-0000-4000-8000-000000000001')).state,'disabled');
    await assert.rejects(()=>actorSql(customer,"select public.appointment_expiry_worker_run('81000000-0000-4000-8000-000000000002',20);"),/permission denied/i);
    await assert.rejects(()=>actorSql(owner,'select * from vetit_appointments.historical_hold_reviews;'),/permission denied/i);
  });
  await t.test('historical inventory is idempotent and never releases or assigns unmatched holds',async()=>{
    await sql(`insert into public.appointment_slots(id,service_listing_id,starts_at,ends_at,status,hold_expires_at) values
      ('${ownedSlot}','${service}',now()+interval '100 days',now()+interval '100 days 30 minutes','held',now()-interval '1 day'),
      ('${unknownSlot}','${service}',now()+interval '101 days',now()+interval '101 days 30 minutes','held',now()-interval '1 day');
      insert into public.bookings(id,customer_profile_id,provider_business_id,service_listing_id,appointment_slot_id,requested_start,requested_end,price_minor,currency_code,cancellation_policy_snapshot)
      select '${booking}','${customer}','${business}','${service}',id,starts_at,ends_at,12345,'INR','Original historical terms' from public.appointment_slots where id='${ownedSlot}';`);
    const inventory=()=>sql('set role service_role;select public.appointment_inventory_historical_holds();').then(JSON.parse);
    assert.equal((await inventory()).newReviews,2);assert.equal((await inventory()).newReviews,0);
    await assert.rejects(()=>command(owner,{action:'blockSlot',slotId:ownedSlot}),/Cancel the booking/i);
    await assert.rejects(()=>command(owner,{action:'blockSlot',slotId:unknownSlot}),/Historical hold/i);
    await assert.rejects(()=>reconcile(owner),/not approved/i);
    assert.equal(await sql(`select count(*) from public.appointment_slots where id in ('${ownedSlot}','${unknownSlot}') and status='held';`),'2');
  });
  await t.test('approved provider reconciliation preserves verified ownership, price and history exactly once',async()=>{
    // Explicit approval exists only in this synthetic local fixture.
    await sql("insert into vetit_appointments.historical_hold_policies(policy_version,approved,approved_at) values('verified_v1',true,now());");
    await assert.rejects(()=>reconcile(customer),/owner|admin|manage|permission/i);
    await assert.rejects(()=>reconcile(catalog),/owner|admin|manage|permission/i);
    await assert.rejects(()=>reconcile(owner,ownedSlot,first),/matching owned booking/i);
    await assert.rejects(()=>reconcile(owner,unknownSlot),/matching owned booking/i);
    assert.equal((await reconcile(owner)).status,'reconciled');assert.equal((await reconcile(owner)).status,'reconciled');
    assert.equal(await sql(`select status from public.appointment_slots where id='${ownedSlot}';`),'booked');
    assert.equal(await sql(`select status from public.appointment_slots where id='${unknownSlot}';`),'held');
    assert.equal(await sql(`select price_minor||':'||cancellation_policy_snapshot from public.bookings where id='${booking}';`),'12345:Original historical terms');
    assert.equal(await sql(`select count(*) from vetit_appointments.events where booking_id='${booking}' and event_type='historical_hold_preserved';`),'1');
  });
  let offeredSlot;
  await t.test('expiry run rolls back transient failure and records a safe retry audit',async()=>{
    await sql(`insert into auth.users(id) values('${first}'),('${second}');`);
    const startsAt=new Date(Date.now()+200*86400000).toISOString(),endsAt=new Date(Date.parse(startsAt)+1800000).toISOString();
    offeredSlot=(await command(owner,{action:'scheduleSlot',serviceListingId:service,startsAt,endsAt,resourceKey:'worker_fifo'})).slotId;
    const active=await command(customer,{action:'book',slotId:offeredSlot});
    for(const actor of [first,second])await command(actor,{action:'joinWaitlist',serviceListingId:service,startsAt,endsAt});
    await command(customer,{action:'cancel',bookingId:active.bookingId});
    assert.equal(await sql(`select customer_profile_id from vetit_appointments.offers where slot_id='${offeredSlot}' and status='offered';`),first);
    assert.equal(await sql(`select (expires_at<=created_at+interval '15 minutes')::text from vetit_appointments.offers where slot_id='${offeredSlot}' and status='offered';`),'true');
    await sql(`update vetit_appointments.offers set expires_at=now()-interval '1 second' where slot_id='${offeredSlot}' and status='offered';
      update vetit_appointments.worker_settings set enabled=true where singleton;
      create function vetit_appointments.test_worker_fault() returns trigger language plpgsql as $$ begin
        if current_setting('vetit.test_force_worker_retry',true)='1' then raise exception 'Synthetic serialization failure' using errcode='40001'; end if;return new;end;$$;
      create trigger test_worker_fault before update on vetit_appointments.offers for each row execute function vetit_appointments.test_worker_fault();`);
    const id='81000000-0000-4000-8000-000000000003';const result=await worker(id,true);
    assert.equal(result.retryable,1);assert.deepEqual(await worker(id),result);
    assert.equal(await sql(`select outcome||':'||sqlstate from vetit_appointments.worker_audit where run_id='${id}' and business_id='${business}';`),'retryable:40001');
    assert.equal(await sql(`select customer_profile_id from vetit_appointments.offers where slot_id='${offeredSlot}' and status='offered';`),first);
  });
  await t.test('concurrent runs reassign FIFO once; replay does not duplicate offers or notices',async()=>{
    const ids=['81000000-0000-4000-8000-000000000004','81000000-0000-4000-8000-000000000005'];
    const results=await Promise.all(ids.map(id=>worker(id)));assert.equal(results.reduce((n,r)=>n+r.processed,0),1);
    const replay=await worker(ids[0]);assert.deepEqual(replay,results[0]);
    assert.equal(await sql(`select customer_profile_id from vetit_appointments.offers where slot_id='${offeredSlot}' and status='offered';`),second);
    assert.equal(await sql(`select count(*) from vetit_appointments.offers where slot_id='${offeredSlot}' and status='offered';`),'1');
    assert.equal(await sql(`select count(*) from vetit_appointments.notifications n join vetit_appointments.offers f on n.deduplication_key=f.id::text where f.slot_id='${offeredSlot}' and f.status='offered';`),'1');
    assert.equal(await sql(`select status from public.appointment_slots where id='${unknownSlot}';`),'held');
    await sql('update vetit_appointments.worker_settings set enabled=false where singleton;');
    assert.equal((await worker('81000000-0000-4000-8000-000000000006')).state,'disabled');
  });
  await t.test('completed worker receipts report remaining expiry backlog after the per-provider batch limit',async()=>{
    await sql(`with generated as (
      insert into auth.users(id) select gen_random_uuid() from generate_series(1,101) returning id
    ) insert into vetit_appointments.waitlist(customer_profile_id,service_listing_id,business_id,starts_at,ends_at,market_code)
      select id,'${service}','${business}',now()-interval '2 days',now()-interval '1 day','IN' from generated;
      update vetit_appointments.worker_settings set enabled=true where singleton;`);
    const result=await worker('81000000-0000-4000-8000-000000000007');
    assert.equal(result.state,'completed');assert.equal(result.processed,1);assert.equal(result.hasMore,true);
    assert.equal(await sql(`select count(*) from vetit_appointments.waitlist where business_id='${business}' and status='waiting' and ends_at<=now();`),'1');
    await sql('update vetit_appointments.worker_settings set enabled=false where singleton;');
  });
}
