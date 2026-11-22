import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {normalizeAppointmentCommand,previewAppointmentCancellation,previewAppointmentReschedule,appointmentId} from '../../src/lib/services/appointment-lifecycle.js';
import {requestAppointmentSlots} from '../../src/lib/services/appointment-client.js';
import {sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
import {resolveIndianLocale} from '../../src/lib/i18n/locales.js';

const target={confirm:'confirmed',complete:'completed',cancel:'cancelled'};
export function providerBookingActions(booking,now=Date.now()){
 if(!booking||!Number.isSafeInteger(booking.revision)||booking.revision<1||booking.revision>2147483647)return[];
 if(booking.status==='requested')return['confirm','cancel'];
 if(booking.status==='confirmed')return[...(Number.isFinite(Date.parse(booking.endsAt))&&Date.parse(booking.endsAt)<=now?['complete']:[]),'cancel'];
 return[];
}

export function customerBookingActions(booking,now=Date.now()){
 if(!booking||!['requested','confirmed'].includes(booking.status)||!Number.isSafeInteger(booking.revision)||booking.revision<1||booking.revision>2147483647||!booking.cancellationPolicy)return[];
 try{return previewAppointmentCancellation({policy:booking.cancellationPolicy,startsAt:booking.startsAt,capturedMinor:0,now}).allowed?['cancel']:[];}catch{return[];}
}

export function customerCanReschedule(booking,now=Date.now()){try{return Boolean(booking&&['requested','confirmed'].includes(booking.status)&&Number.isSafeInteger(booking.revision)&&booking.revision>0&&booking.revision<=2147483647&&booking.cancellationPolicy&&previewAppointmentReschedule({policy:booking.cancellationPolicy,startsAt:booking.startsAt,now}));}catch{return false;}}

/** Commands require a returned customer/provider scope, explicit confirmation and the
 * displayed revision. No automatic retry; uncertain writes require fresh reads.
 * The database's current permissions/revision checks remain authoritative.
 */
function createAppointmentActions({audience='provider',session,apiBaseUrl,testApiOrigin,getView,refresh,render,send=sendAppointmentCommand,readSlots=requestAppointmentSlots,timeoutMs=10000,now=Date.now}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid action timeout.');
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,prepared=null,uncertain=null,staleView=null,pending=null,abort=null,selection=null,loading=null;
 let state={phase:'idle',action:null,bookingId:null};
 const emit=(phase,command=null)=>{state={phase,action:command?.action??null,bookingId:command?.bookingId??null,...(phase==='choosing'?{slots:structuredClone(selection?.slots??[])}:{}),...(phase==='confirm'&&prepared?.slot?{replacement:structuredClone(prepared.slot)}:{})};if(!disposed)render(state);};
 function clear(){epoch++;abort?.abort();pending=null;loading=null;selection=null;prepared=null;uncertain=null;staleView=getView();emit('idle');}
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){owner=next;clear();}});
 function scopedBooking(id){const view=getView();const personal=!view?.businessId&&audience!=='provider';const provider=view?.businessId&&audience!=='customer'&&view.businesses.some(b=>b.id===view.businessId);return view?.phase==='ready'&&(personal||provider)?view.bookings.find(b=>b.id===id):null;}
 const available=booking=>getView().businessId?providerBookingActions(booking,now()):customerBookingActions(booking,now());
 function prepare(action,bookingId,slotId){
  if(disposed||pending||loading||uncertain||getView()===staleView||!owner)return false;
  const booking=scopedBooking(bookingId);const moving=action==='reschedule';const slot=moving?selection?.slots.find(row=>row.id===slotId):null;
  if(moving?getView().businessId||!customerCanReschedule(booking,now())||selection?.bookingId!==bookingId||selection?.revision!==booking?.revision||selection?.owner!==owner||!slot||Date.parse(slot.startsAt)<=now():!available(booking).includes(action))return false;
  try{prepared={command:normalizeAppointmentCommand({action,bookingId,expectedRevision:booking.revision,...(moving?{slotId:slot.id}:{}),...(action==='cancel'&&getView().businessId?{providerCancellation:true}:{})}),businessId:getView().businessId,owner,...(moving?{slot:structuredClone(slot),priceMinor:booking.priceMinor,currency:booking.currency,status:booking.status,serviceId:booking.serviceId}:{})};}
  catch{return false;}
  emit('confirm',prepared.command);return true;
 }
 function cancel(){if(!pending&&['confirm','choosing','loading_slots'].includes(state.phase)){epoch++;abort?.abort();loading=null;selection=null;prepared=null;emit('idle');}}
 async function loadReplacements(bookingId){
  if(disposed||pending||uncertain||loading||!owner||getView().businessId||getView()===staleView)return;
  const booking=scopedBooking(bookingId);if(!customerCanReschedule(booking,now()))return;
  prepared=null;selection=null;const expectedOwner=owner,revision=booking.revision,generation=++epoch,controller=new AbortController();abort=controller;
  const current=()=>!disposed&&epoch===generation&&!controller.signal.aborted;let timer;emit('loading_slots',{action:'reschedule',bookingId});
  const work=async()=>{const auth=await session.getSession();if(!current()||auth.userId!==expectedOwner)throw Error();
   const result=await readSlots({baseUrl,serviceListingId:booking.serviceId,signal:controller.signal});const latest=await session.getSession();
   if(!current()||latest.userId!==expectedOwner||owner!==expectedOwner||getView().businessId||scopedBooking(bookingId)?.revision!==revision)throw Error();
   if(!Array.isArray(result.slots)||result.slots.length>200||typeof result.truncated!=='boolean')throw Error();
   const seen=new Set();const slots=result.slots.map(row=>{const id=appointmentId(row.id);if(seen.has(id)||!Number.isFinite(Date.parse(row.startsAt))||!Number.isFinite(Date.parse(row.endsAt))||Date.parse(row.endsAt)<=Date.parse(row.startsAt))throw Error();seen.add(id);return{id,startsAt:row.startsAt,endsAt:row.endsAt};}).filter(row=>row.id!==booking.slotId&&Date.parse(row.startsAt)>now());
   return {bookingId,owner:expectedOwner,revision,slots,truncated:result.truncated};};
  loading=Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error()),timeoutMs);})]).then(value=>{if(current()){selection=value;emit('choosing',{action:'reschedule',bookingId});}}).catch(()=>{if(current())emit('conflict',{action:'reschedule',bookingId});}).finally(()=>{clearTimeout(timer);if(epoch===generation){controller.abort();loading=null;}});
  await loading;
 }
 async function reconcile(){
  if(disposed||pending||loading)return;
  const generation=epoch;prepared=null;
  try{await refresh();}catch{if(!disposed&&epoch===generation)emit(uncertain?'uncertain':'conflict',uncertain?.command);return;}
  if(disposed||epoch!==generation)return;
  const view=getView();if(!['ready','empty'].includes(view?.phase)){emit(uncertain?'uncertain':'conflict',uncertain?.command);return;}
  if(uncertain){
   const booking=view.businessId===uncertain.businessId?scopedBooking(uncertain.command.bookingId):null;
   if((uncertain.command.action==='reschedule'?booking?.slotId===uncertain.command.slotId&&booking.serviceId===uncertain.serviceId&&booking.priceMinor===uncertain.priceMinor&&booking.currency===uncertain.currency&&booking.status===uncertain.status&&Date.parse(booking.startsAt)===Date.parse(uncertain.slot.startsAt)&&Date.parse(booking.endsAt)===Date.parse(uncertain.slot.endsAt):booking?.status===target[uncertain.command.action])&&booking.revision>uncertain.command.expectedRevision){const command=uncertain.command;uncertain=null;staleView=null;emit('success',command);}
   else if(booking&&booking.revision>uncertain.command.expectedRevision){uncertain=null;staleView=null;emit('conflict');}
   else emit('uncertain',uncertain.command);
  }else{staleView=null;emit('idle');}
 }
 function confirm(){
  if(pending)return pending;
  if(disposed||!prepared||state.phase!=='confirm')return Promise.resolve();
  const operation=prepared,booking=scopedBooking(operation.command.bookingId);
  if(owner!==operation.owner||getView().businessId!==operation.businessId||booking?.revision!==operation.command.expectedRevision||!(operation.command.action==='reschedule'?customerCanReschedule(booking,now())&&Date.parse(operation.slot.startsAt)>now():available(booking).includes(operation.command.action))){prepared=null;staleView=getView();emit('conflict');return Promise.resolve();}
  prepared=null;const generation=++epoch,controller=new AbortController();abort=controller;
  const current=()=>!disposed&&epoch===generation;
  let sent=false,timer,accepted=false;
  emit('saving',operation.command);
  const work=async()=>{
   const auth=await session.getSession();if(!current()||controller.signal.aborted||auth.userId!==operation.owner||owner!==operation.owner)throw Object.assign(Error('Session changed.'),{status:401});
   sent=true;
   const result=await send(operation.command,{baseUrl,accessToken:auth.accessToken,profileId:operation.owner,signal:controller.signal});
   if(!result||result.bookingId!==operation.command.bookingId||(operation.command.action!=='reschedule'&&result.status!==target[operation.command.action]))throw Error('Unconfirmed response.');
   const latest=await session.getSession();if(!current()||controller.signal.aborted||latest.userId!==operation.owner||owner!==operation.owner)throw Object.assign(Error('Session changed.'),{status:401});
  };
  pending=Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Action timed out.')),timeoutMs);})])
   .then(()=>{if(current()){uncertain=operation;emit('uncertain',operation.command);accepted=true;}})
   .catch(error=>{if(!current())return;staleView=getView();
    if(sent&&![400,401,403,409,415,422].includes(error?.status)){uncertain=operation;emit('uncertain',operation.command);}
    else emit(error?.status===401?'signin':error?.status===403?'denied':'conflict');
   })
   .finally(async()=>{clearTimeout(timer);controller.abort();if(current()){pending=null;if(accepted)await reconcile();}});
  return pending;
 }
 return{prepare,loadReplacements,confirm,cancel,reconcile,clear,snapshot:()=>({...state}),dispose:()=>{disposed=true;clear();unsubscribe();}};
}

