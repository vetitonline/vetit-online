import React,{useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {createNativeCustomerBooking,type CustomerBookingState} from './customer-booking.js';
import type {NativeModerationSession} from './moderation-session.js';
import {appointmentTime} from './appointments.js';
import {formatWorkspaceMoney} from '../../src/lib/marketplace/workspace-copy.js';
import {resolveIndianLocale} from '../../src/lib/i18n/locales.js';
export function NativeCustomerBooking({session,apiBaseUrl,testApiOrigin,serviceId,language='en'}:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;serviceId:string;language?:string}){
 const blank:CustomerBookingState={phase:'idle',terms:null,slots:[],entry:null,confirmation:null};
 const key=apiBaseUrl+'|'+testApiOrigin+'|'+serviceId;
 const [saved,setSaved]=useState({session,key,state:blank});const state=saved.session===session&&saved.key===key?saved.state:blank;
 const host=useRef<ReturnType<typeof createNativeCustomerBooking>|null>(null);
 useEffect(()=>{let active=true;const controller=createNativeCustomerBooking({session,apiBaseUrl,testApiOrigin,serviceId,render:state=>{if(active)setSaved({session,key,state});}});host.current=controller;const subscription=AppState.addEventListener('change',value=>{if(value!=='active')controller.clear();});return()=>{active=false;subscription.remove();controller.dispose();if(host.current===controller)host.current=null;};},[session,apiBaseUrl,testApiOrigin,serviceId]);
 const hi=resolveIndianLocale(language).language==='hi';
 const button=(label:string,run:()=>void)=><Pressable accessibilityRole="button" onPress={run}><Text>{label}</Text></Pressable>;
 return <View style={{gap:8}}>
  {['idle','success','error','conflict','signin'].includes(state.phase)&&button(hi?'बुकिंग विकल्प खोलें':'Load booking options',()=>void host.current?.load())}
  {state.terms&&<><Text>{state.terms.title}</Text><Text>{formatWorkspaceMoney(state.terms.priceMinor,state.terms.currencyCode,language)}</Text><Text>{hi?'नीति और कीमत सर्वर फिर से जाँचेगा।':'Current policy and price are checked again by the server.'}</Text><Text>{`${state.terms.policy.noticeMinutes} min notice · cancellation ${state.terms.policy.allowCustomerCancellation?'allowed':'not allowed'} · reschedule ${state.terms.policy.allowReschedule?'allowed':'not allowed'}`}</Text><Text>{`Timely refund ${state.terms.policy.refundBasisPoints/100}% · late cancellation ${state.terms.policy.allowLateCancellation?'allowed':'not allowed'} · late refund ${state.terms.policy.lateRefundBasisPoints/100}% · offer expiry ${state.terms.policy.offerExpiryMinutes} minutes`}</Text><Text>{state.terms.policy.lateCancellationChargePermitted?state.terms.policy.lateCancellationChargeDisclosure:'No late cancellation charge authorized. Refunds require review.'}</Text></>}
  {state.phase==='ready'&&<>
   <Text>{hi?'अगले 14 दिनों के समय (परिणाम सीमित हो सकते हैं)':'Times in the next 14 days (results may be limited)'}</Text>
   {!state.slots.length&&<Text>{hi?'अभी कोई समय उपलब्ध नहीं है।':'No times are currently available.'}</Text>}
   {state.slots.map(slot=><View key={slot.id}>{button(`${appointmentTime(slot.startsAt,language)} – ${appointmentTime(slot.endsAt,language)}`,()=>host.current?.prepare('book',slot.id))}</View>)}
   {state.entry?<><Text>{hi?'आप पहले से प्रतीक्षा सूची में हैं।':'You already have a waiting-list entry.'}</Text><Text>{appointmentTime(state.entry.startsAt,language)} – {appointmentTime(state.entry.endsAt,language)}</Text>{button(hi?'प्रतीक्षा सूची छोड़ें':'Leave waiting list',()=>host.current?.prepare('leaveWaitlist'))}</>:button(hi?'अगले 14 दिनों की प्रतीक्षा सूची में जुड़ें':'Join waiting list for the next 14 days',()=>host.current?.prepare('joinWaitlist'))}
  </>}
  {state.phase==='confirm'&&state.confirmation&&<View><Text accessibilityRole="header">{hi?'अपॉइंटमेंट अनुरोध की पुष्टि करें':'Confirm appointment request'}</Text><Text>{state.confirmation.action==='book'?(hi?'इस समय की बुकिंग का अनुरोध करें':'Request this appointment time'):state.confirmation.action==='joinWaitlist'?(hi?'प्रतीक्षा सूची में जुड़ें; यह बुकिंग नहीं है':'Join the waiting list; this is not a booking'):(hi?'प्रतीक्षा सूची छोड़ें':'Leave the waiting list')}</Text><Text>{appointmentTime(state.confirmation.startsAt,language)} – {appointmentTime(state.confirmation.endsAt,language)}</Text><Text>{hi?'इससे कोई भुगतान नहीं होगा। ऑफर की शर्तें बाद में जाँचें।':'No payment is processed here. Waitlist offer terms must be reviewed separately.'}</Text>{button(hi?'अनुरोध की पुष्टि करें':'Confirm request',()=>void host.current?.confirm())}{button(hi?'वापस':'Back',()=>host.current?.back())}</View>}
  {['loading','saving','checking'].includes(state.phase)&&<Text accessibilityLiveRegion="polite">{hi?'वर्तमान जानकारी जाँची जा रही है…':'Checking current appointment records…'}</Text>}
  {state.phase==='uncertain'&&<><Text accessibilityRole="alert">{hi?'अनुरोध की पुष्टि नहीं हुई है। फिर से भेजने से पहले स्थिति जाँचें।':'The request is unconfirmed. Check its current status before another request; do not send it again.'}</Text>{button(hi?'अनुरोध की स्थिति जाँचें':'Check request status',()=>void host.current?.reconcile())}</>}
  {state.phase==='success'&&<Text accessibilityLiveRegion="polite">{hi?'नई जानकारी में अनुरोध सत्यापित हुआ।':'Request verified in refreshed records.'}</Text>}
  {state.phase==='signin'&&<Text>{hi?'पहले साइन इन करें।':'Sign in before requesting an appointment.'}</Text>}
  {['error','conflict'].includes(state.phase)&&<Text accessibilityRole="alert">{hi?'वर्तमान नीति और उपलब्धता फिर से खोलें।':'Reload current terms and availability. The request was not confirmed.'}</Text>}
 </View>;
}
