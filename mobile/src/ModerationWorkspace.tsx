import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,Text,TextInput,View} from 'react-native';
import {createModerationWorkspace,type ModerationClient,type ModerationSession} from '../../src/lib/moderation/session-workspace.js';
import type {ModerationCommand,SubjectKind} from '../../src/lib/moderation/workflow.js';
import {moderationNeedsReview} from '../../src/lib/moderation/workflow.js';

export type ModerationWorkspaceProps={client:ModerationClient;getSession:()=>Promise<ModerationSession|null>;sessionUserId:string;requestId:()=>string;kind:SubjectKind;subject:string;reviewer?:boolean;language?:'en'|'hi'};
/** Mount only from a trusted authenticated shell. reviewer is presentation only;
 * neither this prop nor any native assertion grants server review permission. */
// The host must supply a platform cryptographic UUID generator; never assume
// browser crypto exists on Hermes, and never substitute Math.random.
export function ModerationWorkspace({client,getSession,sessionUserId,requestId,kind,subject,reviewer=false,language='en'}:ModerationWorkspaceProps){
 const workspace=useMemo(()=>createModerationWorkspace({client,getSession:async()=>{const value=await getSession();return value?.userId===sessionUserId?value:null;},requestId,kind,subject}),[client,getSession,sessionUserId,requestId,kind,subject]);
 const current=useRef<typeof workspace|null>(workspace);current.current=workspace;
 const [stored,setStored]=useState({workspace,value:workspace.snapshot()});
 const snapshot=stored.workspace===workspace?stored.value:workspace.snapshot();
 const setSnapshot=(value:ReturnType<typeof workspace.snapshot>)=>setStored({workspace,value});
 const [message,setMessage]=useState('');
 const [reason,setReason]=useState(''),[note,setNote]=useState(''),[correction,setCorrection]=useState('');
 const hi=language==='hi';
 const failure=(error:unknown)=>{const status=(error as {status?:number})?.status;return status===401?(hi?'सत्र समाप्त। फिर साइन इन करें।':'Session expired. Sign in again.'):status===403?(hi?'अनुमति नहीं है।':'Access denied.'):status===409?(hi?'समीक्षा बदल गई। फिर लोड करें।':'Case changed. Refresh before deciding.'):(hi?'कार्रवाई स्वीकार नहीं हुई। आवश्यकताएँ जाँचें।':'Action unavailable. Check requirements before retrying.');};
 useEffect(()=>{let active=true;current.current=workspace;setSnapshot(workspace.snapshot());setMessage('');setReason('');setNote('');setCorrection('');const load=workspace.refresh();setSnapshot(workspace.snapshot());void load.then(()=>{if(active)setSnapshot(workspace.snapshot());}).catch(error=>{if(active){setMessage(failure(error));setSnapshot(workspace.snapshot());}});return()=>{active=false;if(current.current===workspace)current.current=null;};},[workspace]);
 async function run(action?:ModerationCommand['action']){
  setMessage('');
  try{const pending=action?workspace.submit(action,{reasons:reason.trim()?[reason.trim()]:[],note,correction}):workspace.refresh();setSnapshot(workspace.snapshot());await pending;if(action&&current.current===workspace)await workspace.refresh();}
  catch(error){if(current.current===workspace)setMessage(failure(error));}
  finally{if(current.current===workspace)setSnapshot(workspace.snapshot());}
 }
 const c=snapshot.data?.case;
 const button=(label:string,action?:ModerationCommand['action'])=><Pressable accessibilityRole="button" disabled={snapshot.busy||Boolean(action&&snapshot.refreshRequired)} onPress={()=>void run(action)} style={{padding:12,opacity:snapshot.busy||Boolean(action&&snapshot.refreshRequired)?0.45:1}}><Text style={{color:'#673ab7'}}>{label}</Text></Pressable>;
 return <View style={{padding:16,gap:8}}>
  <Text accessibilityRole="header">{hi?'विक्रेता समीक्षा':'Seller moderation'}</Text>
  {snapshot.busy&&<ActivityIndicator accessibilityLabel={hi?'लोड हो रहा है':'Loading moderation'}/>}
  {!!message&&<Text accessibilityRole="alert">{message}</Text>}
  {button(hi?'फिर लोड करें':'Refresh')}
  {snapshot.data&&<>
   <Text>{c?c.state:(hi?'समीक्षा शुरू नहीं हुई':'No case opened')}</Text>
   {c?.reasons.map(code=><Text key={code}>{code}</Text>)}
   {!!c?.correction&&<Text>{c.correction}</Text>}
   {c?.automaticApproval?.status==='approved'&&<Text>{hi?'स्वतः अनुमोदित; प्रकाशन लंबित':'Automatically approved; publication pending'}</Text>}
   {c?.automaticApproval?.status==='review_required'&&<Text>{hi?'नई समीक्षा आवश्यक':'Fresh review required'}</Text>}
   <Text>{hi?'स्वचालित प्रकाशन बंद है।':'Automatic publication is disabled.'}</Text>
   {(!c||['rejected','corrections'].includes(c.state))&&button(hi?'समीक्षा के लिए भेजें':'Submit / resubmit','open')}
   {c&&!['approved','rejected','corrections'].includes(c.state)&&<>
    {button(hi?'जाँचें':'Check screening','screen')}
    {reviewer&&moderationNeedsReview(c)&&<>
     <TextInput accessibilityLabel={hi?'कारण कोड':'Reason code'} value={reason} onChangeText={setReason} maxLength={64} autoCapitalize="characters"/>
     <TextInput accessibilityLabel={hi?'निजी समीक्षा टिप्पणी':'Private reviewer note'} value={note} onChangeText={setNote} maxLength={1000} multiline/>
     <TextInput accessibilityLabel={hi?'आवश्यक सुधार':'Required corrections'} value={correction} onChangeText={setCorrection} maxLength={1000} multiline/>
     {button(hi?'अनुमोदित करें':'Approve / publish','approve')}
     {button(hi?'अस्वीकार करें':'Reject','reject')}
     {button(hi?'सुधार माँगें':'Request corrections','corrections')}
     {button(hi?'उच्च समीक्षा':'Escalate','escalate')}
    </>}
   </>}
   {snapshot.data.events.map(event=><View key={event.id}><Text>{event.operation} · {event.state} · {event.at}</Text>{reviewer&&event.note&&<Text>{event.note}</Text>}</View>)}
  </>}
 </View>;
}
