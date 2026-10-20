import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {appointmentId,AppointmentLifecycleError,normalizeAppointmentPolicy,normalizeAppointmentResourceKey} from '../../src/lib/services/appointment-lifecycle.js';
import {getAppointmentDashboard} from '../../src/lib/services/appointment-lifecycle-client.js';
import {resolveIndianLocale} from '../../src/lib/i18n/locales.js';

const empty=phase=>({phase,businessId:null,businesses:[],bookings:[],services:[],slots:[],policies:[],truncated:false});
const rows=(value,max)=>{if(!Array.isArray(value)||value.length>max||value.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new AppointmentLifecycleError('Invalid appointment response.',503);return value;};
const label=value=>{if(typeof value!=='string'||!value.trim()||value.length>256)throw new AppointmentLifecycleError('Invalid appointment label.',503);return value;};
const instant=value=>{if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw new AppointmentLifecycleError('Invalid appointment time.',503);return value;};
function interval(start,end){start=instant(start);end=instant(end);if(Date.parse(end)<=Date.parse(start))throw new AppointmentLifecycleError('Invalid appointment interval.',503);return{startsAt:start,endsAt:end};}
function project(data,businessId){
 if(!data||typeof data.truncated!=='boolean')throw new AppointmentLifecycleError('Invalid appointment response.',503);
 const businesses=rows(data.providerBusinesses,200).map(x=>({id:appointmentId(x.id),name:label(x.display_name)}));
 if(businessId&&!businesses.some(x=>x.id===businessId))throw new AppointmentLifecycleError('Provider access unavailable.',403);
 const bookings=rows(data.bookings,200).map(x=>{
  if(!Number.isSafeInteger(x.price_minor)||x.price_minor<0||typeof x.currency_code!=='string'||!/^[A-Z]{3}$/.test(x.currency_code)||!Number.isSafeInteger(x.lifecycle_revision)||x.lifecycle_revision<1||x.lifecycle_revision>2147483647)throw new AppointmentLifecycleError('Invalid appointment price or revision.',503);
  return{id:appointmentId(x.id),serviceId:appointmentId(x.service_listing_id),status:label(x.status),revision:x.lifecycle_revision,...interval(x.requested_start,x.requested_end),priceMinor:x.price_minor,currency:x.currency_code};
 });
 const services=rows(data.services,200).map(x=>({id:appointmentId(x.id),title:label(x.title)}));
 const slots=rows(data.slots,200).map(x=>({id:appointmentId(x.id),serviceId:appointmentId(x.service_listing_id),status:label(x.status),resourceKey:normalizeAppointmentResourceKey(x.lifecycle_resource_key??'default'),...interval(x.starts_at,x.ends_at)}));
 const policies=rows(data.policies,200).map(x=>({serviceId:appointmentId(x.service_listing_id),policy:normalizeAppointmentPolicy(x.policy)}));
 return{phase:bookings.length||slots.length?'ready':'empty',businessId,businesses,bookings,services:businessId?services:[],slots:businessId?slots:[],policies:businessId?policies:[],truncated:data.truncated};
}

/** Read-only native view. Identity is reverified; no tokens/private raw rows enter snapshots. */
export function createNativeAppointments({session,apiBaseUrl,testApiOrigin,render,read=getAppointmentDashboard,timeoutMs=10000}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new Error('Invalid appointment timeout.');
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,pending=null,abort=null,selection=null,allowed=new Set();
 function clear(){epoch++;abort?.abort();pending=null;selection=null;allowed.clear();if(!disposed)render(empty('signin'));}
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){const invalidate=owner!==null||next===null;owner=next;if(invalidate)clear();}});
 function load(businessId=null){
  if(disposed)return Promise.resolve();
  if(businessId!==null){try{businessId=appointmentId(businessId);}catch{render(empty('denied'));return Promise.resolve();}if(!allowed.has(businessId)){render(empty('denied'));return Promise.resolve();}}
  if(pending&&selection===businessId)return pending;
  abort?.abort();const generation=++epoch,controller=new AbortController();abort=controller;selection=businessId;render(empty('loading'));
  const current=()=>!disposed&&epoch===generation&&!controller.signal.aborted;
  let timer;
  const work=async()=>{
   const auth=await session.getSession();
   if(!current()||!owner||auth.userId!==owner)throw new AppointmentLifecycleError('Session changed.',401);
   const data=await read({baseUrl,businessId:businessId??undefined,accessToken:auth.accessToken,signal:controller.signal});
   const latest=await session.getSession();
   if(!current()||latest.userId!==auth.userId||owner!==auth.userId)throw new AppointmentLifecycleError('Session changed.',401);
   const state=project(data,businessId);allowed=new Set(state.businesses.map(x=>x.id));return state;
  };
  const task=Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AppointmentLifecycleError('Appointment read timed out.',503)),timeoutMs);})])
   .then(state=>{if(current())render(state);})
   .catch(error=>{if(current()){allowed.clear();selection=null;render(empty(error?.status===401?'signin':error?.status===403?'denied':'error'));}})
   .finally(()=>{clearTimeout(timer);controller.abort();if(epoch===generation)pending=null;});
  pending=task;return task;
 }
 return{load,refresh:()=>load(selection),clear,dispose:()=>{disposed=true;clear();unsubscribe();}};
}

