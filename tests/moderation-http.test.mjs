// Actual loopback HTTP and route/component assets, synthetic auth/RPC only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createModerationBrowserFixture} from './moderation-browser-fixture.mjs';
import {fixtureDecision} from './moderation-api-fixture.mjs';
test('bounded local HTTP moderation acceptance',{timeout:15000},async t=>{
 const fixture=await createModerationBrowserFixture();
 const post=(origin=fixture.origin)=>fetch(fixture.origin+'/api/moderation',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(fixtureDecision)});
 try{
  await t.test('loopback page serves CSP and actual component script',async()=>{const page=await fetch(fixture.origin);assert.equal(page.status,200);assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);assert.match(await page.text(),/LOCAL SYNTHETIC FIXTURE/);const script=await fetch(fixture.origin+'/src/components/seller/panel.js');assert.equal(script.status,200);assert.match(await script.text(),/lastRequestId/);});
  await t.test('decision and duplicate request remain idempotent over HTTP',async()=>{fixture.reset('success');let response=await post();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/private, no-store/);response=await post();assert.equal(response.status,200);assert.equal(fixture.stats().writes,1);});
  await t.test('conflict and expired session preserve safe status codes',async()=>{fixture.reset('conflict');assert.equal((await post()).status,409);fixture.reset('expired');assert.equal((await post()).status,401);assert.equal(fixture.stats().writes,0);});
  await t.test('cross-site HTTP action cannot reach database adapter',async()=>{fixture.reset('success');assert.equal((await post('https://untrusted.invalid')).status,403);assert.equal(fixture.stats().rpcCalls,0);});
 }finally{await fixture.close();}
});
