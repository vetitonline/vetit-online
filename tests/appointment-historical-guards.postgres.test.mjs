import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {executePostgresSql} from './appointment-postgres-runner.mjs';
test('historical slot controls fail closed in the synthetic operations database',{skip:process.env.VETIT_APPOINTMENT_DB_TESTS!=='1'},async t=>{
  const url=new URL(process.env.VETIT_APPOINTMENT_TEST_DATABASE_URL||'');
  assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&/^\/vetit_disposable_operations_[a-z0-9_]+$/.test(url.pathname)&&!url.password&&!url.search&&!url.hash);
  const sql=source=>executePostgresSql(source,{connection:url.toString(),executable:process.env.VETIT_TEST_PSQL||'psql'});
  // Only replace the changed command in this disposable database, not the DDL chain.
  const source=await readFile(new URL('../supabase/test-project/appointment-lifecycle.proposal.sql',import.meta.url),'utf8');
  const command=source.match(/create function vetit_appointments\.command\(p_command jsonb\)[\s\S]*?\$function\$;/)[0];
  await sql(command.replace('create function','create or replace function'));
  const operations=await readFile(new URL('../supabase/test-project/appointment-operations.proposal.sql',import.meta.url),'utf8');
  await sql(operations);await sql(operations);
  const owner='10000000-0000-4000-8000-000000000001',customer='10000000-0000-4000-8000-000000000002',business='20000000-0000-4000-8000-000000000001',service='40000000-0000-4000-8000-000000000001';
  // Each affected-only run adds new fixtures; never reset earlier test records.
  const unknown=randomUUID(),active=randomUUID(),booking=randomUUID();
  await sql(`insert into public.appointment_slots(id,service_listing_id,starts_at,ends_at,status,lifecycle_resource_key) values
    ('${active}','${service}',now()+interval '150 days',now()+interval '150 days 30 minutes','held','guard_${active}'),
    ('${unknown}','${service}',now()+interval '151 days',now()+interval '151 days 30 minutes','held','guard_${unknown}');
    insert into public.bookings(id,customer_profile_id,provider_business_id,service_listing_id,appointment_slot_id,requested_start,requested_end,price_minor,currency_code)
    select '${booking}','${customer}','${business}','${service}',id,starts_at,ends_at,12345,'INR' from public.appointment_slots where id='${active}';`);
  const mutate=(slotId,action)=>sql(`set role authenticated;set request.jwt.claim.sub='${owner}';select public.appointment_lifecycle_command('{"action":"${action}","slotId":"${slotId}"}');`);
  await t.test('unknown historical holds cannot be blocked or reopened',async()=>{
    for(const action of ['blockSlot','reopenSlot'])await assert.rejects(()=>mutate(unknown,action),/Historical hold/i);
    assert.equal(await sql(`select status from public.appointment_slots where id='${unknown}';`),'held');
  });
  await t.test('active bookings protect capacity even when a historical slot is incorrectly marked held',async()=>{
    await assert.rejects(()=>mutate(active,'blockSlot'),/Cancel the booking/i);
    assert.equal(await sql(`select status from public.appointment_slots where id='${active}';`),'held');
    assert.equal(await sql(`select price_minor||':'||appointment_slot_id from public.bookings where id='${booking}';`),`12345:${active}`);
  });
  await t.test('bounded inventory remains idempotent and worker activation remains off',async()=>{
    const inventory=()=>sql('set role service_role;select public.appointment_inventory_historical_holds();').then(JSON.parse);
    assert.equal((await inventory()).newReviews,2);assert.equal((await inventory()).newReviews,0);
    assert.equal(await sql('select enabled::text from vetit_appointments.worker_settings;'),'false');
    const disabled=JSON.parse(await sql(`set role service_role;select public.appointment_expiry_worker_run('${randomUUID()}',20);`));assert.equal(disabled.hasMore,false);
  });
});
