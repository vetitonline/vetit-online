import React,{useEffect,useRef,useState} from 'react';
import {AppState,Pressable,Text,TextInput,View} from 'react-native';
import {createProviderSchedule} from './provider-schedule.js';
import {INITIAL_APPOINTMENT_POLICY} from '../../src/lib/services/appointment-lifecycle.js';
import type {NativeAppointmentsState} from './appointments.js';
import type {NativeModerationSession} from './moderation-session.js';
type Command=Record<string,unknown>;
type WriteState={phase:string;command:Command|null};
export function NativeProviderSchedule({session,apiBaseUrl,testApiOrigin,view,getView,refresh,bookingBusy,onBusy,language='en'}:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;view:NativeAppointmentsState;getView:()=>NativeAppointmentsState;refresh:()=>Promise<void>;bookingBusy:boolean;onBusy:(busy:boolean)=>void;language?:string}){
 const latest=useRef({view,getView,refresh});latest.current={view,getView,refresh};
 const [state,setState]=useState<WriteState>({phase:'idle',command:null}),[service,setService]=useState(''),[start,setStart]=useState(''),[end,setEnd]=useState(''),[resource,setResource]=useState('default');
 const [policy,setPolicy]=useState<Record<string,boolean|number|string>>({...INITIAL_APPOINTMENT_POLICY});
 const host=useRef<ReturnType<typeof createProviderSchedule>|null>(null);
 useEffect(()=>{const controller=createProviderSchedule({session,apiBaseUrl,testApiOrigin,getView:()=>latest.current.getView(),refresh:()=>latest.current.refresh(),render:(value:WriteState)=>setState(value)});host.current=controller;const listener=AppState.addEventListener('change',value=>{if(value!=='active')controller.clear();});return()=>{listener.remove();controller.dispose();host.current=null;onBusy(false);};},[session,apiBaseUrl,testApiOrigin]);
 const busy=!['idle','success','invalid'].includes(state.phase);
 useEffect(()=>{onBusy(busy);},[busy]);
 const button=(label:string,run:()=>void,gate=false)=><Pressable accessibilityRole="button" disabled={bookingBusy||state.phase==='saving'||(!gate&&busy)||view.phase==='loading'} onPress={run}><Text>{label}</Text></Pressable>;
 const field=(label:string,value:string,change:(value:string)=>void)=><View><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={change} editable={!busy&&!bookingBusy} autoCapitalize="none"/></View>;
 // Copy keys stay independent of locale; reviewed translations can extend this surface.
 if(!view.businessId&&!busy)return null;
 return <View style={{gap:10}}><Text accessibilityRole="header">{language.startsWith('hi')?'समय और नीति बदलें':'Edit availability and policy'}</Text>
 <Text>Changes require confirmation and a fresh read. Times must include Z or an explicit offset such as +05:30. Schedule within the next 30 days.</Text>
 {view.services.map(s=><View key={s.id}>{button(`Edit service: ${s.title}`,()=>{setService(s.id);setPolicy({...INITIAL_APPOINTMENT_POLICY,...view.policies.find(p=>p.serviceId===s.id)?.policy});})}</View>)}
 {!!service&&<View><Text>{view.services.find(s=>s.id===service)?.title}</Text>
 {field('Slot start (ISO with timezone)',start,setStart)}{field('Slot end (ISO with timezone)',end,setEnd)}{field('Resource key',resource,setResource)}
 {button('Review new slot',()=>host.current?.prepare({action:'scheduleSlot',serviceListingId:service,startsAt:start,endsAt:end,resourceKey:resource}))}
 <Text accessibilityRole="header">Cancellation and rescheduling policy</Text>
 {Object.entries(policy).map(([key,value])=><View key={key}>{typeof value==='boolean'?button(`${key}: ${value?'Yes':'No'}`,()=>setPolicy({...policy,[key]:!value})):field(key,String(value),text=>setPolicy({...policy,[key]:typeof value==='number'?( /^\d+$/.test(text)?Number(text):NaN):text}))}</View>)}
 <Text>Refunds use basis points (10000 = 100%). Notice and offer expiry use minutes. Policy edits affect future agreements. Other managers may edit concurrently; the server contract has no policy revision guard.</Text>
 {button('Review policy change',()=>host.current?.prepare({action:'setPolicy',serviceListingId:service,policy}))}</View>}
 {view.slots.filter(s=>['available','blocked'].includes(s.status)).map(s=><View key={s.id}><Text>{s.startsAt} · {s.resourceKey}</Text>{button(`${s.status==='blocked'?'Reopen':'Block'} slot ${s.id}`,()=>host.current?.prepare({action:s.status==='blocked'?'reopenSlot':'blockSlot',slotId:s.id}))}</View>)}
 {state.phase==='confirm'&&<View><Text accessibilityRole="header">Confirm schedule or policy change</Text><Text selectable>{JSON.stringify(state.command,null,2)}</Text>{button('Apply schedule change',()=>void host.current?.confirm(),true)}{button('Keep schedule unchanged',()=>host.current?.cancel(),true)}</View>}
 {state.phase==='invalid'&&<Text accessibilityRole="alert">Check the selected service, time window and all policy values. A complete refreshed provider view is required.</Text>}
 {state.phase==='success'&&<Text>Change verified in refreshed records.</Text>}
 {['uncertain','rejected'].includes(state.phase)&&<View><Text accessibilityRole="alert">Change unconfirmed or rejected. Check current records before another action. Do not repeat an unconfirmed write.</Text>{button('Check schedule status',()=>void host.current?.reconcile(),true)}</View>}
 {state.phase==='saving'&&<Text accessibilityLiveRegion="polite">Saving schedule change…</Text>}
 </View>;
}
