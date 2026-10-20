import test from 'node:test';
import assert from 'node:assert/strict';
import {createProviderAppointmentActions,providerBookingActions,providerActionCopy} from '../mobile/src/provider-appointment-actions.js';
import {sendAppointmentCommand} from '../src/lib/services/appointment-lifecycle-client.js';
import * as appointments from '../mobile/src/appointments.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',business='10000000-0000-4000-8000-000000000002',service='10000000-0000-4000-8000-000000000003',other='10000000-0000-4000-8000-000000000004';
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const booking=()=>({id,serviceId:service,status:'requested',revision:1,startsAt:'2026-10-19T10:00:00Z',endsAt:'2026-10-19T10:30:00Z',priceMinor:10000,currency:'INR'});
const view=()=>({phase:'ready',businessId:business,businesses:[{id:business,name:'Synthetic provider'}],bookings:[booking()],services:[{id:service,title:'Synthetic consultation'}],slots:[],policies:[],truncated:false});
function session(){let user=id;const listeners=new Set();return{snapshot:()=>user?{userId:user}:null,getSession:async()=>{if(!user)throw Object.assign(Error('Synthetic signout'),{status:401});return{userId:user,accessToken:'synthetic-token'};},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:value=>{user=value;for(const fn of listeners)fn(user?{userId:user}:null);}};}
function harness(options={}){const s=options.session??session(),states=[];let current=view();const host=createProviderAppointmentActions({...origins,session:s,getView:()=>current,render:v=>states.push(v),refresh:async()=>{current=structuredClone(current);},...options});return{host,s,states,get:()=>current,set:v=>{current=v;}};}

