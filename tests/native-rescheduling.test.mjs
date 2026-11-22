import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerAppointmentActions,createNativeAppointmentActions,customerCanReschedule,customerBookingActions,providerBookingActions,providerActionCopy,customerActionCopy} from '../mobile/src/provider-appointment-actions.js';
import {INITIAL_APPOINTMENT_POLICY} from '../src/lib/services/appointment-lifecycle.js';
import * as appointments from '../mobile/src/appointments.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const slot={id:id(4),startsAt:'2099-02-01T12:00:00Z',endsAt:'2099-02-01T13:00:00Z'};
const booking=()=>({id:id(2),slotId:id(3),serviceId:id(1),status:'confirmed',revision:1,startsAt:'2099-01-01T12:00:00Z',endsAt:'2099-01-01T13:00:00Z',priceMinor:10000,currency:'INR',cancellationPolicy:INITIAL_APPOINTMENT_POLICY});
const view=()=>({phase:'ready',businessId:null,businesses:[],bookings:[booking()],services:[],slots:[],policies:[],truncated:false});
function session(){let user=id(1);const listeners=new Set();return{snapshot:()=>({userId:user}),getSession:async()=>({userId:user,accessToken:'synthetic-token'}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:next=>{user=next;for(const fn of listeners)fn({userId:user});}};}
function fixture(patch={}){let current=view();const states=[],calls=[],s=session();const host=createCustomerAppointmentActions({...origins,session:s,getView:()=>current,refresh:async()=>{},render:state=>states.push(state),readSlots:async()=>({slots:[slot],truncated:false}),send:async(command,options)=>{calls.push({command,options});current={...view(),bookings:[{...booking(),revision:2,slotId:slot.id,startsAt:slot.startsAt,endsAt:slot.endsAt}]};return{bookingId:id(2)};},...patch});return{host,s,states,calls,set:value=>current=value};}
test('rescheduling uses listed replacement only, explicit confirmation and current revision/account',async()=>{
 const f=fixture();assert.equal(f.host.prepare('reschedule',id(2),slot.id),false);await f.host.loadReplacements(id(2));assert.equal(f.host.snapshot().phase,'choosing');assert.equal(f.calls.length,0);assert.equal(f.host.prepare('reschedule',id(2),id(8)),false);assert.equal(f.host.prepare('reschedule',id(2),slot.id),true);assert.deepEqual(f.host.snapshot().replacement,slot);await f.host.confirm();assert.equal(f.calls.length,1);assert.deepEqual(f.calls[0].command,{action:'reschedule',bookingId:id(2),slotId:slot.id,expectedRevision:1});assert.equal(f.calls[0].options.profileId,id(1));assert.equal(f.host.snapshot().phase,'success');f.host.dispose();
});
test('saved policy, time window, provider scope and stale revisions prevent dispatch',async()=>{
 assert.equal(customerCanReschedule({...booking(),cancellationPolicy:null}),false);assert.equal(customerCanReschedule({...booking(),startsAt:'2000-01-01T00:00:00Z'}),false);
 const f=fixture();await f.host.loadReplacements(id(2));f.host.prepare('reschedule',id(2),slot.id);f.set({...view(),bookings:[{...booking(),revision:2}]});await f.host.confirm();assert.equal(f.calls.length,0);assert.equal(f.host.snapshot().phase,'conflict');f.host.dispose();
});
test('late availability after account change or explicit back cannot restore selections',async()=>{
 for(const mode of ['account','back']){let finish;const f=fixture({readSlots:()=>new Promise(resolve=>finish=resolve)});const work=f.host.loadReplacements(id(2));await drainNativeTasks();mode==='account'?f.s.change(null):f.host.cancel();finish({slots:[slot],truncated:false});await work;assert.equal(f.host.snapshot().phase,'idle');assert.equal(f.host.prepare('reschedule',id(2),slot.id),false);f.host.dispose();}
});
test('wrong refreshed allocation or changed price is never reported as successful',async()=>{
 for(const patch of [{slotId:id(8)},{serviceId:id(8)},{priceMinor:1},{startsAt:'2099-03-01T12:00:00Z'}]){let f;f=fixture({send:async()=>{f.set({...view(),bookings:[{...booking(),revision:2,slotId:slot.id,startsAt:slot.startsAt,endsAt:slot.endsAt,...patch}]});return{bookingId:id(2)};}});await f.host.loadReplacements(id(2));f.host.prepare('reschedule',id(2),slot.id);await f.host.confirm();assert.equal(f.host.snapshot().phase,'conflict');f.host.dispose();}
});
test('unknown write remains uncertain and cannot be automatically retried',async()=>{
 let writes=0;const f=fixture({send:async()=>{writes++;throw Error('lost response');}});await f.host.loadReplacements(id(2));f.host.prepare('reschedule',id(2),slot.id);await f.host.confirm();assert.equal(f.host.snapshot().phase,'uncertain');await f.host.confirm();assert.equal(f.host.prepare('reschedule',id(2),slot.id),false);assert.equal(writes,1);f.host.dispose();
});
test('actual native UI chooses a replacement, shows its time and verifies rescheduling',async()=>{
 let revision=1,selected=id(3),writes=0;
 const read=async()=>({profileId:id(1),bookings:[{id:id(2),appointment_slot_id:selected,service_listing_id:id(1),status:'confirmed',lifecycle_revision:revision,requested_start:selected===id(3)?booking().startsAt:slot.startsAt,requested_end:selected===id(3)?booking().endsAt:slot.endsAt,price_minor:10000,currency_code:'INR',lifecycle_policy_snapshot:INITIAL_APPOINTMENT_POLICY}],providerBusinesses:[],services:[],slots:[],policies:[],notifications:[],truncated:false});
 const modules={'./appointments.js':{...appointments,createNativeAppointments:options=>appointments.createNativeAppointments({...options,read})},'./provider-appointment-actions.js':{createNativeAppointmentActions:options=>createNativeAppointmentActions({...options,readSlots:async()=>({slots:[slot],truncated:false}),send:async()=>{writes++;selected=slot.id;revision++;return{bookingId:id(2)};}}),customerCanReschedule,customerBookingActions,providerBookingActions,providerActionCopy,customerActionCopy}};
 const ui=mountNativeComponent('NativeAppointments.tsx','NativeAppointments',{...origins,session:session(),language:'en'},modules);await drainNativeTasks();ui.render();ui.button('Reschedule appointment').props.onPress();await drainNativeTasks();ui.render();const label=appointments.appointmentTime(slot.startsAt)+' – '+appointments.appointmentTime(slot.endsAt);ui.button(label).props.onPress();ui.render();assert.equal(writes,0);assert.match(ui.text(),/saved service price/);assert.ok(ui.text().includes(appointments.appointmentTime(slot.startsAt)));ui.button('Confirm appointment change').props.onPress();await drainNativeTasks();await drainNativeTasks();ui.render();assert.equal(writes,1);assert.match(ui.text(),/verified in refreshed records/);ui.unmount();
});

test('malformed and duplicate availability fails closed; empty availability never enables a write',async()=>{
 for(const slots of [[slot,slot],[{...slot,id:'bad'}],[{...slot,endsAt:'invalid'}]]){const f=fixture({readSlots:async()=>({slots,truncated:false})});await f.host.loadReplacements(id(2));assert.equal(f.host.snapshot().phase,'conflict');assert.equal(f.calls.length,0);f.host.dispose();}
 const f=fixture({readSlots:async()=>({slots:[],truncated:false})});await f.host.loadReplacements(id(2));assert.equal(f.host.snapshot().phase,'choosing');assert.deepEqual(f.host.snapshot().slots,[]);assert.equal(f.host.prepare('reschedule',id(2),slot.id),false);f.host.dispose();
});
