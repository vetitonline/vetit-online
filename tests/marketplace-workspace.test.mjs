import test from 'node:test';
import assert from 'node:assert/strict';
import { createOrderWorkspace } from '../src/lib/buyer/order-workspace.js';
import { requestCheckoutQuote, QuoteClientError } from '../src/lib/commerce/quote-client.js';
import { canAddPreviewProduct, changePreviewCart, previewCartSubtotal } from '../src/lib/marketplace/preview-cart.js';
import { categoryNavigation } from '../src/lib/marketplace/category-navigation.js';
import { workspaceCopy, orderStatusLabel, formatWorkspaceMoney } from '../src/lib/marketplace/workspace-copy.js';
import { sellerListingState, filterSellerProducts } from '../src/lib/seller/workspace.js';
import { validateSellerImageSelection } from '../src/lib/seller/image-selection.js';
import { isProtectedPath } from '../src/lib/auth/navigation.js';
const id = '10000000-0000-4000-8000-000000000001';
const product = { id, title:'Synthetic product', category:'Food', sellerName:'Synthetic seller', priceMinor:12550, priceIsFrom:false, currencyCode:'INR' };
const history = (orders = [{id}], nextCursor = null) => ({apiVersion:1,state:'available',orders,nextCursor});
test('order workspace transitions through loading, list and empty states', async () => {
  const states = []; const workspace = createOrderWorkspace({read:async () => history([]),render:state => states.push(state)});
  await workspace.load(); assert.deepEqual(states.map(state => state.phase),['loading','empty']);
});
test('order detail is passed to the existing adapter with cancellation support', async () => {
  const states = []; let request;
  const detail = {order:{id},items:[],fulfilments:[],truncated:false};
  const workspace = createOrderWorkspace({read:async input => {request=input;return detail;},render:state => states.push(state)});
  await workspace.load({orderId:id}); assert.equal(request.orderId,id); assert.ok(request.signal instanceof AbortSignal); assert.equal(states.at(-1).detail,detail);
});
test('load more deduplicates records and stops repeated cursor loops', async () => {
  const states = [], results = [history([{id}],'cursor'),history([{id},{id:'other'}],'cursor')];
  const workspace = createOrderWorkspace({read:async () => results.shift(),render:state => states.push(state)});
  await workspace.load(); await workspace.load({more:true});
  assert.deepEqual(states.at(-1).orders.map(order=>order.id),[id,'other']); assert.equal(states.at(-1).nextCursor,null);
});
test('auth, not-found and backend errors are distinct and do not expose error text', async () => {
  for (const [status,phase] of [[401,'signin'],[404,'notfound'],[503,'error']]) {
    const states = []; const workspace = createOrderWorkspace({read:async()=>{throw Object.assign(new Error('SYNTHETIC_PRIVATE'),{status});},render:state=>states.push(state)});
    await workspace.load(); assert.equal(states.at(-1).phase,phase); assert.equal(JSON.stringify(states).includes('SYNTHETIC_PRIVATE'),false);
  }
});
test('older order responses cannot overwrite a newer detail request', async () => {
  const states = []; let finish; let calls = 0;
  const workspace = createOrderWorkspace({read:input=>++calls===1?new Promise(resolve=>{finish=resolve;}):Promise.resolve({order:{id},items:[],fulfilments:[]}),render:state=>states.push(state)});
  const pending = workspace.load(); await workspace.load({orderId:id}); finish(history()); await pending;
  assert.equal(states.at(-1).mode,'detail');
});
test('disposal aborts order requests and prevents stale or further renders', async () => {
  const states = []; let finish,signal;
  const workspace = createOrderWorkspace({read:input=>{signal=input.signal;return new Promise(resolve=>{finish=resolve;});},render:state=>states.push(state)});
  const pending = workspace.load(); workspace.dispose(); finish(history()); await pending; await workspace.load();
  assert.equal(signal.aborted,true); assert.equal(states.length,1);
});
test('failed pagination preserves already loaded orders for retry', async () => {
  const states = []; let count=0;
  const workspace = createOrderWorkspace({read:async()=>{if(count++)throw Object.assign(new Error(),{status:503});return history([{id}],'cursor');},render:state=>states.push(state)});
  await workspace.load(); await workspace.load({more:true}); assert.equal(states.at(-1).phase,'error'); assert.equal(states.at(-1).orders.length,1); assert.equal(states.at(-1).nextCursor,'cursor');
});
function quoteBody() {return {apiVersion:1,state:'quote_only',marketCode:'IN',currencyCode:'INR',checkoutEnabled:false,deliveryMinor:null,feesMinor:null,totalMinor:null,subtotalMinor:25100,lines:[{listingId:id,quantity:2,title:product.title,category:product.category,sellerName:product.sellerName,unitAmountMinor:12550,lineAmountMinor:25100,currencyCode:'INR'}]};}
test('quote client submits only IDs and quantity, uses cookies and cannot enable payment', async () => {
  let sent;
  const quote=await requestCheckoutQuote([{listingId:id,quantity:2,priceMinor:1}],{baseUrl:'http://localhost:4321',fetchImpl:async(url,options)=>{sent={url,options};return new Response(JSON.stringify({...quoteBody(),secret:'SYNTHETIC_PRIVATE'}));}});
  assert.deepEqual(JSON.parse(sent.options.body),{lines:[{listingId:id,quantity:2}]}); assert.equal(sent.options.credentials,'same-origin'); assert.equal(sent.options.cache,'no-store'); assert.equal(quote.subtotalMinor,25100); assert.equal(quote.checkoutEnabled,false); assert.equal(quote.totalMinor,null); assert.equal('secret' in quote,false);
});
test('quote client rejects mismatched amounts, quantities, duplicates and enabled checkout', async () => {
  for (const mutate of [body=>body.subtotalMinor++,body=>body.lines[0].quantity=3,body=>body.lines.push(body.lines[0]),body=>body.checkoutEnabled=true,body=>body.totalMinor=25100,body=>body.lines[0].lineAmountMinor=1,body=>body.lines[0].unitAmountMinor=Number.MAX_SAFE_INTEGER]) {
    const body=quoteBody();mutate(body);
    await assert.rejects(requestCheckoutQuote([{listingId:id,quantity:2}],{baseUrl:'http://localhost',fetchImpl:async()=>new Response(JSON.stringify(body))}),error=>error instanceof QuoteClientError&&error.status===503);
  }
});
test('quote client handles sign-in, stale price and unavailable errors without raw bodies', async () => {
  for (const status of [401,409,422,503]) await assert.rejects(requestCheckoutQuote([{listingId:id,quantity:1}],{baseUrl:'http://localhost',fetchImpl:async()=>new Response('SYNTHETIC_PRIVATE',{status})}),error=>error.status===status&&!error.message.includes('SYNTHETIC_PRIVATE'));
});
test('invalid quote requests and unsafe origins never reach transport', async () => {
  let count=0; const fetchImpl=async()=>{count++;throw Error();};
  for(const [lines,baseUrl] of [[[],'http://localhost'],[[{listingId:id,quantity:100}],'http://localhost'],[[{listingId:id,quantity:1}],'https://user:synthetic@example.invalid']])await assert.rejects(requestCheckoutQuote(lines,{baseUrl,fetchImpl}));
  assert.equal(count,0);
});
test('preview basket requires a known positive fixed INR price', () => {
  assert.equal(canAddPreviewProduct(product),true);
  for(const changed of [{priceMinor:null},{priceMinor:0},{priceMinor:-1},{priceMinor:NaN},{priceMinor:1.5},{priceIsFrom:true},{currencyCode:'USD'}])assert.equal(canAddPreviewProduct({...product,...changed}),false);
});
test('preview basket quantity and remove preserve immutable state and limits', () => {
  const initial=[{product,quantity:98}];const added=changePreviewCart(initial,{action:'add',product});
  assert.equal(added[0].quantity,99);assert.equal(initial[0].quantity,98);assert.equal(changePreviewCart(added,{action:'add',product})[0].quantity,99);
  assert.equal(changePreviewCart(added,{action:'quantity',id,quantity:1})[0].quantity,1);
  for(const quantity of [0,100,1.5,NaN])assert.throws(()=>changePreviewCart(added,{action:'quantity',id,quantity}));
  assert.deepEqual(changePreviewCart(added,{action:'remove',id}),[]);
});
test('preview basket caps distinct products and refuses unpriced additions', () => {
  const lines=Array.from({length:50},(_,i)=>({product:{...product,id:String(i)},quantity:1}));
  assert.throws(()=>changePreviewCart(lines,{action:'add',product}));assert.throws(()=>changePreviewCart([],{action:'add',product:{...product,priceMinor:null}}));
});
test('preview subtotal never treats unknown or overflowing amounts as zero', () => {
  assert.equal(previewCartSubtotal([{product,quantity:2}]),25100);assert.equal(previewCartSubtotal([]),0);
  assert.equal(previewCartSubtotal([{product:{...product,priceMinor:null},quantity:1}]),null);
  assert.equal(previewCartSubtotal([{product:{...product,priceMinor:Number.MAX_SAFE_INTEGER},quantity:2}]),null);
});
const categories=[{id:'root',slug:'food',label:'Food',parentId:null,species:[]},{id:'child',slug:'dog-food',label:'Dog food',parentId:'root',species:['dog']},{id:'cat',slug:'cat-food',label:'Cat food',parentId:'root',species:['cat']}];
test('taxonomy navigation retains required parent and only applicable children', () => {
  const result=categoryNavigation(categories,'dog','food');assert.deepEqual(result.roots.map(row=>row.id),['root']);assert.deepEqual(result.children.map(row=>row.id),['child']);
});
test('taxonomy navigation provides breadcrumbs and siblings without invented entries', () => {
  const result=categoryNavigation(categories,undefined,'dog-food');assert.deepEqual(result.breadcrumbs.map(row=>row.id),['root','child']);assert.equal(result.children.length,2);assert.deepEqual(categoryNavigation(categories,'horse','missing').roots,[]);
});
test('taxonomy cycles terminate safely', () => {
  const cycle=[{...categories[0],parentId:'child'},categories[1]];assert.ok(categoryNavigation(cycle,'dog','dog-food').breadcrumbs.length<=2);
});
test('English and Hindi workspace labels have matching keys and safe status fallback', () => {
  assert.deepEqual(Object.keys(workspaceCopy('en')),Object.keys(workspaceCopy('hi')));assert.equal(workspaceCopy('unknown').orders,'Your orders');assert.notEqual(orderStatusLabel('shipped','hi'),orderStatusLabel('shipped','en'));assert.equal(orderStatusLabel('<script>'),'Status unavailable');assert.match(formatWorkspaceMoney(12550),/125\.50/);assert.equal(formatWorkspaceMoney(-1),'—');
});
test('seller filters combine status, owned-business subset and literal search', () => {
  const products=[{title:'Dog Food',categoryName:'Food',moderation_status:'draft',business_id:'a'},{title:'Cat Food',categoryName:'Food',moderation_status:'submitted',business_id:'b'}];
  assert.equal(filterSellerProducts(products,{business:'a',status:'draft',query:' FOOD '}).length,1);assert.equal(filterSellerProducts(products,{business:'unknown'}).length,0);assert.equal(filterSellerProducts(products,{query:'<script>'}).length,0);
});
test('seller review labels do not grant editable published/submitted or unknown states', () => {
  assert.equal(sellerListingState('draft').editable,true);assert.equal(sellerListingState('rejected').editable,true);
  for(const status of ['submitted','published','unknown'])assert.equal(sellerListingState(status).editable,false);
});
test('image previews enforce shared image types, remaining slots and bounded sizes', () => {
  assert.equal(validateSellerImageSelection([{type:'image/jpeg',size:100}],1),null);assert.equal(validateSellerImageSelection([],0),null);
  for(const [files,slots] of [[[{type:'image/svg+xml',size:100}],1],[[{type:'image/png',size:0}],1],[[{type:'image/png',size:5*1024*1024+1}],1],[[{type:'image/png',size:100}],0],[[],6]])assert.equal(typeof validateSellerImageSelection(files,slots),'string');
});
test('buyer order and checkout routes receive protected-session handling', () => {
  for(const path of ['/orders','/orders/','/checkout','/checkout/'])assert.equal(isProtectedPath(path),true);assert.equal(isProtectedPath('/products'),false);
});