test('provider confirmation is explicit, coalesces taps and sends only revision-checked bearer commands',async()=>{
 const calls=[];let h;h=harness({send:(command,options)=>sendAppointmentCommand(command,{...options,fetchImpl:async(_url,init)=>{calls.push(init);h.set({...view(),bookings:[{...booking(),status:'confirmed',revision:2}]});return Response.json({apiVersion:1,state:'accepted',data:{bookingId:id,status:'confirmed'}});}})});
 await h.host.confirm();assert.equal(calls.length,0);assert.equal(h.host.prepare('confirm',id),true);assert.equal(calls.length,0);
 const pending=h.host.confirm();assert.equal(h.host.confirm(),pending);await pending;
 assert.equal(calls.length,1);assert.equal(calls[0].credentials,'omit');assert.equal(calls[0].redirect,'error');assert.equal(calls[0].headers.authorization,'Bearer synthetic-token');assert.deepEqual(JSON.parse(calls[0].body),{action:'confirm',bookingId:id,expectedRevision:1});assert.equal(h.host.snapshot().phase,'success');assert.ok(!JSON.stringify(h.states).includes('synthetic-token'));h.host.dispose();
});
test('personal/foreign bookings, future completion and malformed revisions cannot prepare provider commands',()=>{
 const h=harness();h.set({...view(),businessId:null});assert.equal(h.host.prepare('cancel',id),false);h.set(view());assert.equal(h.host.prepare('confirm',other),false);assert.equal(h.host.prepare('setPolicy',id),false);
 assert.deepEqual(providerBookingActions({...booking(),status:'confirmed',endsAt:'2099-01-01T00:00:00Z'}),['cancel']);assert.deepEqual(providerBookingActions({...booking(),revision:null}),[]);
 h.set({...view(),businesses:[]});assert.equal(h.host.prepare('cancel',id),false);h.host.dispose();
});
test('back cancels confirmation without a POST; provider cancellation does not invent a refund command',async()=>{
 const calls=[];const h=harness({send:async command=>{calls.push(command);return{bookingId:id,status:'cancelled'};}});
 h.host.prepare('cancel',id);h.host.cancel();await h.host.confirm();assert.equal(calls.length,0);h.host.prepare('cancel',id);await h.host.confirm();assert.deepEqual(calls[0],{action:'cancel',bookingId:id,expectedRevision:1,providerCancellation:true});assert.equal(h.host.snapshot().phase,'uncertain');h.host.dispose();
});
test('unconfirmed writes cannot replay after a stale read; fresh advanced status reconciles without another POST',async()=>{
 let writes=0;const h=harness({send:async()=>{writes++;throw Object.assign(Error('private provider diagnostics'),{status:503});}});
 h.host.prepare('confirm',id);await h.host.confirm();assert.equal(h.host.snapshot().phase,'uncertain');assert.equal(h.host.prepare('confirm',id),false);await h.host.confirm();await h.host.reconcile();assert.equal(h.host.snapshot().phase,'uncertain');assert.equal(writes,1);
 h.set({...view(),bookings:[{...booking(),status:'confirmed',revision:2}]});await h.host.reconcile();assert.equal(h.host.snapshot().phase,'success');assert.equal(writes,1);assert.ok(!JSON.stringify(h.states).includes('private provider diagnostics'));h.host.dispose();
});
test('conflicts require a fresh read and a new confirmation with the new revision',async()=>{
 const calls=[];const h=harness({send:async command=>{calls.push(command);throw Object.assign(Error('Synthetic conflict'),{status:409});}});
 h.host.prepare('confirm',id);await h.host.confirm();assert.equal(h.host.snapshot().phase,'conflict');assert.equal(h.host.prepare('confirm',id),false);
 h.set({...view(),bookings:[{...booking(),revision:2}]});await h.host.reconcile();assert.equal(h.host.prepare('confirm',id),true);await h.host.confirm();assert.equal(calls[1].expectedRevision,2);h.host.dispose();
});
test('completion requires a finished confirmed booking and rechecks the displayed revision at confirmation',async()=>{
 const calls=[];let h;h=harness({send:async command=>{calls.push(command);h.set({...view(),bookings:[{...booking(),status:'completed',revision:3}]});return{bookingId:id,status:'completed'};}});h.set({...view(),bookings:[{...booking(),status:'confirmed'}]});
 assert.equal(h.host.prepare('complete',id),true);h.set({...view(),bookings:[{...booking(),status:'confirmed',revision:2}]});await h.host.confirm();assert.equal(calls.length,0);assert.equal(h.host.snapshot().phase,'conflict');await h.host.reconcile();h.host.prepare('complete',id);await h.host.confirm();assert.deepEqual(calls[0],{action:'complete',bookingId:id,expectedRevision:2});assert.equal(h.host.snapshot().phase,'success');h.host.dispose();
});
test('identity changes before dispatch prevent writes; late mutation responses cannot revive a cleared view',async()=>{
 let finish,writes=0;const s=session(),verify=s.getSession;let wait=true;s.getSession=()=>wait?new Promise(resolve=>{finish=resolve;}):verify();
 const h=harness({session:s,send:async()=>{writes++;return{bookingId:id,status:'confirmed'};}});h.host.prepare('confirm',id);const first=h.host.confirm();s.change(other);wait=false;finish(await verify());await first;assert.equal(writes,0);assert.equal(h.host.snapshot().phase,'idle');assert.equal(h.host.prepare('confirm',id),false);h.host.dispose();
 let resolveSend;const late=harness({send:()=>new Promise(resolve=>{resolveSend=resolve;})});late.host.prepare('confirm',id);const pending=late.host.confirm();await drainNativeTasks();late.host.clear();resolveSend({bookingId:id,status:'confirmed'});await pending;assert.equal(late.host.snapshot().phase,'idle');assert.equal(late.host.prepare('confirm',id),false);late.host.dispose();
});
test('timeout remains uncertain after late completion and resolves only through a verified refreshed revision',async()=>{
 let finish;const h=harness({timeoutMs:15,send:()=>new Promise(resolve=>{finish=resolve;})});h.host.prepare('confirm',id);await h.host.confirm();assert.equal(h.host.snapshot().phase,'uncertain');finish({bookingId:id,status:'confirmed'});await drainNativeTasks();assert.equal(h.host.snapshot().phase,'uncertain');
 h.set({...view(),bookings:[{...booking(),status:'confirmed',revision:1}]});await h.host.reconcile();assert.equal(h.host.snapshot().phase,'uncertain');h.set({...view(),bookings:[{...booking(),status:'confirmed',revision:2}]});await h.host.reconcile();assert.equal(h.host.snapshot().phase,'success');h.host.dispose();
});
test('actual native provider UI requires confirmation, preserves appointments on back and verifies the refreshed result',async()=>{
 let status='requested',revision=1,writes=0;
 const read=async options=>({bookings:[{id,service_listing_id:service,status,lifecycle_revision:revision,requested_start:'2026-10-19T10:00:00Z',requested_end:'2026-10-19T10:30:00Z',price_minor:10000,currency_code:'INR'}],providerBusinesses:[{id:business,display_name:'Synthetic provider'}],services:options.businessId?[{id:service,title:'Synthetic consultation'}]:[],slots:[],policies:[],truncated:false});
 const modules={'./appointments.js':{...appointments,createNativeAppointments:options=>appointments.createNativeAppointments({...options,read})},'./provider-appointment-actions.js':{createProviderAppointmentActions:options=>createProviderAppointmentActions({...options,send:async()=>{writes++;status='confirmed';revision++;return{bookingId:id,status};}}),providerBookingActions,providerActionCopy}};
 const ui=mountNativeComponent('NativeAppointments.tsx','NativeAppointments',{...origins,session:session(),language:'ta'},modules);await drainNativeTasks();ui.render();assert.equal(ui.button('Confirm appointment'),undefined);ui.button('Provider schedule: Synthetic provider').props.onPress();await drainNativeTasks();ui.render();ui.button('Confirm appointment').props.onPress();ui.render();assert.equal(writes,0);assert.match(ui.text(),/Apply this provider action/);ui.button('Keep appointment unchanged').props.onPress();ui.render();assert.equal(writes,0);
 ui.button('Confirm appointment').props.onPress();ui.render();ui.button('Apply appointment action').props.onPress();await drainNativeTasks();await drainNativeTasks();ui.render();assert.equal(writes,1);assert.match(ui.text(),/verified in refreshed records/);ui.appState('background');assert.ok(!ui.text().includes('Synthetic consultation'));ui.unmount();assert.notEqual(providerActionCopy('hi-IN').confirm,providerActionCopy('en').confirm);
});
