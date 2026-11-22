import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeCustomerBooking} from '../mobile/src/customer-booking.js';
import {INITIAL_APPOINTMENT_POLICY} from '../src/lib/services/appointment-lifecycle.js';
import {sendAppointmentCommand} from '../src/lib/services/appointment-lifecycle-client.js';
import {appointmentTime} from '../mobile/src/appointments.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const policy={...INITIAL_APPOINTMENT_POLICY,noticeMinutes:120};
const offer=()=>({id:id(4),entry_id:id(2),customer_profile_id:id(1),slot_id:id(3),status:'offered',booking_id:null,price_minor:15000,currency_code:'INR',policy_snapshot:policy,starts_at:'2099-01-01T12:00:00Z',ends_at:'2099-01-01T13:00:00Z',expires_at:'2098-12-31T12:00:00Z'});
function session(){let user=id(1);const listeners=new Set();return{snapshot:()=>({userId:user}),getSession:async()=>({userId:user,accessToken:'synthetic-token'}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:next=>{user=next;for(const fn of listeners)fn({userId:user});}};}
function data(){return{profileId:id(1),bookings:[],waitlist:[{id:id(2),service_listing_id:id(5),status:'offered',starts_at:'2098-01-01T12:00:00Z',ends_at:'2099-02-01T12:00:00Z'}],offers:[offer()],truncated:false};}
function fixture(patch={}){let current=data();const s=session(),calls=[],states=[];const options={...origins,serviceId:id(5),session:s,render:next=>states.push(next),readPolicy:async()=>({title:'Synthetic grooming',priceMinor:99900,currencyCode:'INR',policy:INITIAL_APPOINTMENT_POLICY}),readSlots:async()=>({slots:[],truncated:false}),readDashboard:async()=>current,send:(command,options)=>sendAppointmentCommand(command,{...options,fetchImpl:async(_url,init)=>{calls.push({command,init});const accept=command.action==='acceptOffer';current={...current,waitlist:current.waitlist.map(row=>({...row,status:accept?'accepted':'left'})),offers:current.offers.map(row=>({...row,status:accept?'accepted':'declined',booking_id:accept?id(6):null})),bookings:accept?[{id:id(6),service_listing_id:id(5),appointment_slot_id:id(3),status:'requested',requested_start:offer().starts_at,requested_end:offer().ends_at,price_minor:15000,currency_code:'INR',lifecycle_policy_snapshot:policy}]:[]};return Response.json({apiVersion:1,state:'accepted',data:accept?{bookingId:id(6)}:{status:'declined'}});}}),...patch};const host=createNativeCustomerBooking(options);return{host,s,calls,states,options,set:value=>current=value,get:()=>current};}
test('acceptance reviews the saved offer price/policy, not changed current public terms',async()=>{
 const f=fixture();await f.host.load();assert.equal(f.host.snapshot().offers[0].priceMinor,15000);assert.equal(f.host.prepare('acceptOffer',id(9)),false);assert.equal(f.host.prepare('acceptOffer',id(4)),true);assert.equal(f.calls.length,0);assert.equal(f.host.snapshot().confirmation.offer.policy.noticeMinutes,120);await f.host.confirm();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].command,{action:'acceptOffer',offerId:id(4)});assert.equal(f.calls[0].init.headers['x-vetit-profile-id'],id(1));assert.equal(f.host.snapshot().phase,'success');f.host.dispose();
});
test('decline is explicitly confirmed and verifies declined offer and left waitlist',async()=>{
 const f=fixture();await f.host.load();f.host.prepare('declineOffer',id(4));f.host.back();assert.equal(f.calls.length,0);f.host.prepare('declineOffer',id(4));await f.host.confirm();assert.equal(f.host.snapshot().phase,'success');assert.equal(f.get().bookings.length,0);f.host.dispose();
});
test('expired and foreign offers cannot enable acceptance',async()=>{
 for(const patch of [{expires_at:'2000-01-01T00:00:00Z'},{entry_id:id(9)},{customer_profile_id:id(9)}]){const f=fixture();f.set({...data(),offers:[{...offer(),...patch}]});await f.host.load();assert.equal(f.host.prepare('acceptOffer',id(4)),false);assert.equal(f.calls.length,0);f.host.dispose();}
});
test('expiry between review and confirmation blocks dispatch',async()=>{
 let now=Date.parse('2098-12-30T12:00:00Z');const f=fixture({now:()=>now});await f.host.load();f.host.prepare('acceptOffer',id(4));now=Date.parse('2098-12-31T12:00:01Z');await f.host.confirm();assert.equal(f.calls.length,0);assert.equal(f.host.snapshot().phase,'conflict');f.host.dispose();
});
test('accepted acknowledgement without matching offer-to-booking evidence remains uncertain',async()=>{
 for(const patch of [{status:'offered',booking_id:null},{status:'accepted',booking_id:id(9)}]){let f;f=fixture({send:async()=>{f.set({...data(),offers:[{...offer(),...patch}],bookings:[{id:id(6),service_listing_id:id(5),appointment_slot_id:id(3),status:'requested',requested_start:offer().starts_at,requested_end:offer().ends_at,price_minor:15000,currency_code:'INR',lifecycle_policy_snapshot:policy}]});return{bookingId:id(6)};}});await f.host.load();f.host.prepare('acceptOffer',id(4));await f.host.confirm();assert.equal(f.host.snapshot().phase,'uncertain');f.host.dispose();}
});
test('lost acknowledgement is read-reconciled without another acceptance request',async()=>{
 let f,writes=0;f=fixture({send:async()=>{writes++;throw Error('lost');}});await f.host.load();f.host.prepare('acceptOffer',id(4));await f.host.confirm();await f.host.confirm();assert.equal(writes,1);assert.equal(f.host.snapshot().phase,'uncertain');f.s.change(null);assert.equal(f.host.snapshot().offers.length,0);f.host.dispose();
});
test('actual native offer UI displays saved terms and confirms acceptance once',async()=>{
 const f=fixture();const modules={'./customer-booking.js':{createNativeCustomerBooking:options=>createNativeCustomerBooking({...f.options,...options})},'./appointments.js':{appointmentTime},'../../src/lib/i18n/locales.js':{resolveIndianLocale:()=>({language:'en'})}};
 const ui=mountNativeComponent('NativeCustomerBooking.tsx','NativeCustomerBooking',{...origins,serviceId:id(5),session:f.s,language:'en'},modules);ui.button('Load booking options').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/Waiting-list offer/);ui.button('Review offer').props.onPress();ui.render();assert.match(ui.text(),/Saved offer policy: 120/);assert.match(ui.text(),/Offer expires/);assert.equal(f.calls.length,0);const confirm=ui.button('Confirm request');confirm.props.onPress();confirm.props.onPress();await drainNativeTasks();await drainNativeTasks();ui.render();assert.equal(f.calls.length,1);assert.match(ui.text(),/verified in refreshed records/);ui.unmount();f.host.dispose();
});
test('a committed acceptance with a lost response is resolved by reads without resubmission',async()=>{
 let f,writes=0;f=fixture({send:async()=>{writes++;f.set({...data(),waitlist:data().waitlist.map(row=>({...row,status:'accepted'})),offers:[{...offer(),status:'accepted',booking_id:id(6)}],bookings:[{id:id(6),service_listing_id:id(5),appointment_slot_id:id(3),status:'requested',requested_start:offer().starts_at,requested_end:offer().ends_at,price_minor:15000,currency_code:'INR',lifecycle_policy_snapshot:policy}]});throw Error('lost response');}});
 await f.host.load();f.host.prepare('acceptOffer',id(4));await f.host.confirm();assert.equal(f.host.snapshot().phase,'uncertain');await f.host.reconcile();assert.equal(f.host.snapshot().phase,'success');assert.equal(writes,1);f.host.dispose();
});