const copy={
 en:{title:'Appointments and provider schedule',intro:'Review appointments and provider availability. Provider booking actions require confirmation.',personal:'My appointments',provider:'Provider schedule',loading:'Loading appointments…',signin:'Sign in to view appointments.',denied:'Provider access is unavailable. Refresh your appointments.',error:'Appointment management is unavailable. Try again later.',empty:'No appointments or slots in this view.',slots:'Schedule',appointment:'Appointment',partial:'Only a limited set is shown. Open the website for the remaining records.',refresh:'Refresh appointments',zone:'Times shown in India time (Asia/Kolkata).'},
 hi:{title:'अपॉइंटमेंट और सेवा प्रदाता का समय',intro:'अपॉइंटमेंट और उपलब्ध समय देखें। सेवा प्रदाता के बदलावों की पुष्टि आवश्यक है।',personal:'मेरे अपॉइंटमेंट',provider:'सेवा प्रदाता का समय',loading:'अपॉइंटमेंट लोड हो रहे हैं…',signin:'अपॉइंटमेंट देखने के लिए साइन इन करें।',denied:'सेवा प्रदाता की अनुमति उपलब्ध नहीं है। अपने अपॉइंटमेंट फिर खोलें।',error:'अपॉइंटमेंट अभी उपलब्ध नहीं हैं। बाद में प्रयास करें।',empty:'इस सूची में कोई अपॉइंटमेंट या समय नहीं है।',slots:'समय सूची',appointment:'अपॉइंटमेंट',partial:'यहाँ सीमित जानकारी दिखाई गई है। बाकी जानकारी के लिए वेबसाइट खोलें।',refresh:'अपॉइंटमेंट फिर खोलें',zone:'समय भारतीय समय (Asia/Kolkata) में दिखाए गए हैं।'},
};
export function appointmentCopy(language='en'){return copy[resolveIndianLocale(language,Object.keys(copy)).language];}
const statuses={pending:['Pending','लंबित'],requested:['Requested','अनुरोध किया गया'],confirmed:['Confirmed','पुष्टि हुई'],completed:['Completed','पूरा हुआ'],cancelled:['Cancelled','रद्द'],available:['Available','उपलब्ध'],held:['Held','रुका हुआ'],booked:['Booked','बुक किया गया'],blocked:['Blocked','बंद'],no_show:['Not attended','उपस्थित नहीं हुए']};
export function appointmentStatus(status,language='en'){return statuses[status]?.[resolveIndianLocale(language).language==='hi'?1:0]??(resolveIndianLocale(language).language==='hi'?'स्थिति उपलब्ध नहीं है':'Status unavailable');}
export function appointmentTime(value,language='en'){return new Intl.DateTimeFormat(resolveIndianLocale(language).locale,{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));}
