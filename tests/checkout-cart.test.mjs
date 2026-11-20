import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutCartReader,CheckoutCartError} from '../src/lib/commerce/checkout-cart.js';
const id='abcdefab-1234-4abc-8def-abcdefabcdef',variant='12345678-1234-4abc-8def-abcdefabcdef',owner='10000000-0000-4000-8000-000000000001';
const account=()=>({apiVersion:1,state:'available',profileId:owner,marketCode:'IN',cart:{id:owner,market_code:'IN',currency_code:'INR',status:'active'},items:[{id:variant,listing_id:id,product_variant_id:variant,quantity:2,title:'Saved product'}]});
test('checkout snapshots canonicalize UUID pairs and aggregate quantities without carrying stored prices or authority',async()=>{
 const reader=createCheckoutCartReader({readBrowser:()=>JSON.stringify([{id,productVariantId:variant,quantity:2,pricePaise:1,sellerId:owner,paymentStatus:'paid'},{id:id.toUpperCase(),productVariantId:variant.toUpperCase(),quantity:3}])});
 const cart=await reader.capture('browser');assert.deepEqual(cart.lines,[{listingId:id,productVariantId:variant,quantity:5}]);assert.doesNotMatch(JSON.stringify(cart),/pricePaise|sellerId|paymentStatus/);
});
test('case-insensitive aggregate quantity above 99, malformed variants, unsafe quantities and excess selections stop preparation',async()=>{
 for(const items of [[{id,quantity:99},{id:id.toUpperCase(),quantity:1}],[{id,quantity:1,productVariantId:'bad'}],[{id,quantity:1.2}],Array.from({length:51},()=>({id,quantity:1}))]){
  await assert.rejects(createCheckoutCartReader({readBrowser:()=>JSON.stringify(items)}).capture('browser'),error=>error instanceof CheckoutCartError&&error.code==='invalid_cart');
 }
});
test('storage exceptions and malformed storage remain distinct from an empty basket and never fall back to an account cart',async()=>{
 let accountReads=0;for(const readBrowser of [()=>{throw Error('PRIVATE');},()=>'{bad',()=>'{"items":[]}']){
 const reader=createCheckoutCartReader({readBrowser,readAccount:async()=>{accountReads++;return account();}});await assert.rejects(reader.capture('browser'),error=>error instanceof CheckoutCartError&&!error.message.includes('PRIVATE'));}
 assert.equal(accountReads,0);await assert.rejects(createCheckoutCartReader({readBrowser:()=>null}).capture('browser'),{code:'empty_cart'});
});
test('equivalent reordered browser selections keep the same fingerprint; quantity and variant changes invalidate it',async()=>{
 let rows=[{id,quantity:1},{id,productVariantId:variant,quantity:2}];const reader=createCheckoutCartReader({readBrowser:()=>JSON.stringify(rows)}),cart=await reader.capture('browser');rows.reverse();await reader.assertUnchanged(cart);rows[0].quantity=3;await assert.rejects(reader.assertUnchanged(cart),{code:'cart_changed'});
});
test('storage becoming unavailable during review is not treated as a successful empty basket',async()=>{
 let blocked=false;const reader=createCheckoutCartReader({readBrowser:()=>{if(blocked)throw Error('blocked');return JSON.stringify([{id,quantity:1}]);}});const cart=await reader.capture('browser');blocked=true;await assert.rejects(reader.assertUnchanged(cart),{code:'storage_unavailable'});
});
test('account identity, cart identity and saved quantities are rechecked while caller prices remain irrelevant',async()=>{
 let saved=account(),reads=0;const reader=createCheckoutCartReader({readAccount:async input=>{assert.equal(input.command,undefined);reads++;return saved;}}),cart=await reader.capture('account');await reader.assertUnchanged(cart);assert.equal(reads,2);
 saved={...account(),profileId:variant};await assert.rejects(reader.assertUnchanged(cart),{code:'account_changed'});saved={...account(),cart:{...account().cart,id:variant}};await assert.rejects(reader.assertUnchanged(cart),{code:'cart_changed'});
});
test('invalid source and non-India saved carts fail closed before price/stock review',async()=>{
 const reader=createCheckoutCartReader({readAccount:async()=>({...account(),marketCode:'US',cart:{...account().cart,market_code:'US',currency_code:'USD'}})});await assert.rejects(reader.capture('other'),{code:'invalid_source'});await assert.rejects(reader.capture('account'),{code:'invalid_market'});
});
test('an account switch to an empty saved cart still invalidates the old account context',async()=>{
 let saved=account();const reader=createCheckoutCartReader({readAccount:async()=>saved}),cart=await reader.capture('account');saved={...account(),profileId:variant,items:[],cart:null};await assert.rejects(reader.assertUnchanged(cart),{code:'account_changed'});
});
