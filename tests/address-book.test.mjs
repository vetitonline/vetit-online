import test from 'node:test';
import assert from 'node:assert/strict';
import { createAddressBookHandler } from '../src/lib/buyer/address-book-api.js';
import { requestAddressBook } from '../src/lib/buyer/address-book-client.js';
import { addressFromRow,normalizeAddressBook } from '../src/lib/buyer/address-book-contract.js';
import { createAddressBookWorkspace } from '../src/lib/buyer/address-book-workspace.js';
import { createCheckoutAddressPicker } from '../src/lib/commerce/checkout-address-picker.js';
import { createCheckoutHandler } from '../src/lib/commerce/checkout-api.js';
import { addressDatabase,addressRow,sampleAddress,alice,bob } from './address-book-fixture.mjs';
const origin='https://test.invalid';
function setup({rows=[],owner=alice,state='authenticated',rpc}={}){
  const db=addressDatabase(rows);
  const handler=createAddressBookHandler({authenticate:async()=>({state,user:{id:owner},supabase:db.client(owner)}),rpc:rpc??db.rpc});
  return{db,handler,fetch:async(url,options)=>handler({request:new Request(url,{...options,headers:{...options.headers,...(!options.headers.authorization?{origin}:{})}})})};
}
function mutation(body,headers={},method='POST',search=''){return{request:new Request(origin+'/api/buyer/addresses'+search,{method,headers:{origin,'x-vetit-profile-id':alice,'content-type':'application/json',...headers},...(method==='POST'?{body:JSON.stringify(body)}:{})})};}
test('address read is private, complete and explicitly scoped to the verified profile',async()=>{
  const own=addressRow(sampleAddress),foreign=addressRow(sampleAddress,bob),s=setup({rows:[own,foreign]});
  const response=await s.handler({request:new Request(origin+'/api/buyer/addresses?profileId='+bob)}),body=await response.json();
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(body.profileId,alice);assert.equal(body.addresses.length,1);assert.equal(body.addresses[0].id,own.id);assert.equal(body.addresses[0].profile_id,undefined);
  assert.ok(s.db.calls[0].steps.some(step=>step[0]==='eq'&&step[1]==='profile_id'&&step[2]===alice));assert.deepEqual(s.db.calls[0].steps.at(-1),['limit',101]);
});
test('unauthenticated and unavailable identities cannot query saved addresses',async()=>{
  for(const state of ['unauthenticated','unavailable']){const s=setup({state});assert.equal((await s.handler({request:new Request(origin+'/api/buyer/addresses')})).status,state==='unavailable'?503:401);assert.equal(s.db.calls.length,0);}
});
test('mutations reject cross-origin requests and stale account forms before any write',async()=>{
  for(const headers of [{origin:'https://foreign.invalid'},{origin:''},{'sec-fetch-site':'cross-site'},{'x-vetit-profile-id':bob}]){const s=setup();assert.ok([403,409].includes((await s.handler(mutation(sampleAddress,headers))).status));assert.equal(s.db.rpcs.length,0);assert.equal(s.db.rows.length,0);}
});
test('save delegates allowlisted fields, preserves other accounts and atomically switches defaults through existing RPC',async()=>{
  const old=addressRow({...sampleAddress,isDefault:true}),foreign=addressRow({...sampleAddress,isDefault:true},bob),s=setup({rows:[old,foreign]});
  const response=await s.handler(mutation({...sampleAddress,isDefault:true,profile_id:bob,role:'admin'}));assert.equal(response.status,201);
  const body=await response.json();assert.equal(s.db.rows.find(row=>row.id===old.id).is_default,false);assert.equal(s.db.rows.find(row=>row.id===foreign.id).is_default,true);assert.equal(s.db.rows.find(row=>row.id===body.addressId).profile_id,alice);
  assert.equal(s.db.rpcs[0][0],'save_my_address');assert.equal('profile_id' in s.db.rpcs[0][1],false);
});
test('foreign updates and deletes cannot affect another customer',async()=>{
  const foreign=addressRow(sampleAddress,bob),s=setup({rows:[foreign]});
  assert.equal((await s.handler(mutation({...sampleAddress,id:foreign.id}))).status,404);assert.equal(s.db.rpcs.length,0);
  assert.equal((await s.handler(mutation(null,{},'DELETE','?id='+foreign.id))).status,404);assert.equal(s.db.rows.length,1);
  assert.ok(s.db.calls.at(-1).steps.some(step=>step[0]==='eq'&&step[1]==='profile_id'&&step[2]===alice));
});
test('malformed, oversized and unsupported input cannot reach an address write',async()=>{
  for(const [body,headers,status] of [[{...sampleAddress,recipientName:''},{},400],[{...sampleAddress,addressLine1:'bad\naddress'},{},400],[{...sampleAddress,ignored:'x'.repeat(5000)},{},413],[sampleAddress,{'content-type':'text/plain'},415]]){const s=setup();assert.equal((await s.handler(mutation(body,headers))).status,status);assert.equal(s.db.rpcs.length,0);}
});
test('native bearer and browser cookie clients share the real handler contract and identity binding',async()=>{
  for(const accessToken of [undefined,'synthetic.test.token']){
    const s=setup();const fetchImpl=async(url,options)=>{assert.equal(options.credentials,accessToken?'omit':'same-origin');assert.equal(options.redirect,'error');return s.fetch(url,options);};
    const initial=await requestAddressBook({baseUrl:origin,accessToken,fetchImpl});assert.equal(initial.profileId,alice);
    const saved=await requestAddressBook({baseUrl:origin,accessToken,fetchImpl,profileId:alice,command:{action:'save',address:sampleAddress}});assert.equal(saved.state,'saved');
    const book=await requestAddressBook({baseUrl:origin,accessToken,fetchImpl});assert.equal(book.addresses[0].id,saved.id);
    await requestAddressBook({baseUrl:origin,accessToken,fetchImpl,profileId:alice,command:{action:'remove',id:saved.id}});assert.equal(s.db.rows.length,0);
  }
});
test('truncated, duplicated and inconsistent default results fail closed',async()=>{
  const row=addressRow(sampleAddress);
  for(const addresses of [[row,row],[addressRow({...sampleAddress,isDefault:true}),addressRow({...sampleAddress,isDefault:true})]])assert.throws(()=>normalizeAddressBook({apiVersion:1,state:'available',profileId:alice,addresses}));
  const s=setup({rows:Array.from({length:101},()=>addressRow(sampleAddress))});assert.equal((await s.handler({request:new Request(origin+'/api/buyer/addresses')})).status,503);
});
test('uncertain writes and malformed acknowledgements are not retried or exposed as successful saves',async()=>{
  let calls=0;await assert.rejects(requestAddressBook({baseUrl:origin,profileId:alice,command:{action:'save',address:sampleAddress},fetchImpl:async()=>{calls++;throw Error('offline');}}),/Reload/);assert.equal(calls,1);
  const s=setup({rpc:async()=>({data:null,error:null})});assert.equal((await s.handler(mutation(sampleAddress))).status,503);
  const error=setup({rpc:async()=>({data:null,error:{code:'XX000',message:'PRIVATE SQL'}})});assert.equal((await(await error.handler(mutation(sampleAddress))).text()).includes('PRIVATE'),false);
});
test('workspace confirms creates/updates/removal and coalesces repeated save taps',async()=>{
  const s=setup(),states=[];const read=options=>requestAddressBook({...options,baseUrl:origin,fetchImpl:s.fetch});const ui=createAddressBookWorkspace({read,render:state=>states.push(state)});
  await ui.load();const first=ui.mutate({action:'save',address:sampleAddress});await ui.mutate({action:'save',address:sampleAddress});await first;
  assert.equal(s.db.rpcs.length,1);assert.equal(states.at(-1).phase,'ready');const saved=states.at(-1).book.addresses[0];
  await ui.mutate({action:'save',address:{...saved,label:'Work',isDefault:true}});assert.equal(states.at(-1).book.addresses[0].label,'Work');
  await ui.mutate({action:'remove',id:saved.id});assert.deepEqual(states.at(-1).book.addresses,[]);
});
test('failed or stale saves lock editing until explicit reload and do not mistake an existing address for a create',async()=>{
  const saved=addressFromRow(addressRow(sampleAddress)),states=[];let writes=0;
  const ui=createAddressBookWorkspace({render:state=>states.push(state),read:async options=>{if(options.command){writes++;return{state:'saved',id:saved.id};}return{profileId:alice,addresses:[saved]};}});
  await ui.load();await ui.mutate({action:'save',address:sampleAddress});assert.equal(states.at(-1).phase,'error');assert.equal(states.at(-1).book,null);
  await ui.mutate({action:'save',address:sampleAddress});assert.equal(writes,1);await ui.load();assert.equal(states.at(-1).phase,'ready');
});
test('account changes and disposal suppress pending private reads',async()=>{
  let finish,signal;const states=[];const ui=createAddressBookWorkspace({render:state=>states.push(state),read:options=>{signal=options.signal;return new Promise(resolve=>{finish=resolve;});}});
  const pending=ui.load();ui.clear();finish({profileId:alice,addresses:[]});await pending;assert.equal(signal.aborted,true);assert.equal(states.at(-1).phase,'signin');
  const later=ui.load();ui.dispose();finish({profileId:alice,addresses:[]});await later;assert.equal(states.at(-1).phase,'loading');
});
test('checkout picker loads without overwriting manual fields and validates copied Indian delivery details',async()=>{
  const saved=addressFromRow(addressRow({...sampleAddress,isDefault:true})),applied=[],states=[];
  const picker=createCheckoutAddressPicker({read:async()=>({profileId:alice,addresses:[saved]}),render:state=>states.push(state),apply:(...args)=>applied.push(args)});
  await picker.load();assert.equal(applied.length,0);picker.choose(saved.id);assert.equal(applied[0][1],alice);assert.equal(applied[0][0].locality,'Test locality');assert.equal('isDefault' in applied[0][0],false);
  for(const changed of [{phone:null},{postalCode:null},{countryCode:'US'}]){const bad={...saved,...changed};const ui=createCheckoutAddressPicker({read:async()=>({profileId:alice,addresses:[bad]}),render(){},apply(){throw Error('Must not apply');}});await ui.load();assert.throws(()=>ui.choose(bad.id),/Indian delivery/);}
});
test('checkout rejects a copied-address account mismatch before invoking catalogue or shipping adapters',async()=>{
  let calls=0;const handler=createCheckoutHandler({authenticate:async()=>({state:'authenticated',user:{id:bob}}),dependencies:async()=>{calls++;throw Error('Not allowed');}});
  const r=await handler({request:new Request(origin+'/api/checkout/review',{method:'POST',headers:{origin,'content-type':'application/json','x-vetit-profile-id':alice},body:'{}'})});
  assert.equal(r.status,409);assert.equal(calls,0);
});
test('legacy incomplete addresses remain editable and unknown country/coordinate types are never invented',()=>{
  const row=addressRow({...sampleAddress,phone:null,postalCode:'old-code'});
  assert.equal(addressFromRow(row).postalCode,'old-code');
  assert.throws(()=>addressFromRow({...row,country_code:undefined}));assert.throws(()=>addressFromRow({...row,latitude:'1'}));
});
test('picker clears late private results after identity changes',async()=>{
  let finish;const states=[],saved=addressFromRow(addressRow(sampleAddress));
  const picker=createCheckoutAddressPicker({read:()=>new Promise(resolve=>{finish=resolve;}),render:state=>states.push(state),apply(){throw Error('Must not apply');}});
  const pending=picker.load();picker.clear();finish({profileId:alice,addresses:[saved]});await pending;
  assert.equal(states.at(-1).book,null);assert.equal(picker.choose(saved.id),undefined);
});
test('server-detected account changes clear private workspace state rather than retaining an editable draft',async()=>{
  const states=[];let reads=0;const saved=addressFromRow(addressRow(sampleAddress));
  const ui=createAddressBookWorkspace({render:state=>states.push(state),read:async options=>{if(options.command)return{state:'saved',id:saved.id};return{profileId:++reads===1?alice:bob,addresses:[saved]};}});
  await ui.load();await ui.mutate({action:'save',address:saved});assert.equal(states.at(-1).phase,'signin');assert.equal(states.at(-1).book,null);
});
