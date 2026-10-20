import test from 'node:test';
import assert from 'node:assert/strict';
import {INDIAN_LANGUAGE_CODES,resolveIndianLocale} from '../src/lib/i18n/locales.js';
import {workspaceCopy,orderStatusLabel,formatWorkspaceMoney} from '../src/lib/marketplace/workspace-copy.js';
import {sellerProductInput} from '../src/lib/seller/validation.js';
test('English is the default and every scheduled language has an explicit safe fallback',()=>{
 assert.equal(INDIAN_LANGUAGE_CODES.length,23);assert.equal(new Set(INDIAN_LANGUAGE_CODES).size,23);assert.equal(resolveIndianLocale().language,'en');
 for(const code of INDIAN_LANGUAGE_CODES){const result=resolveIndianLocale(code);assert.equal(result.requestedLanguage,code);assert.equal(result.language,code==='hi'?'hi':'en');assert.equal(workspaceCopy(code).orders,workspaceCopy(code==='hi'?'hi':'en').orders);}
 for(const value of [undefined,null,'bad tag','fr','<script>'])assert.equal(resolveIndianLocale(value).language,'en');
});

test('reviewed explicit Latin scripts override RTL language defaults without enabling missing translations',()=>{
 for(const code of ['ks','sd','ur']){
  const key=`${code}-latn`,result=resolveIndianLocale(`${code}-Latn-IN`,['en',key]);
  assert.equal(result.language,key);assert.equal(result.direction,'ltr');
  assert.equal(resolveIndianLocale(`${code}-Latn-IN`).language,'en');
 }
 assert.equal(resolveIndianLocale('ks-Arab-IN',['en','ks-arab']).direction,'rtl');
});

test('seller drafts accept regional-script names through the existing validated contract',()=>{
 const category='10000000-0000-4000-8000-000000000001';
 for(const title of ['தமிழ் உணவு','বাংলা খাবার','తెలుగు ఆహారం','اردو خوراک','ಕನ್ನಡ ಆಹಾರ']){
  const form=new FormData();
  for(const [key,value] of Object.entries({title,description:'Synthetic local draft only',category_id:category,base_amount_minor:'499'}))form.set(key,value);
  form.append('species_ids',category);
  const result=sellerProductInput(form,new Map([[category,new Set([category])]]));
  assert.equal(result.title,title);assert.equal(result.baseAmountMinor,49900);
  assert.ok(result.slug.length>0);
 }
});
test('regional tags reuse reviewed Hindi while untranslated RTL content is labelled English/LTR',()=>{
 assert.equal(workspaceCopy('hi-IN').orders,workspaceCopy('hi').orders);assert.equal(orderStatusLabel('confirmed','HI_in'),orderStatusLabel('confirmed','hi'));assert.equal(formatWorkspaceMoney(12300,'INR','hi-IN'),formatWorkspaceMoney(12300,'INR','hi'));
 const fallback=resolveIndianLocale('ur-IN');assert.equal(fallback.language,'en');assert.equal(fallback.direction,'ltr');assert.equal(fallback.fallback,true);
});
test('reviewed future script/language keys and extra regional codes extend without changing global defaults',()=>{
 const rtl=resolveIndianLocale('ks-Arab-IN',['en','ks-arab']);assert.equal(rtl.language,'ks-arab');assert.equal(rtl.direction,'rtl');
 const deva=resolveIndianLocale('ks-Deva',['en','ks-deva']);assert.equal(deva.direction,'ltr');
 const extra=resolveIndianLocale('kha-IN',['en','kha'],['kha']);assert.equal(extra.language,'kha');assert.equal(resolveIndianLocale('kha').language,'en');
 assert.equal(resolveIndianLocale('hi-IN',['en','hi-in']).locale,'hi-in');
});
