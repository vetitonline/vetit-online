import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeAppointmentActions,createProviderAppointmentActions,providerBookingActions,customerBookingActions,customerCanReschedule,providerActionCopy,customerActionCopy} from '../mobile/src/provider-appointment-actions.js';
import * as appointments from '../mobile/src/appointments.js';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001',noteId='10000000-0000-4000-8000-000000000002';
const origins={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'};
const view=()=>({phase:'empty',businessId:null,businesses:[],bookings:[],services:[],slots:[],policies:[],truncated:false,notifications:[{id:noteId,eventType:'booking_confirmed',createdAt:'2026-11-22T12:00:00Z',read:false}]});
function session(){let user=id;const listeners=new Set();return{snapshot:()=>({userId:user}),getSession:async()=>({userId:user,accessToken:'synthetic-token'}),subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},change:next=>{user=next;for(const fn of listeners)fn({userId:user});}};}
test('notification read requires returned personal notification and refreshed read state',async()=>{
 let current=view(),writes=0;const host=createNativeAppointmentActions({...origins,session:session(),getView:()=>current,refresh:async()=>{},render:()=>{},send:async(command,options)=>{writes++;assert.deepEqual(command,{action:'readNotification',notificationId:noteId});assert.equal(options.profileId,id);current={...view(),notifications:[{...view().notifications[0],read:true}]};return{status:'read'};}});
 assert.equal(host.prepareNotification(id),false);assert.equal(host.prepareNotification(noteId),true);assert.equal(writes,0);await host.confirm();assert.equal(writes,1);assert.equal(host.snapshot().phase,'success');assert.equal(host.prepareNotification(noteId),false);host.dispose();
});
test('acknowledgements without readback remain uncertain; provider scope cannot mark personal notifications',async()=>{
 const current=view();const options={...origins,session:session(),getView:()=>current,refresh:async()=>{},render:()=>{},send:async()=>({status:'read'})};const provider=createProviderAppointmentActions(options);assert.equal(provider.prepareNotification(noteId),false);provider.dispose();const native=createNativeAppointmentActions(options);native.prepareNotification(noteId);await native.confirm();assert.equal(native.snapshot().phase,'uncertain');assert.equal(native.prepareNotification(noteId),false);native.dispose();
});
test('account switch prevents prepared notification dispatch',async()=>{
 let writes=0;const s=session();const host=createNativeAppointmentActions({...origins,session:s,getView:view,refresh:async()=>{},render:()=>{},send:async()=>{writes++;return{status:'read'};}});host.prepareNotification(noteId);s.change(null);await host.confirm();assert.equal(writes,0);assert.equal(host.snapshot().notificationId,undefined);host.dispose();
});
test('actual native notification UI confirms mark-read and clears unread control after refreshed evidence',async()=>{
 let read=false,writes=0;
 const load=async()=>({profileId:id,bookings:[],providerBusinesses:[],services:[],slots:[],policies:[],truncated:false,notifications:[{id:noteId,event_type:'booking_confirmed',created_at:'2026-11-22T12:00:00Z',read_at:read?'2026-11-22T12:01:00Z':null,payload:{private:'DO_NOT_EXPOSE'}}]});
 const modules={'./appointments.js':{...appointments,createNativeAppointments:options=>appointments.createNativeAppointments({...options,read:load})},'./provider-appointment-actions.js':{createNativeAppointmentActions:options=>createNativeAppointmentActions({...options,send:async()=>{writes++;read=true;return{status:'read'};}}),providerBookingActions,customerBookingActions,customerCanReschedule,providerActionCopy,customerActionCopy}};
 const ui=mountNativeComponent('NativeAppointments.tsx','NativeAppointments',{...origins,session:session(),language:'en'},modules);await drainNativeTasks();ui.render();assert.match(ui.text(),/Unread/);assert.ok(!ui.text().includes('DO_NOT_EXPOSE'));ui.button('Mark notification read').props.onPress();ui.render();assert.equal(writes,0);ui.button('Confirm appointment change').props.onPress();await drainNativeTasks();await drainNativeTasks();ui.render();assert.equal(writes,1);assert.equal(ui.button('Mark notification read'),undefined);assert.match(ui.text(),/Read/);ui.unmount();
});
