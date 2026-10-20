import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PROVIDER_TIMEZONE, INITIAL_APPOINTMENT_POLICY, AppointmentLifecycleError, normalizeAppointmentCommand, normalizeAppointmentResourceKey, normalizeAppointmentPolicy, normalizeProviderTimezone, previewAppointmentCancellation, previewAppointmentReschedule, formatAppointmentAmount } from '../src/lib/services/appointment-lifecycle.js';
import { getAppointmentDashboard, getAppointmentPolicy, sendAppointmentCommand } from '../src/lib/services/appointment-lifecycle-client.js';
const id = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const startsAt = '2026-10-20T12:00:00Z', start = Date.parse(startsAt);
const policy = { ...INITIAL_APPOINTMENT_POLICY };
const ok = data => new Response(JSON.stringify({ apiVersion:1, state:'accepted', data }));
const dashboard = {bookings:[],events:[],waitlist:[],offers:[],notifications:[],providerBusinesses:[],services:[],slots:[],policies:[],payments:[],refunds:[],truncated:false};

test('approved initial terms permit free cancellation at the exact 24-hour boundary, never inside it', () => {
  assert.equal(policy.offerExpiryMinutes,15);
  const at = previewAppointmentCancellation({ policy, startsAt, now:start-86400000, capturedMinor:12345 });
  assert.deepEqual(at,{ allowed:true, refundMinor:12345, paymentAction:'review_required' });
  assert.equal(previewAppointmentCancellation({ policy, startsAt, now:start-86400000+1, capturedMinor:12345 }).allowed,false);
  assert.equal(previewAppointmentCancellation({ policy, startsAt, now:start, capturedMinor:12345 }).allowed,false);
  assert.equal(previewAppointmentCancellation({ policy:{ ...policy,allowCustomerCancellation:false }, startsAt,now:start-172800000 }).allowed,false);
});
test('provider-specific late cancellation and provider cancellation calculate reviewed refunds without float rounding', () => {
  const late = { ...policy, allowLateCancellation:true, lateRefundBasisPoints:3333, lateCancellationChargePermitted:true, lateCancellationChargeDisclosure:'A disclosed retained amount applies to late cancellation.' };
  assert.equal(previewAppointmentCancellation({ policy:late, startsAt, now:start-1000, capturedMinor:101 }).refundMinor,33);
  const full = previewAppointmentCancellation({ policy:{ ...policy,allowCustomerCancellation:false }, startsAt,now:start, capturedMinor:100,providerCancellation:true });
  assert.equal(full.refundMinor,100); assert.equal(full.paymentAction,'review_required');
});
test('late charge terms require both permission and disclosure; no new money is collected', () => {
  for (const value of [
    { ...policy,allowLateCancellation:true,lateRefundBasisPoints:5000 },
    { ...policy,allowLateCancellation:true,lateRefundBasisPoints:5000,lateCancellationChargePermitted:true },
    { ...policy,allowLateCancellation:true,lateRefundBasisPoints:5000,lateCancellationChargeDisclosure:'Clear late charge terms shown before booking.' },
  ]) assert.throws(() => normalizeAppointmentPolicy(value),/permitted and disclosed/);
  const freeLate = normalizeAppointmentPolicy({ ...policy,allowLateCancellation:true,lateRefundBasisPoints:10000 });
  assert.equal(previewAppointmentCancellation({policy:freeLate,startsAt,now:start-1000,capturedMinor:200}).refundMinor,200);
});
test('policies reject unbounded expiry, partial terms, fractional notice and invalid financial input', () => {
  for (const invalid of [{ ...policy,offerExpiryMinutes:0 },{ ...policy,offerExpiryMinutes:1441 },{ ...policy,noticeMinutes:1.5 },{ ...policy,refundBasisPoints:10001 },{},null]) assert.throws(() => normalizeAppointmentPolicy(invalid),AppointmentLifecycleError);
  assert.throws(() => previewAppointmentCancellation({ policy, startsAt, capturedMinor:-1 }),AppointmentLifecycleError);
});
test('cancel and reschedule commands strip caller-supplied identities, prices, status and refund amounts', () => {
  assert.deepEqual(normalizeAppointmentCommand({ action:'cancel',bookingId:id,customerId:other,providerCancellation:true,refundMinor:50000 }),{ action:'cancel',bookingId:id,providerCancellation:true });
  assert.deepEqual(normalizeAppointmentCommand({ action:'reschedule',bookingId:id,slotId:other,priceMinor:1,status:'confirmed' }),{ action:'reschedule',bookingId:id,slotId:other });
  assert.throws(() => normalizeAppointmentCommand({ action:'reschedule',bookingId:id,slotId:'bad' }),AppointmentLifecycleError);
});
test('provider cancellation intent is boolean, preserves revisions and reaches the shared client',async()=>{
  for(const providerCancellation of ['true',1,null,{}]) assert.throws(()=>normalizeAppointmentCommand({action:'cancel',bookingId:id,providerCancellation}),AppointmentLifecycleError);
  let body;
  await sendAppointmentCommand({action:'cancel',bookingId:id,providerCancellation:true,expectedRevision:2,customerId:other},{baseUrl:'https://vetit.example',fetchImpl:async(url,options)=>{body=JSON.parse(options.body);return ok({bookingId:id});}});
  assert.deepEqual(body,{action:'cancel',bookingId:id,expectedRevision:2,providerCancellation:true});
  assert.equal(normalizeAppointmentCommand({action:'cancel',bookingId:id,providerCancellation:false}).providerCancellation,false);
});
test('booking revisions preserve optimistic conflict protection for concurrent edits',()=>{
  assert.equal(normalizeAppointmentCommand({action:'reschedule',bookingId:id,slotId:other,expectedRevision:3}).expectedRevision,3);
  assert.throws(()=>normalizeAppointmentCommand({action:'cancel',bookingId:id,expectedRevision:0}),AppointmentLifecycleError);
});
test('appointment money display respects currency minor units rather than assuming two decimals',()=>{
  assert.match(formatAppointmentAmount(25000,'INR'),/250\.00/);
  assert.match(formatAppointmentAmount(2500,'JPY'),/2,500/);
  assert.match(formatAppointmentAmount(1500,'KWD'),/1\.500/);
  assert.throws(()=>formatAppointmentAmount(-1,'INR'),AppointmentLifecycleError);
});
test('waiting-list windows and schedule durations require timezones and remain bounded', () => {
  const command = normalizeAppointmentCommand({ action:'joinWaitlist',serviceListingId:id,startsAt:'2026-10-20T13:00:00+01:00',endsAt:'2026-10-21T12:00:00Z' });
  assert.equal(command.startsAt,new Date(startsAt).toISOString()); assert.equal(command.marketCode,'IN');
  for (const input of [
    { action:'joinWaitlist',serviceListingId:id,startsAt,endsAt:'2026-12-20T12:00:00Z' },
    { action:'scheduleSlot',serviceListingId:id,startsAt,endsAt:'2026-10-22T12:00:00Z' },
    { action:'scheduleSlot',serviceListingId:id,startsAt:'2026-10-20T12:00',endsAt:'2026-10-20T13:00:00Z' },
    { action:'scheduleSlot',serviceListingId:id,startsAt,endsAt:'2026-10-20T13:00:00Z',resourceKey:'../../resource' },
  ]) assert.throws(() => normalizeAppointmentCommand(input),AppointmentLifecycleError);
});
test('shared provider resource and timezone contracts preserve the India-first single-capacity launch boundary', () => {
  assert.equal(DEFAULT_PROVIDER_TIMEZONE, 'Asia/Kolkata');
  assert.equal(normalizeProviderTimezone(), 'Asia/Kolkata');
  assert.equal(normalizeProviderTimezone('Europe/London'), 'Europe/London');
  for (const timezone of ['', 'Asia Kolkata', 'UTC\nInjected', 'Not/AZone', 1]) {
    assert.throws(() => normalizeProviderTimezone(timezone), AppointmentLifecycleError);
  }
  assert.equal(normalizeAppointmentResourceKey('groomer_2'), 'groomer_2');
  assert.equal(normalizeAppointmentResourceKey(), 'default');
  for (const resourceKey of ['', 'kennel/2', 'space key', 'x'.repeat(81), null]) {
    assert.throws(() => normalizeAppointmentResourceKey(resourceKey), AppointmentLifecycleError);
  }
});
test('rescheduling respects the saved policy at the 24-hour cutoff and never moves after start', () => {
  assert.equal(previewAppointmentReschedule({ policy, startsAt, now:start-86400000 }),true);
  assert.equal(previewAppointmentReschedule({ policy, startsAt, now:start-86400000+1 }),false);
  assert.equal(previewAppointmentReschedule({ policy:{ ...policy,allowReschedule:false }, startsAt, now:start-172800000 }),false);
  assert.equal(previewAppointmentReschedule({ policy:{ ...policy,noticeMinutes:0 }, startsAt, now:start }),false);
});
test('booking quotes preserve expected price for conflict detection without letting callers set the actual price', () => {
  const command = normalizeAppointmentCommand({ action:'book',slotId:id,priceMinor:0,expectedPriceMinor:25000,expectedCurrencyCode:'INR' });
  assert.equal(command.priceMinor,undefined); assert.equal(command.expectedPriceMinor,25000);
  assert.throws(() => normalizeAppointmentCommand({ action:'book',slotId:id,expectedPriceMinor:100 }),AppointmentLifecycleError);
});
test('authenticated client sends cancellation/rescheduling as bounded JSON to the same shared endpoint', async () => {
  for (const action of ['cancel','reschedule']) {
    let captured;
    const result = await sendAppointmentCommand({ action,bookingId:id,...(action==='reschedule'?{ slotId:other }:{}),customerId:other },{ baseUrl:'https://vetit.example',accessToken:'test-token',fetchImpl:async(url,options)=>{ captured={url,options}; return ok({ bookingId:id }); } });
    assert.equal(result.bookingId,id); assert.equal(captured.url,'https://vetit.example/api/appointments'); assert.equal(captured.options.method,'POST');
    assert.equal(captured.options.headers.authorization,'Bearer test-token'); assert.equal(JSON.parse(captured.options.body).customerId,undefined);
  }
});
test('concurrent client requests preserve independent conflict outcomes and never auto-retry a mutation', async () => {
  let calls=0;
  const fetchImpl=async()=>{ calls++; return calls===1?ok({bookingId:id}):new Response('private transaction detail',{status:409}); };
  const outcomes=await Promise.allSettled([1,2].map(()=>sendAppointmentCommand({ action:'book',slotId:id },{baseUrl:'https://vetit.example',fetchImpl})));
  assert.equal(calls,2); assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
  const failed=outcomes.find(r=>r.status==='rejected').reason;
  assert.equal(failed.status,409); assert.doesNotMatch(failed.message,/private transaction/);
});
test('offer acceptance rejects expiry/conflict safely and keeps server-only allocation data out of commands', async () => {
  assert.deepEqual(normalizeAppointmentCommand({ action:'acceptOffer',offerId:id,customerId:other,expiresAt:'2099-01-01T00:00:00Z',slotId:other }),{ action:'acceptOffer',offerId:id });
  await assert.rejects(()=>sendAppointmentCommand({ action:'acceptOffer',offerId:id },{ baseUrl:'https://vetit.example',fetchImpl:async()=>new Response('{}',{status:409}) }),e=>e instanceof AppointmentLifecycleError&&e.status===409);
});
test('dashboard and public policy reads are uncached, scoped and fail closed when proposal RPCs are absent', async () => {
  let captured;
  await getAppointmentDashboard({baseUrl:'https://vetit.example',businessId:id,fetchImpl:async(url,options)=>{captured={url,options};return ok(dashboard);}});
  assert.equal(new URL(captured.url).searchParams.get('businessId'),id); assert.equal(captured.options.cache,'no-store');
  await getAppointmentPolicy(id,{baseUrl:'https://vetit.example',fetchImpl:async(url)=>{assert.equal(new URL(url).searchParams.get('serviceListingId'),id);return ok({policy,title:'Consultation',priceMinor:25000,currencyCode:'INR'});}});
  await assert.rejects(()=>getAppointmentDashboard({baseUrl:'https://vetit.example',fetchImpl:async()=>new Response('missing RPC secret detail',{status:503})}),/currently unavailable/);
});
test('dashboard rejects null entries and incomplete contracts; public terms reject unsafe prices',async()=>{
  for (const data of [{bookings:[]},{...dashboard,offers:[null]}]) await assert.rejects(()=>getAppointmentDashboard({baseUrl:'https://vetit.example',fetchImpl:async()=>ok(data)}),/unsupported response/);
  await assert.rejects(()=>getAppointmentPolicy(id,{baseUrl:'https://vetit.example',fetchImpl:async()=>ok({policy,title:'Consultation',priceMinor:-1,currencyCode:'INR'})}),/unsupported response/);
});
test('client rejects unsafe origins, invalid tokens and unsupported success responses', async () => {
  for(const baseUrl of ['file:///private','https://user:password@vetit.example','https://vetit.example/path']) assert.throws(()=>getAppointmentDashboard({baseUrl}),AppointmentLifecycleError);
  assert.throws(()=>getAppointmentDashboard({baseUrl:'https://vetit.example',accessToken:'bad\nheader'}),AppointmentLifecycleError);
  await assert.rejects(()=>getAppointmentDashboard({baseUrl:'https://vetit.example',fetchImpl:async()=>new Response('{}')}),/unsupported response/);
});
