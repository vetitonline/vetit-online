import test from 'node:test';import assert from 'node:assert/strict';
import {requestCheckoutQuote} from '../src/lib/commerce/quote-client.js';import {createNativeCheckoutReview} from '../mobile/src/checkout-review.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',lines=[{listingId:id,quantity:2}];
const quote={apiVersion:1,state:'quote_only',marketCode:'IN',currencyCode:'INR',lines:[{...lines[0],title:'Synthetic pet food',category:'Food',sellerName:'Synthetic seller',unitAmountMinor:5000,lineAmountMinor:10000,currencyCode:'INR'}],subtotalMinor:10000,deliveryMinor:null,feesMinor:null,totalMinor:null,checkoutEnabled:false};
const origin={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
function session(){let owner=id;const listeners=new Set();return{snapshot:()=>owner?{userId:owner,reviewerHint:false}:null,getSession:async()=>{if(!owner)throw Object.assign(Error('Signed out'),{status:401});return{userId:owner,accessToken:'synthetic-token'};},subscribe:callback=>{listeners.add(callback);return()=>listeners.delete(callback);},signout:()=>{owner=null;for(const listener of listeners)listener(null);}};}
test('shared quote client supports native bearer without cookies or redirects and still denies payment responses',async()=>{
 let calls=0;const fetchImpl=async(_url,options)=>{calls++;assert.equal(options.headers.authorization,'Bearer synthetic-token');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.deepEqual(JSON.parse(options.body),{lines});return new Response(JSON.stringify(quote));};
 assert.equal((await requestCheckoutQuote(lines,{baseUrl:origin.apiBaseUrl,accessToken:'synthetic-token',fetchImpl})).checkoutEnabled,false);
 await assert.rejects(requestCheckoutQuote(lines,{baseUrl:origin.apiBaseUrl,accessToken:'bad token',fetchImpl}));assert.equal(calls,1);
 await assert.rejects(requestCheckoutQuote(lines,{baseUrl:origin.apiBaseUrl,accessToken:'synthetic-token',fetchImpl:async()=>new Response(JSON.stringify({...quote,checkoutEnabled:true}))}));
});
test('native quote runs once for double tap and clears private prices on signout',async()=>{
 const s=session(),states=[];let calls=0,finish;const host=createNativeCheckoutReview({...origin,session:s,lines,render:value=>states.push(value),read:async()=>{calls++;return new Promise(resolve=>{finish=resolve;});}});
 const pending=host.run();await host.run();await drainNativeTasks();assert.equal(calls,1);s.signout();finish(quote);await pending;assert.equal(states.at(-1).phase,'signin');assert.equal(states.at(-1).quote,null);assert.ok(!JSON.stringify(states).includes('synthetic-token'));host.dispose();
});
test('native quote verifies session again and rejects production before identity access',async()=>{
 let checks=0;const states=[];const s=session();s.getSession=async()=>{checks++;return{userId:id,accessToken:'synthetic-token'};};const host=createNativeCheckoutReview({...origin,session:s,lines,render:value=>states.push(value),read:async()=>quote});await host.run();assert.equal(checks,2);assert.equal(states.at(-1).phase,'ready');host.dispose();
 assert.throws(()=>createNativeCheckoutReview({...origin,apiBaseUrl:'https://vetit.online',session:{snapshot:()=>{throw Error('Should not inspect identity');}},lines,render(){}}));
});
test('actual native quote UI shows informational subtotal and clears on background without a payment action',async()=>{
 const ui=mountNativeComponent('NativeCheckoutReview.tsx','NativeCheckoutReview',{...origin,session:session(),lines,language:'en'},{'./checkout-review.js':{createNativeCheckoutReview:input=>createNativeCheckoutReview({...input,read:async()=>quote})}});
 ui.button('Check current prices').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/Synthetic pet food/);assert.match(ui.text(),/No order will be placed/);assert.equal(ui.button('Pay'),undefined);
 ui.appState('background');assert.ok(!ui.text().includes('Synthetic pet food'));ui.unmount();
});
test('cart changes hide an old quote immediately and reset the native review request',async()=>{
 const props={...origin,session:session(),lines,language:'en'};
 const ui=mountNativeComponent('NativeCheckoutReview.tsx','NativeCheckoutReview',props,{'./checkout-review.js':{createNativeCheckoutReview:input=>createNativeCheckoutReview({...input,read:async()=>quote})}});
 ui.button('Check current prices').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/Synthetic pet food/);
 props.lines=[{listingId:id,quantity:3}];ui.render();assert.ok(!ui.text().includes('Synthetic pet food'));assert.equal(ui.button('Check current prices').props.disabled,false);ui.unmount();
});
