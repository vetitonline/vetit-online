import React,{useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,View} from 'react-native';
import {createNativeAppointments,appointmentCopy,appointmentStatus,appointmentTime,type NativeAppointmentsState} from './appointments.js';
import {NativeProviderSchedule} from './NativeProviderSchedule';
import type {NativeModerationSession} from './moderation-session.js';
import {formatWorkspaceMoney} from '../../src/lib/marketplace/workspace-copy.js';
import {createProviderAppointmentActions,providerBookingActions,providerActionCopy,type ProviderActionState} from './provider-appointment-actions.js';
export function NativeAppointments({session,apiBaseUrl,testApiOrigin,language='en'}:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;language?:string}){
 const copy=appointmentCopy(language),sourceKey=apiBaseUrl+'|'+testApiOrigin;
 const blank:NativeAppointmentsState={phase:'idle',businessId:null,businesses:[],bookings:[],services:[],slots:[],policies:[],truncated:false};
 const [saved,setState]=useState({source:session,sourceKey,value:blank});
 const state=saved.source===session&&saved.sourceKey===sourceKey?saved.value:blank;
 const idle:ProviderActionState={phase:'idle',action:null,bookingId:null};
 const [savedAction,setAction]=useState({source:session,sourceKey,value:idle});
 const action=savedAction.source===session&&savedAction.sourceKey===sourceKey?savedAction.value:idle;
 const actionCopy=providerActionCopy(language);
 const liveView=useRef(blank);
 const host=useRef<ReturnType<typeof createNativeAppointments>|null>(null);
 const actions=useRef<ReturnType<typeof createProviderAppointmentActions>|null>(null);
 useEffect(()=>{let active=true,view=blank;const controller=createNativeAppointments({session,apiBaseUrl,testApiOrigin,render:value=>{view=value;liveView.current=value;if(active)setState({source:session,sourceKey,value});}});host.current=controller;
  const commands=createProviderAppointmentActions({session,apiBaseUrl,testApiOrigin,getView:()=>view,refresh:controller.refresh,render:value=>{if(active)setAction({source:session,sourceKey,value});}});actions.current=commands;void controller.load();
  const listener=AppState.addEventListener('change',value=>{if(value==='active')void controller.load();else{commands.clear();controller.clear();}});
  return()=>{active=false;listener.remove();commands.dispose();controller.dispose();if(host.current===controller)host.current=null;if(actions.current===commands)actions.current=null;};
 },[session,apiBaseUrl,testApiOrigin]);
 const [scheduleBusy,setScheduleBusy]=useState(false);
 const blocked=scheduleBusy||!['idle','success'].includes(action.phase);
 const button=(label:string,run:()=>void,reconciliation=false)=><Pressable accessibilityRole="button" disabled={state.phase==='loading'||action.phase==='saving'||(!reconciliation&&blocked)} onPress={run}><Text>{label}</Text></Pressable>;
 const title=(serviceId:string)=>state.services.find(x=>x.id===serviceId)?.title??copy.appointment;
 return <View style={{gap:12}}><Text accessibilityRole="header">{copy.title}</Text><Text>{copy.intro}</Text>
  {state.phase==='loading'&&<Text accessibilityLiveRegion="polite">{copy.loading}</Text>}
  {state.phase==='signin'&&<Text>{copy.signin}</Text>}
  {state.phase==='denied'&&<Text accessibilityRole="alert">{copy.denied}</Text>}
  {state.phase==='error'&&<Text accessibilityRole="alert">{copy.error}</Text>}
  {state.phase==='empty'&&<Text>{copy.empty}</Text>}
  {button(copy.personal,()=>{actions.current?.clear();void host.current?.load();})}
  {state.businesses.map(b=><View key={b.id}>{button(`${copy.provider}: ${b.name}`,()=>{actions.current?.clear();void host.current?.load(b.id);})}</View>)}
  {!!(state.bookings.length||state.slots.length)&&<Text>{copy.zone}</Text>}
  {state.bookings.map(b=><View key={b.id}><Text>{title(b.serviceId)}</Text><Text>{appointmentStatus(b.status,language)}</Text><Text>{appointmentTime(b.startsAt,language)} – {appointmentTime(b.endsAt,language)}</Text><Text>{formatWorkspaceMoney(b.priceMinor,b.currency,language)}</Text>
   {state.businessId&&providerBookingActions(b).map(kind=><View key={kind}>{button(actionCopy[kind],()=>{actions.current?.prepare(kind,b.id);})}</View>)}
  </View>)}
  {!!state.slots.length&&<Text accessibilityRole="header">{copy.slots}</Text>}
  {state.slots.map(s=><View key={s.id}><Text>{title(s.serviceId)}</Text><Text>{appointmentStatus(s.status,language)}</Text><Text>{appointmentTime(s.startsAt,language)} – {appointmentTime(s.endsAt,language)}</Text></View>)}
  <NativeProviderSchedule session={session} apiBaseUrl={apiBaseUrl} testApiOrigin={testApiOrigin} view={state} getView={()=>liveView.current} refresh={()=>host.current?.refresh()??Promise.resolve()} bookingBusy={!['idle','success'].includes(action.phase)} onBusy={setScheduleBusy} language={language}/>
  {state.truncated&&<Text>{copy.partial}</Text>}
  {action.phase==='confirm'&&<View><Text accessibilityRole="header">{actionCopy.question}</Text><Text>{action.action&&actionCopy[action.action]}</Text>{state.bookings.filter(b=>b.id===action.bookingId).map(b=><Text key={b.id}>{title(b.serviceId)} · {appointmentTime(b.startsAt,language)}</Text>)}{action.action==='cancel'&&<Text>{actionCopy.warning}</Text>}{button(actionCopy.apply,()=>void actions.current?.confirm(),true)}{button(actionCopy.back,()=>actions.current?.cancel(),true)}</View>}
  {action.phase!=='idle'&&action.phase!=='confirm'&&<Text accessibilityRole={['uncertain','conflict','denied','signin'].includes(action.phase)?'alert':undefined} accessibilityLiveRegion="polite">{actionCopy[action.phase]}</Text>}
  {blocked&&action.phase!=='confirm'&&action.phase!=='saving'&&button(actionCopy.check,()=>void actions.current?.reconcile(),true)}
  {button(copy.refresh,()=>void actions.current?.reconcile())}
 </View>;
}
