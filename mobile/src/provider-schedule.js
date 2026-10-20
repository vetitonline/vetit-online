import {createConfirmedWrite} from './confirmed-write.js';
import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {normalizeAppointmentCommand,normalizeAppointmentPolicy} from '../../src/lib/services/appointment-lifecycle.js';
import {sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
const equal=(a,b)=>JSON.stringify(normalizeAppointmentPolicy(a))===JSON.stringify(normalizeAppointmentPolicy(b));
export function createProviderSchedule({session,apiBaseUrl,testApiOrigin,getView,refresh,render,send=sendAppointmentCommand,now=Date.now,timeoutMs=10000}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);let business=null;
 function validate(input){
  const view=getView(),command=normalizeAppointmentCommand(input);
  if(!['ready','empty'].includes(view.phase)||!view.businessId||!view.businesses.some(b=>b.id===view.businessId)||view.truncated)throw Error('Refresh a complete provider view');
  if(business&&business!==view.businessId)throw Error('Provider changed');
  if(['scheduleSlot','setPolicy'].includes(command.action)){
   if(!view.services.some(s=>s.id===command.serviceListingId))throw Error('Service unavailable');
   if(command.action==='scheduleSlot'&&(Date.parse(command.startsAt)<=now()||Date.parse(command.endsAt)>now()+30*86400000))throw Error('Use a future slot within 30 days');
  }else{
   const slot=view.slots.find(s=>s.id===command.slotId);
   if(!slot||Date.parse(slot.startsAt)<=now()||!((command.action==='blockSlot'&&slot.status==='available')||(command.action==='reopenSlot'&&slot.status==='blocked')))throw Error('Slot changed');
  }
  business=view.businessId;return command;
 }
 const gate=createConfirmedWrite({session,timeoutMs,validate,render,refresh,send:(command,accessToken,signal)=>send(command,{baseUrl,accessToken,signal}),matches:command=>{
  const view=getView();if(!['ready','empty'].includes(view.phase)||view.businessId!==business||view.truncated)return false;
  if(command.action==='setPolicy')return view.policies.some(p=>p.serviceId===command.serviceListingId&&equal(p.policy,command.policy));
  if(command.action==='scheduleSlot')return view.slots.some(s=>s.serviceId===command.serviceListingId&&s.resourceKey===command.resourceKey&&Date.parse(s.startsAt)===Date.parse(command.startsAt)&&Date.parse(s.endsAt)===Date.parse(command.endsAt));
  return view.slots.some(s=>s.id===command.slotId&&s.status===(command.action==='blockSlot'?'blocked':'available'));
 }});
 return{...gate,prepare:input=>{if(['idle','success','invalid'].includes(gate.snapshot().phase))business=null;return gate.prepare(input);},clear:()=>{business=null;gate.clear();}};
}
