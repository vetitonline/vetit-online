import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {normalizeAppointmentCommand} from '../../src/lib/services/appointment-lifecycle.js';
import {sendAppointmentCommand} from '../../src/lib/services/appointment-lifecycle-client.js';
import {resolveIndianLocale} from '../../src/lib/i18n/locales.js';

const target={confirm:'confirmed',complete:'completed',cancel:'cancelled'};
export function providerBookingActions(booking,now=Date.now()){
 if(!booking||!Number.isSafeInteger(booking.revision)||booking.revision<1||booking.revision>2147483647)return[];
 if(booking.status==='requested')return['confirm','cancel'];
 if(booking.status==='confirmed')return[...(Number.isFinite(Date.parse(booking.endsAt))&&Date.parse(booking.endsAt)<=now?['complete']:[]),'cancel'];
 return[];
}

/** Commands require a returned provider scope, explicit confirmation and the
 * displayed revision. No automatic retry; uncertain writes require fresh reads.
 * The database's current permissions/revision checks remain authoritative.
 */
export function createProviderAppointmentActions({session,apiBaseUrl,testApiOrigin,getView,refresh,render,send=sendAppointmentCommand,timeoutMs=10000,now=Date.now}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid action timeout.');
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,prepared=null,uncertain=null,staleView=null,pending=null,abort=null;
 let state={phase:'idle',action:null,bookingId:null};
 const emit=(phase,command=null)=>{state={phase,action:command?.action??null,bookingId:command?.bookingId??null};if(!disposed)render(state);};
 function clear(){epoch++;abort?.abort();pending=null;prepared=null;uncertain=null;staleView=getView();emit('idle');}
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){owner=next;clear();}});
 function scopedBooking(id){const view=getView();return view?.phase==='ready'&&view.businessId&&view.businesses.some(b=>b.id===view.businessId)?view.bookings.find(b=>b.id===id):null;}
 function prepare(action,bookingId){
  if(disposed||pending||uncertain||getView()===staleView||!owner)return false;
  const booking=scopedBooking(bookingId);if(!providerBookingActions(booking,now()).includes(action))return false;
  try{prepared={command:normalizeAppointmentCommand({action,bookingId,expectedRevision:booking.revision,...(action==='cancel'?{providerCancellation:true}:{})}),businessId:getView().businessId,owner};}
  catch{return false;}
  emit('confirm',prepared.command);return true;
 }
 function cancel(){if(!pending&&state.phase==='confirm'){prepared=null;emit('idle');}}
 async function reconcile(){
  if(disposed||pending)return;
  const generation=epoch;prepared=null;
  try{await refresh();}catch{if(!disposed&&epoch===generation)emit(uncertain?'uncertain':'conflict',uncertain?.command);return;}
  if(disposed||epoch!==generation)return;
  const view=getView();if(!['ready','empty'].includes(view?.phase)){emit(uncertain?'uncertain':'conflict',uncertain?.command);return;}
  if(uncertain){
   const booking=view.businessId===uncertain.businessId?scopedBooking(uncertain.command.bookingId):null;
   if(booking?.status===target[uncertain.command.action]&&booking.revision>uncertain.command.expectedRevision){const command=uncertain.command;uncertain=null;staleView=null;emit('success',command);}
   else if(booking&&booking.revision>uncertain.command.expectedRevision){uncertain=null;staleView=null;emit('conflict');}
   else emit('uncertain',uncertain.command);
  }else{staleView=null;emit('idle');}
 }
 function confirm(){
  if(pending)return pending;
  if(disposed||!prepared||state.phase!=='confirm')return Promise.resolve();
  const operation=prepared,booking=scopedBooking(operation.command.bookingId);
  if(owner!==operation.owner||getView().businessId!==operation.businessId||booking?.revision!==operation.command.expectedRevision||!providerBookingActions(booking,now()).includes(operation.command.action)){prepared=null;staleView=getView();emit('conflict');return Promise.resolve();}
  prepared=null;const generation=++epoch,controller=new AbortController();abort=controller;
  const current=()=>!disposed&&epoch===generation;
  let sent=false,timer,accepted=false;
  emit('saving',operation.command);
  const work=async()=>{
   const auth=await session.getSession();if(!current()||controller.signal.aborted||auth.userId!==operation.owner||owner!==operation.owner)throw Object.assign(Error('Session changed.'),{status:401});
   sent=true;
   const result=await send(operation.command,{baseUrl,accessToken:auth.accessToken,signal:controller.signal});
   if(!result||result.bookingId!==operation.command.bookingId||result.status!==target[operation.command.action])throw Error('Unconfirmed response.');
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
 return{prepare,confirm,cancel,reconcile,clear,snapshot:()=>({...state}),dispose:()=>{disposed=true;clear();unsubscribe();}};
}

const copy={
 en:{confirm:'Confirm appointment',complete:'Mark completed',cancel:'Cancel as provider',question:'Apply this provider action to the displayed appointment?',warning:'Provider cancellation may require refund review. This action does not issue a refund or charge a payment.',apply:'Apply appointment action',back:'Keep appointment unchanged',saving:'Saving appointment change…',uncertain:'The change is unconfirmed. Check its current status before another action; do not submit it again.',conflict:'The appointment changed or the action was rejected. Check its current status before choosing another action.',signin:'Sign in again, then check the current appointment status.',denied:'Current provider permission is required. Check the current appointment status.',success:'Appointment change verified in refreshed records.',check:'Check current appointment status'},
 hi:{confirm:'अपॉइंटमेंट की पुष्टि करें',complete:'पूरा हुआ चिह्नित करें',cancel:'सेवा प्रदाता के रूप में रद्द करें',question:'दिखाए गए अपॉइंटमेंट पर यह बदलाव लागू करें?',warning:'सेवा प्रदाता द्वारा रद्द करने पर रिफंड की समीक्षा आवश्यक हो सकती है। इससे रिफंड या भुगतान नहीं होता।',apply:'अपॉइंटमेंट में बदलाव लागू करें',back:'अपॉइंटमेंट न बदलें',saving:'अपॉइंटमेंट का बदलाव सहेजा जा रहा है…',uncertain:'बदलाव की पुष्टि नहीं हुई है। फिर से भेजने से पहले वर्तमान स्थिति जाँचें।',conflict:'अपॉइंटमेंट बदल गया है या अनुरोध स्वीकार नहीं हुआ। अगला बदलाव चुनने से पहले स्थिति जाँचें।',signin:'फिर साइन इन करें और अपॉइंटमेंट की स्थिति जाँचें।',denied:'सेवा प्रदाता की वर्तमान अनुमति आवश्यक है। अपॉइंटमेंट की स्थिति जाँचें।',success:'नई जानकारी में अपॉइंटमेंट के बदलाव की पुष्टि हुई।',check:'अपॉइंटमेंट की वर्तमान स्थिति जाँचें'},
};
export function providerActionCopy(language='en'){return copy[resolveIndianLocale(language,Object.keys(copy)).language];}
