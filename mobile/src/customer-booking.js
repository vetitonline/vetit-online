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
 let state={phase:'idle',terms:null,slots:[],entry:null,offers:[],confirmation:null};
 const emit=(phase,extra={})=>{state={phase,terms:review?structuredClone(review.terms):null,slots:review?structuredClone(review.slots):[],entry:review?.entry?structuredClone(review.entry):null,offers:review?structuredClone(review.offers??[]):[],confirmation:null,...extra};if(!disposed)render(state);};
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
   const rawOffers=data.offers??[];if(!Array.isArray(rawOffers)||rawOffers.length>200)throw Error();
   const seenOffers=new Set();const offers=rawOffers.filter(row=>entry?.status==='offered'&&row.entry_id===entry.id&&row.status==='offered').map(row=>{
    const id=appointmentId(row.id);if(seenOffers.has(id)||row.customer_profile_id!==expected||!Number.isSafeInteger(row.price_minor)||row.price_minor<0||row.currency_code!=='INR'||!Number.isFinite(Date.parse(row.expires_at))||!Number.isFinite(Date.parse(row.starts_at))||!Number.isFinite(Date.parse(row.ends_at))||Date.parse(row.ends_at)<=Date.parse(row.starts_at))throw Error();seenOffers.add(id);
    return{id,entryId:entry.id,slotId:appointmentId(row.slot_id),priceMinor:row.price_minor,currencyCode:'INR',policy:normalizeAppointmentPolicy(row.policy_snapshot),expiresAt:row.expires_at,startsAt:row.starts_at,endsAt:row.ends_at};
   }).filter(row=>Date.parse(row.expiresAt)>now()&&Date.parse(row.startsAt)>now());
   return{owner:expected,offers,terms:{title:terms.title,priceMinor:terms.priceMinor,currencyCode:'INR',policy:normalizeAppointmentPolicy(terms.policy)},slots,entry,truncated:availability.truncated};
  },controller).then(value=>{if(current()){review=value;emit('ready');}}).catch(error=>{if(current()){review=null;emit(error?.status===401?'signin':'error');}}).finally(()=>{controller.abort();if(current())pending=null;});
  return pending;
 }
 function prepare(action,slotId){
  if(disposed||pending||uncertain||state.phase!=='ready'||!review||review.owner!==owner)return false;
  try{
   let input,window,offer;
   if(action==='book'){const slot=review.slots.find(row=>row.id===slotId);if(!slot||Date.parse(slot.startsAt)<=now())return false;input={action,slotId:slot.id,expectedPriceMinor:review.terms.priceMinor,expectedCurrencyCode:'INR',expectedPolicy:review.terms.policy};window={startsAt:slot.startsAt,endsAt:slot.endsAt};}
   else if(['acceptOffer','declineOffer'].includes(action)){offer=review.offers.find(row=>row.id===slotId);if(!offer||Date.parse(offer.expiresAt)<=now()||Date.parse(offer.startsAt)<=now())return false;input={action,offerId:offer.id};window={startsAt:offer.startsAt,endsAt:offer.endsAt};}
   else if(action==='joinWaitlist'){if(review.entry)return false;const start=now()+60000;window={startsAt:new Date(start).toISOString(),endsAt:new Date(start+14*86400000).toISOString()};input={action,serviceListingId:service,marketCode:'IN',...window};}
   else if(action==='leaveWaitlist'){if(!review.entry)return false;input={action,entryId:review.entry.id};window={startsAt:review.entry.startsAt,endsAt:review.entry.endsAt};}
   else return false;
   prepared={owner,command:normalizeAppointmentCommand(input),terms:offer?{title:review.terms.title,priceMinor:offer.priceMinor,currencyCode:'INR',policy:structuredClone(offer.policy)}:structuredClone(review.terms),window,...(offer?{offer:structuredClone(offer)}:{}),...(action==='leaveWaitlist'?{entryId:review.entry.id}:{})};emit('confirm',{confirmation:{action,...window,...(offer?{offer:structuredClone(offer)}:{})}});return true;
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
   if(['book','acceptOffer'].includes(operation.command.action))matches=data.bookings.filter(row=>row.appointment_slot_id===(operation.offer?.slotId??operation.command.slotId)&&row.service_listing_id===service&&['requested','confirmed'].includes(row.status)&&row.price_minor===operation.terms.priceMinor&&row.currency_code==='INR'&&Date.parse(row.requested_start)===Date.parse(operation.window.startsAt)&&Date.parse(row.requested_end)===Date.parse(operation.window.endsAt)&&JSON.stringify(normalizeAppointmentPolicy(row.lifecycle_policy_snapshot))===JSON.stringify(operation.terms.policy)&&(!operation.ackId||row.id===operation.ackId)&&(!operation.offer||(data.offers??[]).some(offer=>offer.id===operation.offer.id&&offer.entry_id===operation.offer.entryId&&offer.customer_profile_id===operation.owner&&offer.status==='accepted'&&offer.booking_id===row.id)&&data.waitlist.some(entry=>entry.id===operation.offer.entryId&&entry.service_listing_id===service&&entry.status==='accepted')));
   else if(operation.command.action==='declineOffer')matches=(data.offers??[]).filter(row=>row.id===operation.offer.id&&row.entry_id===operation.offer.entryId&&row.customer_profile_id===operation.owner&&row.status==='declined'&&data.waitlist.some(entry=>entry.id===operation.offer.entryId&&entry.service_listing_id===service&&entry.status==='left'));
   else if(operation.command.action==='joinWaitlist')matches=data.waitlist.filter(row=>row.service_listing_id===service&&['waiting','offered'].includes(row.status)&&Date.parse(row.starts_at)===Date.parse(operation.window.startsAt)&&Date.parse(row.ends_at)===Date.parse(operation.window.endsAt)&&(!operation.ackId||row.id===operation.ackId)&&(!operation.offer||(data.offers??[]).some(offer=>offer.id===operation.offer.id&&offer.entry_id===operation.offer.entryId&&offer.customer_profile_id===operation.owner&&offer.status==='accepted'&&offer.booking_id===row.id)&&data.waitlist.some(entry=>entry.id===operation.offer.entryId&&entry.service_listing_id===service&&entry.status==='accepted')));
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
  pending=bounded(async()=>{const auth=await identity(operation.owner,controller);if((['book','acceptOffer'].includes(operation.command.action)&&Date.parse(operation.window.startsAt)<=now())||(operation.offer&&Date.parse(operation.offer.expiresAt)<=now()))throw Object.assign(Error(),{status:409});sent=true;
   const ack=await send(operation.command,{baseUrl,accessToken:auth.accessToken,profileId:operation.owner,signal:controller.signal});await identity(operation.owner,controller);
   try{if(['book','acceptOffer'].includes(operation.command.action))operation.ackId=appointmentId(ack.bookingId);else if(operation.command.action==='joinWaitlist')operation.ackId=appointmentId(ack.entryId);}catch{throw Error('Unconfirmed acknowledgement');}
  },controller).then(()=>{if(current()){uncertain=operation;accepted=true;emit('uncertain');}}).catch(error=>{if(!current())return;if(sent&&![400,401,403,409,415,422].includes(error?.status)){uncertain=operation;emit('uncertain');}else{review=null;emit(error?.status===401?'signin':'conflict');}}).finally(async()=>{controller.abort();if(current()){pending=null;if(accepted)await reconcile();}});
  return pending;
 }
 return{load,prepare,back,confirm,reconcile,clear,snapshot:()=>structuredClone(state),dispose(){disposed=true;clear();unsubscribe();}};
}
