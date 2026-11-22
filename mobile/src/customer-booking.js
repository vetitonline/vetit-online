import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {appointmentId,normalizeAppointmentPolicy,normalizeAppointmentCommand} from '../../src/lib/services/appointment-lifecycle.js';
import {getAppointmentPolicy,getAppointmentDashboard,sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
import {requestAppointmentSlots} from '../../src/lib/services/appointment-client.js';

/** Service-bound native acquisition. Public prices are previews; the command
 * carries reviewed terms and PostgreSQL validates current price/policy/stock. */
export function createNativeCustomerBooking({session,apiBaseUrl,testApiOrigin,serviceId,render,readPolicy=getAppointmentPolicy,readSlots=requestAppointmentSlots,readDashboard=getAppointmentDashboard,send=sendAppointmentCommand,timeoutMs=10000,now=Date.now}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin),service=appointmentId(serviceId);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid booking timeout.');
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,pending=null,active=null,review=null,prepared=null,uncertain=null;
 let state={phase:'idle',terms:null,slots:[],entry:null,confirmation:null};
 const emit=(phase,extra={})=>{state={phase,terms:review?structuredClone(review.terms):null,slots:review?structuredClone(review.slots):[],entry:review?.entry?structuredClone(review.entry):null,confirmation:null,...extra};if(!disposed)render(state);};
 function clear(){epoch++;active?.abort();pending=null;review=null;prepared=null;uncertain=null;emit('idle');}
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){owner=next;clear();}});
 const bounded=async(work,controller)=>{let timer;try{return await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Timeout'));},timeoutMs);})]);}finally{clearTimeout(timer);}};
 const identity=async(expected,controller)=>{const auth=await session.getSession();if(controller.signal.aborted||!owner||owner!==expected||auth.userId!==expected)throw Object.assign(Error(),{status:401});return auth;};
 async function dashboard(expected,controller){const auth=await identity(expected,controller);const data=await readDashboard({baseUrl,accessToken:auth.accessToken,signal:controller.signal});await identity(expected,controller);if(data.profileId!==expected||!Array.isArray(data.bookings)||!Array.isArray(data.waitlist)||data.truncated!==false)throw Error('Incomplete dashboard');return data;}
 function load(){
  if(disposed||pending||uncertain)return pending??Promise.resolve();
  const expected=owner,version=++epoch,controller=new AbortController();active=controller;review=null;prepared=null;emit('loading');
  const current=()=>!disposed&&epoch===version;
  pending=bounded(async()=>{
   await identity(expected,controller);
   const [terms,availability,data]=await Promise.all([readPolicy(service,{baseUrl,signal:controller.signal}),readSlots({baseUrl,serviceListingId:service,signal:controller.signal}),dashboard(expected,controller)]);
   await identity(expected,controller);
   if(typeof terms.title!=='string'||!terms.title.trim()||terms.title.length>256||!Number.isSafeInteger(terms.priceMinor)||terms.priceMinor<0||terms.currencyCode!=='INR'||!Array.isArray(availability.slots)||availability.slots.length>200||typeof availability.truncated!=='boolean')throw Error();
   const seen=new Set();const slots=availability.slots.map(row=>{const id=appointmentId(row.id);if(seen.has(id)||!Number.isFinite(Date.parse(row.startsAt))||!Number.isFinite(Date.parse(row.endsAt))||Date.parse(row.endsAt)<=Date.parse(row.startsAt))throw Error();seen.add(id);return{id,startsAt:row.startsAt,endsAt:row.endsAt};}).filter(row=>Date.parse(row.startsAt)>now());
   const entries=data.waitlist.filter(row=>row.service_listing_id===service&&['waiting','offered'].includes(row.status));if(entries.length>1)throw Error();
   if(entries[0]&&(!Number.isFinite(Date.parse(entries[0].starts_at))||!Number.isFinite(Date.parse(entries[0].ends_at))||Date.parse(entries[0].ends_at)<=Date.parse(entries[0].starts_at)))throw Error();
   const entry=entries[0]?{id:appointmentId(entries[0].id),status:entries[0].status,startsAt:entries[0].starts_at,endsAt:entries[0].ends_at}:null;
   return{owner:expected,terms:{title:terms.title,priceMinor:terms.priceMinor,currencyCode:'INR',policy:normalizeAppointmentPolicy(terms.policy)},slots,entry,truncated:availability.truncated};
  },controller).then(value=>{if(current()){review=value;emit('ready');}}).catch(error=>{if(current()){review=null;emit(error?.status===401?'signin':'error');}}).finally(()=>{controller.abort();if(current())pending=null;});
  return pending;
 }
 function prepare(action,slotId){
  if(disposed||pending||uncertain||state.phase!=='ready'||!review||review.owner!==owner)return false;
  try{
   let input,window;
   if(action==='book'){const slot=review.slots.find(row=>row.id===slotId);if(!slot||Date.parse(slot.startsAt)<=now())return false;input={action,slotId:slot.id,expectedPriceMinor:review.terms.priceMinor,expectedCurrencyCode:'INR',expectedPolicy:review.terms.policy};window={startsAt:slot.startsAt,endsAt:slot.endsAt};}
   else if(action==='joinWaitlist'){if(review.entry)return false;const start=now()+60000;window={startsAt:new Date(start).toISOString(),endsAt:new Date(start+14*86400000).toISOString()};input={action,serviceListingId:service,marketCode:'IN',...window};}
   else if(action==='leaveWaitlist'){if(!review.entry)return false;input={action,entryId:review.entry.id};window={startsAt:review.entry.startsAt,endsAt:review.entry.endsAt};}
   else return false;
   prepared={owner,command:normalizeAppointmentCommand(input),terms:structuredClone(review.terms),window,...(action==='leaveWaitlist'?{entryId:review.entry.id}:{})};emit('confirm',{confirmation:{action,...window}});return true;
  }catch{return false;}
 }
 function back(){if(!pending&&state.phase==='confirm'){prepared=null;emit('ready');}}
 async function reconcile(){
  if(disposed||pending||!uncertain)return;
  const operation=uncertain,version=epoch,controller=new AbortController();active=controller;
  const current=()=>!disposed&&epoch===version;
  emit('checking');
  pending=bounded(()=>dashboard(operation.owner,controller),controller).then(data=>{
   if(!current())return;
   let matches;
   if(operation.command.action==='book')matches=data.bookings.filter(row=>row.appointment_slot_id===operation.command.slotId&&row.service_listing_id===service&&['requested','confirmed'].includes(row.status)&&row.price_minor===operation.terms.priceMinor&&row.currency_code==='INR'&&Date.parse(row.requested_start)===Date.parse(operation.window.startsAt)&&Date.parse(row.requested_end)===Date.parse(operation.window.endsAt)&&JSON.stringify(normalizeAppointmentPolicy(row.lifecycle_policy_snapshot))===JSON.stringify(operation.terms.policy)&&(!operation.ackId||row.id===operation.ackId));
   else if(operation.command.action==='joinWaitlist')matches=data.waitlist.filter(row=>row.service_listing_id===service&&['waiting','offered'].includes(row.status)&&Date.parse(row.starts_at)===Date.parse(operation.window.startsAt)&&Date.parse(row.ends_at)===Date.parse(operation.window.endsAt)&&(!operation.ackId||row.id===operation.ackId));
   else matches=data.waitlist.filter(row=>row.id===operation.entryId&&row.service_listing_id===service&&['left','cancelled'].includes(row.status));
   if(matches.length===1){uncertain=null;review=null;emit('success');}else emit('uncertain');
  }).catch(error=>{if(current()){if(error?.status===401){review=null;emit('signin');}else emit('uncertain');}}).finally(()=>{controller.abort();if(current())pending=null;});
  await pending;
 }
 function confirm(){
  if(pending)return pending;
  if(disposed||!prepared||state.phase!=='confirm')return Promise.resolve();
  const operation=prepared;prepared=null;const version=++epoch,controller=new AbortController();active=controller;let sent=false,accepted=false;
  const current=()=>!disposed&&epoch===version;
  emit('saving');
  pending=bounded(async()=>{const auth=await identity(operation.owner,controller);if(operation.command.action==='book'&&Date.parse(operation.window.startsAt)<=now())throw Object.assign(Error(),{status:409});sent=true;
   const ack=await send(operation.command,{baseUrl,accessToken:auth.accessToken,profileId:operation.owner,signal:controller.signal});await identity(operation.owner,controller);
   try{if(operation.command.action==='book')operation.ackId=appointmentId(ack.bookingId);else if(operation.command.action==='joinWaitlist')operation.ackId=appointmentId(ack.entryId);}catch{throw Error('Unconfirmed acknowledgement');}
  },controller).then(()=>{if(current()){uncertain=operation;accepted=true;emit('uncertain');}}).catch(error=>{if(!current())return;if(sent&&![400,401,403,409,415,422].includes(error?.status)){uncertain=operation;emit('uncertain');}else{review=null;emit(error?.status===401?'signin':'conflict');}}).finally(async()=>{controller.abort();if(current()){pending=null;if(accepted)await reconcile();}});
  return pending;
 }
 return{load,prepare,back,confirm,reconcile,clear,snapshot:()=>structuredClone(state),dispose(){disposed=true;clear();unsubscribe();}};
}
