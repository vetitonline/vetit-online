// Real isolated browser + actual component script/API route. Synthetic markup,
// injected auth/RPC fixtures; no Astro SSR, hosted auth, Storage or external calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createModerationBrowserFixture} from './moderation-browser-fixture.mjs';

test('bounded offline moderation browser acceptance',{timeout:60000,skip:!process.env.VETIT_PLAYWRIGHT_MODULE},async t=>{
 const {chromium}=await import(pathToFileURL(process.env.VETIT_PLAYWRIGHT_MODULE).href);
 let browser;
 try{browser=await chromium.launch({headless:true,chromiumSandbox:true,...(process.env.VETIT_BROWSER_EXECUTABLE?{executablePath:process.env.VETIT_BROWSER_EXECUTABLE}:{}),timeout:12000});}
 catch(error){if(String(error).includes('spawn EPERM')){t.skip('Browser process permission denied; runtime acceptance is unverified.');return;}throw error;}
 const fixture=await createModerationBrowserFixture();const {server,origin}=fixture;
 const deadline=setTimeout(()=>{server.closeAllConnections();server.close();},55000);
 try{

  async function pageFor(nextMode,mobile=false){fixture.reset(nextMode);const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1100,height:800}});await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const page=await context.newPage();page.setDefaultTimeout(5000);await page.goto(origin);await page.waitForFunction(()=>document.querySelector('[data-moderation-action]')!==null);await page.waitForLoadState('networkidle');return{context,page};}
  await t.test('conflict disables stale mutations and offers refresh',async()=>{const{context,page}=await pageFor('conflict');try{await page.click('[data-moderation-action="approve"]');await page.getByRole('alert').filter({hasText:'Case changed'}).waitFor();assert.equal(await page.locator('[data-moderation-action]:disabled').count(),4);assert.equal(await page.getByRole('button',{name:'Refresh / फिर खोलें'}).isEnabled(),true);assert.equal(fixture.stats().requests.length,1);}finally{await context.close();}});
  await t.test('expired mobile session offers sign-in without layout overflow',async()=>{const{context,page}=await pageFor('expired',true);try{await page.click('[data-moderation-action="approve"]');await page.getByRole('alert').filter({hasText:'Session expired'}).waitFor();assert.match(await page.getByRole('link',{name:'Sign in / साइन इन'}).getAttribute('href'),/^\/login\?next=/);assert.equal(fixture.stats().rpcCalls,0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}finally{await context.close();}});
  await t.test('double click sends a single decision',async()=>{const{context,page}=await pageFor('success');try{await page.evaluate(()=>{const button=document.querySelector('[data-moderation-action="approve"]');button.click();button.click();});await page.waitForFunction(()=>document.querySelector('.moderation-workspace')?.dataset.version==='2');assert.equal(fixture.stats().requests.length,1);assert.equal(fixture.stats().writes,1);}finally{await context.close();}});
  await t.test('lost response retry reuses exact idempotency key',async()=>{const{context,page}=await pageFor('lost');try{await page.click('[data-moderation-action="approve"]');await page.getByRole('alert').filter({hasText:'Action not accepted'}).waitFor();await page.click('[data-moderation-action="approve"]');await page.waitForFunction(()=>document.querySelector('.moderation-workspace')?.dataset.version==='2');assert.equal(fixture.stats().requests.length,2);assert.equal(fixture.stats().requests[0].requestId,fixture.stats().requests[1].requestId);assert.equal(fixture.stats().writes,1);}finally{await context.close();}});
 }finally{clearTimeout(deadline);await fixture.close();await browser.close();}
});
