import test from 'node:test';
import assert from 'node:assert/strict';
import {startAddressBrowser} from './address-browser-helper.mjs';
const origin='http://127.0.0.1:4321',alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002';
test('isolated Chromium desktop/mobile seller-form fixture uses actual account guard to preserve same-account edits and clear switched accounts',{skip:process.env.VETIT_SELLER_ACCOUNT_BROWSER_TESTS!=='1'},async()=>{
 const browser=await startAddressBrowser();let writes=0;
 try{
  browser.on('Fetch.requestPaused',async({requestId,request})=>{
   const url=new URL(request.url);if(url.origin!==origin)return browser.send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
   let content,type='text/html';
   if(url.pathname==='/seller/account-isolation-fixture')content=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><main class="seller-page" data-seller-account data-profile-id="${alice}"><h1>Synthetic private seller</h1><form method="post" action="/api/seller/business"><input name="expected_profile_id" type="hidden" value="${alice}"><label>Business name<input name="display_name" value="Private seller details"></label><button type="submit">Save</button></form></main><script type="module" src="/src/lib/seller/account-page.ts"></script></body></html>`;
   else if(url.pathname==='/src/lib/supabase/browser.ts'){
    type='application/javascript';content=`const listeners=new Set();export function createSupabaseBrowserClient(){return{auth:{onAuthStateChange(fn){listeners.add(fn);return{data:{subscription:{unsubscribe(){listeners.delete(fn)}}}}}}}};window.__sellerIdentity=(id,event='SIGNED_IN')=>{for(const fn of listeners)fn(event,id?{user:{id}}:null)};`;
   }else if(url.pathname.startsWith('/api/')){writes++;return browser.send('Fetch.fulfillRequest',{requestId,responseCode:503,body:''});}
   else return browser.send('Fetch.continueRequest',{requestId});
   return browser.send('Fetch.fulfillRequest',{requestId,responseCode:200,responseHeaders:[{name:'content-type',value:type}],body:Buffer.from(content).toString('base64')});
  });
  await browser.send('Fetch.enable',{patterns:[{urlPattern:'*'}]});
  await browser.send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await browser.send('Page.navigate',{url:origin+'/seller/account-isolation-fixture'});await browser.wait(`typeof window.__sellerIdentity==='function'&&document.readyState==='complete'`);
  await browser.evaluate(`window.__oldForm=document.querySelector('form');window.__oldInput=document.querySelector('[name=display_name]');window.__oldInput.value='Unsaved edit';window.__sellerIdentity(${JSON.stringify(alice)},'TOKEN_REFRESHED')`);
  assert.equal(await browser.evaluate(`document.querySelector('[name=display_name]').value`),'Unsaved edit');assert.equal(writes,0);
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
  await browser.evaluate(`window.__sellerIdentity(${JSON.stringify(bob)})`);await browser.wait(`document.querySelector('[data-seller-account]').textContent.includes('Your account changed')`);
  assert.equal(await browser.evaluate(`document.querySelector('form')===null&&window.__oldForm.dataset.accountInvalidated==='true'&&window.__oldInput.disabled&&window.__oldInput.value===''`),true);
  assert.doesNotMatch(await browser.evaluate('document.body.textContent'),/Private seller details|Synthetic private seller|Unsaved edit/);assert.equal(writes,0);
  assert.equal(await browser.evaluate('document.documentElement.scrollWidth<=390&&innerWidth<=390'),true);
  await browser.send('Page.navigate',{url:origin+'/seller/account-isolation-fixture'});await browser.wait(`typeof window.__sellerIdentity==='function'&&document.querySelector('form')!==null`);
  await browser.evaluate(`window.__sellerIdentity(null,'SIGNED_OUT')`);await browser.wait(`document.querySelector('form')===null`);
  assert.equal(writes,0);assert.deepEqual(browser.errors,[]);
 }catch(error){console.error('Browser diagnostic',browser.errors);throw error;}finally{await browser.close();}
});
