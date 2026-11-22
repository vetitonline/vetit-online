import test from 'node:test';
import assert from 'node:assert/strict';
import {createCustomerAppointmentActions,createNativeAppointmentActions,customerBookingActions,customerCanReschedule,customerActionCopy,providerBookingActions,providerActionCopy} from '../mobile/src/provider-appointment-actions.js';
import {INITIAL_APPOINTMENT_POLICY} from '../src/lib/services/appointment-lifecycle.js';
import {sendAppointmentCommand} from '../src/lib/services/appointment-lifecycle-client.js';
import * as appointments from '../mobile/src/appointments.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',bookingId='10000000-0000-4000-8000-000000000002';
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const booking=()=>({id:bookingId,serviceId:id,status:'confirmed',revision:1,startsAt:'2099-01-01T12:00:00Z',endsAt:'2099-01-01T13:00:00Z',priceMinor:10000,currency:'INR',cancellationPolicy:INITIAL_APPOINTMENT_POLICY});
const view=()=>({phase:'ready',businessId:null,businesses:[],bookings:[booking()],services:[],slots:[],policies:[],truncated:false});
function session(){let user=id;const listeners=new Set();return {snapshot:()=>({userId:user}),getSession:async()=>({userId:user,accessToken:'synthetic-token'}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:value=>{user=value;for(const fn of listeners)fn({userId:user});}};}
function harness(send){let current=view();const s=session(),states=[];const host=createCustomerAppointmentActions({...origins,session:s,getView:()=>current,render:state=>states.push(state),refresh:async()=>{},send});return {host,s,states,set:next=>current=next,get:()=>current};}
test('customer cancellation requires a current personal view, saved policy and eligible notice window',()=>{
 const b=booking();assert.deepEqual(customerBookingActions(b),['cancel']);assert.deepEqual(customerBookingActions({...b,cancellationPolicy:null}),[]);assert.deepEqual(customerBookingActions({...b,status:'cancelled'}),[]);assert.deepEqual(customerBookingActions({...b,startsAt:'2000-01-01T00:00:00Z'}),[]);
 const h=harness();h.set({...view(),businessId:id,businesses:[{id}]});assert.equal(h.host.prepare('cancel',bookingId),false);h.set(view());assert.equal(h.host.prepare('confirm',bookingId),false);h.host.dispose();
});
test('customer confirmation sends one revision/account-bound command and reconciles refreshed cancellation',async()=>{
 let h,writes=0;h=harness((command,options)=>sendAppointmentCommand(command,{...options,fetchImpl:async(_url,init)=>{writes++;assert.equal(init.headers['x-vetit-profile-id'],id);assert.equal(init.headers.authorization,'Bearer synthetic-token');assert.equal(init.credentials,'omit');assert.deepEqual(JSON.parse(init.body),{action:'cancel',bookingId,expectedRevision:1});h.set({...view(),bookings:[{...booking(),status:'cancelled',revision:2}]});return Response.json({apiVersion:1,state:'accepted',data:{bookingId,status:'cancelled'}});}}));
 assert.equal(h.host.prepare('cancel',bookingId),true);assert.equal(writes,0);const pending=h.host.confirm();assert.equal(h.host.confirm(),pending);await pending;assert.equal(writes,1);assert.equal(h.host.snapshot().phase,'success');h.host.dispose();
});
test('lost acknowledgements do not retry; account changes clear pending private context',async()=>{
 let writes=0;const h=harness(async()=>{writes++;throw Error('offline');});h.host.prepare('cancel',bookingId);await h.host.confirm();assert.equal(h.host.snapshot().phase,'uncertain');assert.equal(h.host.prepare('cancel',bookingId),false);await h.host.confirm();assert.equal(writes,1);h.s.change(null);assert.equal(h.host.snapshot().bookingId,null);h.host.dispose();
});
test('changed revisions and changed policy block the prepared action before a request',async()=>{
 for(const patch of [{revision:2},{cancellationPolicy:{...INITIAL_APPOINTMENT_POLICY,allowCustomerCancellation:false}}]){let writes=0;const h=harness(async()=>{writes++;});h.host.prepare('cancel',bookingId);h.set({...view(),bookings:[{...booking(),...patch}]});await h.host.confirm();assert.equal(writes,0);assert.equal(h.host.snapshot().phase,'conflict');h.host.dispose();}
});
test('actual native customer UI confirms cancellation and projects notifications without raw payload',async()=>{
 let status='confirmed',revision=1,writes=0;
 const read=async()=>({profileId:id,bookings:[{id:bookingId,service_listing_id:id,status,lifecycle_revision:revision,requested_start:'2099-01-01T12:00:00Z',requested_end:'2099-01-01T13:00:00Z',price_minor:10000,currency_code:'INR',lifecycle_policy_snapshot:INITIAL_APPOINTMENT_POLICY}],providerBusinesses:[],services:[],slots:[],policies:[],truncated:false,notifications:[{id:bookingId,event_type:'booking_confirmed',created_at:'2026-11-22T12:00:00Z',read_at:null,payload:{private:'DO_NOT_EXPOSE'}}]});
 const modules={'./appointments.js':{...appointments,createNativeAppointments:options=>appointments.createNativeAppointments({...options,read})},'./provider-appointment-actions.js':{createNativeAppointmentActions:options=>createNativeAppointmentActions({...options,send:async()=>{writes++;status='cancelled';revision++;return{bookingId,status};}}),providerBookingActions,customerBookingActions,customerCanReschedule,providerActionCopy,customerActionCopy}};
 const ui=mountNativeComponent('NativeAppointments.tsx','NativeAppointments',{...origins,session:session(),language:'en'},modules);await drainNativeTasks();ui.render();assert.match(ui.text(),/Appointment notifications/);assert.ok(!ui.text().includes('DO_NOT_EXPOSE'));ui.button('Cancel appointment').props.onPress();ui.render();assert.equal(writes,0);assert.match(ui.text(),/Refunds require review/);ui.button('Confirm appointment change').props.onPress();await drainNativeTasks();await drainNativeTasks();ui.render();assert.equal(writes,1);assert.match(ui.text(),/verified in refreshed records/);assert.equal(ui.button('Cancel appointment'),undefined);ui.appState('background');assert.ok(!ui.text().includes('booking confirmed'));ui.unmount();
});
test('native dashboard rejects a response bound to another account',async()=>{
 let state;const host=appointments.createNativeAppointments({...origins,session:session(),render:next=>state=next,read:async()=>({profileId:bookingId})});await host.load();assert.equal(state.phase,'signin');assert.equal(state.bookings.length,0);host.dispose();
});
