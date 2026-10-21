import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as navigation from '../src/lib/marketplace/navigation.js';
import {sellerBusinessInput} from '../src/lib/seller/validation.js';
import {parseAppointmentSlotQuery,AppointmentSlotQueryError} from '../src/lib/services/appointment-slots.js';
import {mountNativeComponent} from './native-component-harness.mjs';
test('four shared hero destinations use actual routes/assets with English fallback',()=>{
 const tiles=navigation.marketplaceDestinations();assert.equal(tiles.length,4);assert.equal(new Set(tiles.map(t=>t.href)).size,4);
 assert.deepEqual(navigation.marketplaceDestinations('ta-IN'),tiles);
 for(const tile of tiles){assert.ok(fs.existsSync(new URL('../public'+tile.image,import.meta.url)));assert.ok(fs.existsSync(new URL('../src/pages'+(tile.href==='/shop'?'/shop/index.astro':tile.href+'.astro'),import.meta.url)));}
 assert.deepEqual(navigation.marketplaceNavigation('products'),{tab:'shop',path:null,clearFilters:true});
 assert.equal(navigation.marketplaceNavigation('services').tab,'services');assert.equal(navigation.marketplaceNavigation('appointments').path,'/appointments');
 assert.throws(()=>navigation.marketplaceNavigation('admin'));
});
test('actual native shortcuts invoke all four bounded navigation actions',()=>{
 const calls=[];const ui=mountNativeComponent('MarketplaceShortcuts.tsx','MarketplaceShortcuts',{onNavigate:key=>calls.push(key),imageBaseUrl:'https://test.example.invalid',language:'en'},
 {'../../src/lib/marketplace/navigation.js':navigation,'./ProductPhoto':{ProductPhoto:'ProductPhoto'}});
 const buttons=ui.nodes().filter(n=>n.type==='Pressable');assert.equal(buttons.length,4);
 for(const button of buttons)button.props.onPress();assert.deepEqual(calls,['products','animals','services','appointments']);
});
test('seller onboarding website validation matches SQL URL limits without URL-parser normalization bypass',()=>{
 const form=new FormData();form.set('display_name','Test farm');form.set('website_url','https://example.in');assert.equal(sellerBusinessInput(form).websiteUrl,'https://example.in');
 for(const value of ['https://exa\nmple.in','https://example.in/has space','https://example.in/'+ 'a'.repeat(2048),'https://user:pass@example.in']){
  form.set('website_url',value);assert.throws(()=>sellerBusinessInput(form));
 }
 form.set('website_url','https://example.in/%20allowed');assert.doesNotThrow(()=>sellerBusinessInput(form));
});
test('availability rejects normalized impossible dates and duplicate fields; preserves leap day and offsets',()=>{
 const serviceListingId='11111111-1111-4111-8111-111111111111';
 const query=value=>new URLSearchParams({serviceListingId,from:value,to:'2028-03-02T00:00:00Z'});
 const now=Date.parse('2028-02-01T00:00:00Z');
 for(const value of ['2028-02-30T10:00:00Z','2028-04-31T10:00:00Z','2028-02-29T24:00:00Z'])assert.throws(()=>parseAppointmentSlotQuery(query(value),now),AppointmentSlotQueryError);
 assert.equal(parseAppointmentSlotQuery(query('2028-02-29T05:30:00+05:30'),now).from,'2028-02-29T00:00:00.000Z');
 for(const field of ['serviceListingId','from','to']){const p=query('2028-02-29T00:00:00Z');p.append(field,p.get(field));assert.throws(()=>parseAppointmentSlotQuery(p,now),/Duplicate/);}
});