export const createProviderAppointmentActions=options=>createAppointmentActions({...options,audience:'provider'});
export const createCustomerAppointmentActions=options=>createAppointmentActions({...options,audience:'customer'});
export const createNativeAppointmentActions=options=>createAppointmentActions({...options,audience:'auto'});

const copy={
 en:{reschedule:'Reschedule appointment',loading_slots:'Loading replacement times…',choosing:'Choose an available replacement time (next 14 days). Results may be limited.',confirm:'Confirm appointment',complete:'Mark completed',cancel:'Cancel as provider',question:'Apply this provider action to the displayed appointment?',warning:'Provider cancellation may require refund review. This action does not issue a refund or charge a payment.',apply:'Apply appointment action',back:'Keep appointment unchanged',saving:'Saving appointment change…',uncertain:'The change is unconfirmed. Check its current status before another action; do not submit it again.',conflict:'The appointment changed or the action was rejected. Check its current status before choosing another action.',signin:'Sign in again, then check the current appointment status.',denied:'Current provider permission is required. Check the current appointment status.',success:'Appointment change verified in refreshed records.',check:'Check current appointment status'},
 hi:{reschedule:'अपॉइंटमेंट का समय बदलें',loading_slots:'नए समय लोड हो रहे हैं…',choosing:'अगले 14 दिनों में उपलब्ध नया समय चुनें। परिणाम सीमित हो सकते हैं।',confirm:'अपॉइंटमेंट की पुष्टि करें',complete:'पूरा हुआ चिह्नित करें',cancel:'सेवा प्रदाता के रूप में रद्द करें',question:'दिखाए गए अपॉइंटमेंट पर यह बदलाव लागू करें?',warning:'सेवा प्रदाता द्वारा रद्द करने पर रिफंड की समीक्षा आवश्यक हो सकती है। इससे रिफंड या भुगतान नहीं होता।',apply:'अपॉइंटमेंट में बदलाव लागू करें',back:'अपॉइंटमेंट न बदलें',saving:'अपॉइंटमेंट का बदलाव सहेजा जा रहा है…',uncertain:'बदलाव की पुष्टि नहीं हुई है। फिर से भेजने से पहले वर्तमान स्थिति जाँचें।',conflict:'अपॉइंटमेंट बदल गया है या अनुरोध स्वीकार नहीं हुआ। अगला बदलाव चुनने से पहले स्थिति जाँचें।',signin:'फिर साइन इन करें और अपॉइंटमेंट की स्थिति जाँचें।',denied:'सेवा प्रदाता की वर्तमान अनुमति आवश्यक है। अपॉइंटमेंट की स्थिति जाँचें।',success:'नई जानकारी में अपॉइंटमेंट के बदलाव की पुष्टि हुई।',check:'अपॉइंटमेंट की वर्तमान स्थिति जाँचें'},
};
export function providerActionCopy(language='en'){return copy[resolveIndianLocale(language,Object.keys(copy)).language];}

export function customerActionCopy(language='en'){
 const hi=resolveIndianLocale(language).language==='hi';
 return {...providerActionCopy(language),cancel:hi?'अपॉइंटमेंट रद्द करें':'Cancel appointment',question:hi?'सहेजी गई नीति के अनुसार इस बदलाव की पुष्टि करें?':'Confirm this change under the saved appointment policy?',warning:hi?'अंतिम पात्रता सर्वर जाँचता है। रिफंड की समीक्षा आवश्यक है; कोई भुगतान नहीं किया जाएगा।':'The server checks final eligibility. Refunds require review; no refund or payment is performed here.',apply:hi?'बदलाव की पुष्टि करें':'Confirm appointment change',denied:hi?'इस बदलाव की अनुमति नहीं है। स्थिति फिर से जाँचें।':'This customer action is not permitted. Check the current appointment status.'};
}
