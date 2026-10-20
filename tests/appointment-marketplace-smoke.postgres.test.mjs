import test from 'node:test';
import assert from 'node:assert/strict';
import { executePostgresSql } from './appointment-postgres-runner.mjs';
const enabled=process.env.VETIT_APPOINTMENT_DB_TESTS==='1';
const selectedCase=process.env.VETIT_MARKETPLACE_SMOKE_CASE;
const caseOptions=key=>({skip:!!selectedCase&&selectedCase!==key});
const owner='10000000-0000-4000-8000-000000000001',alice='10000000-0000-4000-8000-000000000002',bob='10000000-0000-4000-8000-000000000003';
const business='20000000-0000-4000-8000-000000000001',service='40000000-0000-4000-8000-000000000001';
let connection;
const sql=source=>executePostgresSql(source,{connection,executable:process.env.VETIT_TEST_PSQL||'psql'});
const actorSql=(actor,source)=>sql(`set role authenticated; set request.jwt.claim.sub='${actor}'; ${source}`);
const command=(actor,input)=>actorSql(actor,`select public.appointment_lifecycle_command('${JSON.stringify(input).replaceAll("'","''")}'::jsonb);`).then(JSON.parse);
test('supplementary marketplace appointment boundaries in the isolated composed schema',{skip:!enabled},async t=>{
  const url=new URL(process.env.VETIT_APPOINTMENT_TEST_DATABASE_URL||'');
  assert.ok(['postgres:','postgresql:'].includes(url.protocol)&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&/^\/vetit_disposable_marketplace_[a-z0-9_]+$/.test(url.pathname)&&!url.password&&!url.search&&!url.hash,'Dedicated local composed-schema test database required.');
  connection=url.toString();
  await t.test('customer dashboard is owned, provider dashboard is authorised and notifications cannot be read by another customer',caseOptions('privacy'),async()=>{
    const own=JSON.parse(await actorSql(alice,'select public.appointment_lifecycle_dashboard(null);'));
    assert.ok(own.bookings.length>0);assert.ok(own.notifications.length>0);
    const foreign=JSON.parse(await actorSql(bob,'select public.appointment_lifecycle_dashboard(null);'));
    const ownIds=new Set(own.bookings.map(b=>b.id));assert.ok(foreign.bookings.every(b=>!ownIds.has(b.id)));
    await assert.rejects(()=>actorSql(alice,`select public.appointment_lifecycle_dashboard('${business}');`),/owner|admin|permission|manage/i);
    const notice=own.notifications[0];await assert.rejects(()=>command(bob,{action:'readNotification',notificationId:notice.id}),/not found/i);
    await command(alice,{action:'readNotification',notificationId:notice.id});
    assert.equal(await sql(`select (read_at is not null)::text from vetit_appointments.notifications where id='${notice.id}';`),'true');
  });
  await t.test('stale booking quote rolls back allocation and does not create a booking',caseOptions('quote'),async()=>{
    const startsAt=new Date(Date.now()+70*86400000).toISOString(),endsAt=new Date(Date.parse(startsAt)+1800000).toISOString();
    const {slotId}=await command(owner,{action:'scheduleSlot',serviceListingId:service,startsAt,endsAt,resourceKey:'quote_smoke'});
    await assert.rejects(()=>command(alice,{action:'book',slotId,expectedPriceMinor:1,expectedCurrencyCode:'INR'}),/price changed/i);
    assert.equal(await sql(`select status from public.appointment_slots where id='${slotId}';`),'available');
    assert.equal(await sql(`select count(*) from public.bookings where appointment_slot_id='${slotId}';`),'0');
  });
  await t.test('seller draft RPC remains usable and commerce rejects unpublished products atomically',caseOptions('seller'),async()=>{
    const category='30000000-0000-4000-8000-000000000003';
    const species='70000000-0000-4000-8000-000000000003';
    await sql(`insert into public.categories(id,name,slug,kind) values ('${category}','Smoke products','smoke-products','product') on conflict(id) do nothing;
      insert into public.animal_species(id,display_name,slug) values ('${species}','Smoke dogs','smoke-dogs');
      insert into public.category_species(category_id,species_id) values ('${category}','${species}');`);
    const listing=await actorSql(owner,`select public.save_seller_product(null,'${business}','Smoke product','smoke-product','Local fixture only','${category}',array['${species}']::uuid[],12000,'[]'::jsonb);`);
    assert.match(listing,/^[0-9a-f-]{36}$/);
    assert.equal(await sql(`select moderation_status from public.listings where id='${listing}';`),'draft');
    await assert.rejects(()=>actorSql(alice,`select public.set_my_cart_item('${listing}',null,1,'IN');`),/unavailable|available|published/i);
    assert.equal(await sql(`select count(*) from public.cart_items where listing_id='${listing}';`),'0');
  });
  await t.test('public policy works while legal business names and customer data stay private',caseOptions('public'),async()=>{
    const policy=JSON.parse(await sql(`set role anon; select public.appointment_lifecycle_policy('${service}');`));
    assert.equal(policy.currencyCode,'INR');assert.equal(policy.policy.offerExpiryMinutes,15);
    await assert.rejects(()=>sql('set role anon; select legal_name from public.businesses;'),/permission denied/i);
    await assert.rejects(()=>sql('set role anon; select * from vetit_appointments.notifications;'),/permission denied/i);
    assert.equal(await sql('select count(*) from vetit_appointments.notification_outbox where status <> \'disabled\';'),'0');
  });
});
