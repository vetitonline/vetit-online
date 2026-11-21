import test from 'node:test';
import assert from 'node:assert/strict';
import {createSandboxChargeProviders} from '../src/lib/commerce/sandbox-charges.server.js';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const policy=()=>({reference:'synthetic-v1',deliveryPerSellerMinor:500,taxBasisPoints:1800,taxShipping:false,quoteTtlSeconds:300,postalPrefixes:['400']});
const context=()=>({customerId:id(1),currencyCode:'INR',request:{lines:[{listingId:id(2),productVariantId:id(3),quantity:2}],customer:{email:'synthetic@example.invalid'},deliveryAddress:{recipientName:'Synthetic',phone:'9876543210',addressLine1:'1 Test Road',city:'Mumbai',stateRegion:'Maharashtra',postalCode:'400001',countryCode:'IN'}},items:[{listingId:id(2),productVariantId:id(3),businessId:id(4),quantity:2,unitPriceMinor:10000}],subtotalMinor:20000});
const create=(config=policy())=>createSandboxChargeProviders({approved:true,policy:config,now:()=>1900000000000});
test('sandbox rates require approval and explicit bounded configuration without defaults',()=>{
 assert.throws(()=>createSandboxChargeProviders({policy:policy()}));
 for(const patch of [{deliveryPerSellerMinor:-1},{taxBasisPoints:10001},{taxShipping:'yes'},{quoteTtlSeconds:30},{postalPrefixes:[]},{postalPrefixes:['400','400']},{postalPrefixes:['*']},{reference:'bad value'}])assert.throws(()=>create({...policy(),...patch}));
});
test('rates snapshot configuration, charge per seller and calculate integer tax on configured basis',async()=>{
 const config=policy(),providers=create(config);config.deliveryPerSellerMinor=1;const input=context();
 const shipping=await providers.shipping.quote(input);assert.equal(shipping.amountMinor,500);assert.equal(providers.shipping.mode,'sandbox');assert.equal(shipping.expiresAt,new Date(1900000300000).toISOString());
 assert.equal((await providers.taxes.quote({...input,shipping})).amountMinor,3600);
 const taxed=create({...policy(),taxShipping:true});assert.equal((await taxed.taxes.quote({...input,shipping})).amountMinor,3690);
});
test('multiple variants for one seller share delivery; another seller adds a separate charge',async()=>{
 const providers=create(),input=context();input.request.lines.push({listingId:id(5),productVariantId:id(6),quantity:1});input.items.push({listingId:id(5),productVariantId:id(6),businessId:id(4),quantity:1,unitPriceMinor:100});input.subtotalMinor+=100;
 assert.equal((await providers.shipping.quote(input)).amountMinor,500);input.items[1].businessId=id(7);assert.equal((await providers.shipping.quote(input)).amountMinor,1000);
});
test('uncovered PIN, client totals, altered quantities and duplicate basis items fail closed',async()=>{
 for(const mutate of [input=>input.request.deliveryAddress.postalCode='560001',input=>input.subtotalMinor=1,input=>input.items[0].quantity=1,input=>input.items[0].unitPriceMinor=0,input=>{input.items.push(input.items[0]);}]){const input=context();mutate(input);await assert.rejects(create().shipping.quote(input));}
});
test('tax rejects manipulated delivery and uses half-up rounding without floating point',async()=>{
 const providers=create({...policy(),taxBasisPoints:5000}),input=context();input.items[0].unitPriceMinor=1;input.items[0].quantity=1;input.request.lines[0].quantity=1;input.subtotalMinor=1;
 const shipping=await providers.shipping.quote(input);assert.equal((await providers.taxes.quote({...input,shipping})).amountMinor,1);await assert.rejects(providers.taxes.quote({...input,shipping:{...shipping,amountMinor:1}}));
});
test('overflow charges are refused and no real provider call or credential is required',async()=>{
 const providers=create({...policy(),deliveryPerSellerMinor:Number.MAX_SAFE_INTEGER}),input=context();input.items.push({...input.items[0],listingId:id(5),productVariantId:id(6),businessId:id(7)});input.request.lines.push({...input.request.lines[0],listingId:id(5),productVariantId:id(6)});input.subtotalMinor*=2;await assert.rejects(providers.shipping.quote(input));
});
