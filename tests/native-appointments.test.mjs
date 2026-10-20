import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAppointments,appointmentCopy,appointmentTime} from '../mobile/src/appointments.js';
import {getAppointmentDashboard} from '../src/lib/services/appointment-lifecycle-client.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',business='10000000-0000-4000-8000-000000000002',service='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004';
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const data=()=>({bookings:[{id,service_listing_id:service,status:'confirmed',lifecycle_revision:1,requested_start:'2026-10-21T10:00:00Z',requested_end:'2026-10-21T10:30:00Z',price_minor:10000,currency_code:'INR',customer_profile_id:'private-profile',internal:'private-note'}],providerBusinesses:[{id:business,display_name:'Synthetic provider'}],services:[{id:service,title:'Synthetic consultation'}],slots:[],events:[],waitlist:[],offers:[],notifications:[],policies:[],payments:[],refunds:[],truncated:false});
function session(){let owner=id;const listeners=new Set();return{snapshot:()=>owner?{userId:owner}:null,getSession:async()=>{if(!owner)throw Object.assign(Error('Synthetic expired'),{status:401});return{userId:owner,accessToken:'synthetic-token'};},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:value=>{owner=value;for(const fn of listeners)fn(owner?{userId:owner}:null);}};}

test('native appointment transport uses verified bearer, GET only, no cookies or redirects; snapshots strip private rows',async()=>{
 const states=[],calls=[];const host=createNativeAppointments({...origins,session:session(),render:s=>states.push(s),read:options=>getAppointmentDashboard({...options,fetchImpl:async(url,init)=>{calls.push({url,init});return Response.json({apiVersion:1,state:'available',data:data()});}})});
 await host.load();assert.equal(states.at(-1).phase,'ready');await host.load(business);
 assert.equal(new URL(calls[1].url).searchParams.get('businessId'),business);
 for(const {init} of calls){assert.equal(init.method,'GET');assert.equal(init.credentials,'omit');assert.equal(init.redirect,'error');assert.equal(init.cache,'no-store');assert.equal(init.headers.authorization,'Bearer synthetic-token');}
 assert.ok(!JSON.stringify(states).match(/synthetic-token|private-profile|private-note|customer_profile_id/));assert.equal(states.at(-1).services[0].title,'Synthetic consultation');host.dispose();
 await getAppointmentDashboard({baseUrl:origins.apiBaseUrl,fetchImpl:async(_url,init)=>{assert.equal(init.credentials,'same-origin');assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,undefined);return Response.json({apiVersion:1,state:'available',data:data()});}});
});
test('provider selection requires a verified returned membership and rechecks revoked membership',async()=>{
 const states=[];let reads=0;const host=createNativeAppointments({...origins,session:session(),render:s=>states.push(s),read:async()=>{reads++;return reads>1?{...data(),providerBusinesses:[]}:data();}});
 await host.load(business);assert.equal(states.at(-1).phase,'denied');assert.equal(reads,0);
 await host.load();await host.load(other);assert.equal(reads,1);await host.load(business);assert.equal(states.at(-1).phase,'denied');assert.deepEqual(states.at(-1).bookings,[]);host.dispose();
});
test('the first verified sign-in can complete its initial read without looking like an account conflict',async()=>{
 const s=session(),states=[];s.change(null);const getSession=s.getSession;s.getSession=async()=>{s.change(id);return getSession();};
 const host=createNativeAppointments({...origins,session:s,render:state=>states.push(state),read:async()=>data()});await host.load();assert.equal(states.at(-1).phase,'ready');host.dispose();
});
test('account change or background clearing cannot restore an old in-flight appointment response',async()=>{
 for(const change of ['account','background']){
  const s=session(),states=[];let finish;const host=createNativeAppointments({...origins,session:s,render:v=>states.push(v),read:()=>new Promise(resolve=>{finish=resolve;})});
  const pending=host.load();await drainNativeTasks();if(change==='account')s.change(other);else host.clear();finish(data());await pending;
  assert.equal(states.at(-1).phase,'signin');assert.deepEqual(states.at(-1).businesses,[]);assert.deepEqual(states.at(-1).bookings,[]);host.dispose();
 }
});
test('reads coalesce and time out across auth as well as transport; late results stay hidden',async()=>{
 const states=[];let finish;const host=createNativeAppointments({...origins,session:session(),timeoutMs:15,render:s=>states.push(s),read:()=>new Promise(resolve=>{finish=resolve;})});
 const first=host.load();assert.equal(host.load(),first);await first;assert.equal(states.at(-1).phase,'error');finish(data());await drainNativeTasks();assert.equal(states.at(-1).phase,'error');host.dispose();
 const authHost=createNativeAppointments({...origins,session:{...session(),getSession:()=>new Promise(()=>{})},timeoutMs:15,render:s=>states.push(s)});await authHost.load();assert.equal(states.at(-1).phase,'error');authHost.dispose();
});
test('malformed, oversized and unsafe-price dashboards fail closed without raw error diagnostics',async()=>{
 for(const bad of [{...data(),bookings:Array(201).fill(data().bookings[0])},{...data(),bookings:[{...data().bookings[0],price_minor:Number.MAX_SAFE_INTEGER+1}]},{...data(),slots:[{id,service_listing_id:service,status:'available',starts_at:'2026-10-21T10:30:00Z',ends_at:'2026-10-21T10:00:00Z'}]}]){
  const states=[];const host=createNativeAppointments({...origins,session:session(),render:s=>states.push(s),read:async()=>bad});await host.load();assert.equal(states.at(-1).phase,'error');assert.deepEqual(states.at(-1).bookings,[]);host.dispose();
 }
 let accesses=0;assert.throws(()=>createNativeAppointments({...origins,apiBaseUrl:'https://vetit.online',session:{snapshot(){accesses++;}},render(){}}));assert.equal(accesses,0);
 assert.throws(()=>getAppointmentDashboard({baseUrl:origins.apiBaseUrl,accessToken:'x'.repeat(8193)}));
});
test('actual native appointment view selects provider schedule, falls back to English and clears on background',async()=>{
 const s=session();const read=async options=>({...data(),slots:options.businessId?[{id:other,service_listing_id:service,status:'available',starts_at:'2026-10-21T11:00:00Z',ends_at:'2026-10-21T11:30:00Z'}]:[]});
 const ui=mountNativeComponent('NativeAppointments.tsx','NativeAppointments',{...origins,session:s,language:'ta'},{'./appointments.js':{createNativeAppointments:options=>createNativeAppointments({...options,read}),appointmentCopy,appointmentTime,appointmentStatus:()=> 'Confirmed'}});
 await drainNativeTasks();ui.render();assert.match(ui.text(),/Appointments and provider schedule/);ui.button('Provider schedule: Synthetic provider').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/Synthetic consultation/);assert.match(ui.text(),/Asia\/Kolkata/);
 ui.appState('background');assert.ok(!ui.text().includes('Synthetic consultation'));assert.match(ui.text(),/Sign in to view appointments/);ui.unmount();
 assert.equal(appointmentCopy('ur').title,appointmentCopy('en').title);assert.notEqual(appointmentCopy('hi-IN').title,appointmentCopy('en').title);
 assert.match(appointmentTime('2026-10-21T10:00:00Z'),/3:30/);
});
