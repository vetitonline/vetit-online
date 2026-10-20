import React,{useEffect,useState,useRef} from 'react';
import {ActivityIndicator,AppState,Pressable,Text,View} from 'react-native';
import {ModerationWorkspace} from './ModerationWorkspace';
import {NativeSignIn} from './NativeSignIn';
import type {createSecureNativeAuthAdapter} from './secure-auth-adapter';
import type {NativeIdentity,NativeModerationSession} from './moderation-session.js';
import type {createMobileModerationClient} from './moderation-client';
import {moderationNeedsReview,type ModerationQueue,type SubjectKind} from '../../src/lib/moderation/workflow.js';

export type NativeModerationProps={session:NativeModerationSession;client:ReturnType<typeof createMobileModerationClient>;requestId:()=>string;auth?:ReturnType<typeof createSecureNativeAuthAdapter>;sellerSubject?:{kind:SubjectKind;subject:string};language?:'en'|'hi'};
type Row=ModerationQueue['items'][number];
function ReviewerQueue({session,client,identity,onSelect,language}:{session:NativeModerationSession;client:NativeModerationProps['client'];identity:NativeIdentity;onSelect:(row:Row)=>void;language:'en'|'hi'}){
 const [data,setData]=useState<ModerationQueue|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const [page,setPage]=useState({before:'',id:''}),[reload,setReload]=useState(0);const hi=language==='hi';
 useEffect(()=>{
  let active=true;const abort=new AbortController();setData(null);setMessage('');setBusy(true);
  void(async()=>{try{
   const before=await session.getSession();if(before.userId!==identity.userId)throw Error('changed');
   const params=new URLSearchParams();if(page.before){params.set('before',page.before);params.set('id',page.id);}
   const result=await client.queue(params,{...before,signal:abort.signal});
   const after=await session.getSession();if(after.userId!==identity.userId)throw Error('changed');if(active)setData(result);
  }catch(error){if(active){setData(null);setMessage((error as {status?:number})?.status===403?(hi?'समीक्षक अनुमति नहीं है।':'Current reviewer permission is required.'):(hi?'समीक्षा सूची उपलब्ध नहीं है।':'Queue unavailable. Refresh or sign in again.'));}}
  finally{if(active)setBusy(false);}})();
  return()=>{active=false;abort.abort();};
 },[session,client,identity.userId,page,reload,hi]);
 const last=data?.items.at(-1);
 return <View style={{gap:8}}>
  <Text accessibilityRole="header">{hi?'समीक्षा सूची':'Moderation queue'}</Text>
  <Text>{hi?'पहले स्वचालित जाँच; चिह्नित मामलों की मानवीय समीक्षा।':'Automatic screening first; human review for flagged or uncertain cases.'}</Text>
  {busy&&<ActivityIndicator/>}{!!message&&<Text accessibilityRole="alert">{message}</Text>}
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>setReload(n=>n+1)}><Text>{hi?'फिर लोड करें':'Refresh queue'}</Text></Pressable>
  {data?.items.map(row=>{const flagged=moderationNeedsReview({state:row.state,reasons:row.reasons,automaticApproval:row.automatic_approval})||['regulated','veterinary','live_animal','prohibited','unconfigured'].includes(row.classification);return <Pressable key={row.id} accessibilityRole="button" onPress={()=>onSelect(row)} style={{padding:12,borderWidth:1,borderColor:flagged?'#f58220':'#673ab7'}}><Text>{row.title}</Text><Text>{row.seller_name} · {row.state}</Text><Text>{flagged?(hi?'मानवीय समीक्षा आवश्यक':'Flagged / human review required'):(hi?'स्वचालित जाँच / स्थिति':'Automatic screening / status')}</Text>{row.reasons.map(reason=><Text key={reason}>{reason}</Text>)}</Pressable>;})}
  {data&&!data.items.length&&<Text>{hi?'कोई मामला नहीं मिला।':'No cases on this page.'}</Text>}
  {data?.hasMore&&last&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setPage({before:last.created_at,id:last.id})}><Text>{hi?'अगला':'Next page'}</Text></Pressable>}
  {!!page.before&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setPage({before:'',id:''})}><Text>{hi?'पहला पृष्ठ':'First page'}</Text></Pressable>}
 </View>;
}
/** The platform auth owner injects the secure token source into session. */
export function NativeModeration({session,client,requestId,auth,sellerSubject,language='en'}:NativeModerationProps){
 const authOwner=useRef({auth,epoch:0});if(authOwner.current.auth!==auth)authOwner.current={auth,epoch:authOwner.current.epoch+1};
 const [stored,setStored]=useState<{session:NativeModerationSession;value:NativeIdentity|null}>({session,value:session.snapshot()});
 const identity=stored.session===session?stored.value:null;
 const setIdentity=(value:NativeIdentity|null)=>setStored({session,value});
 const [selected,setSelected]=useState<{userId:string;row:Row}|null>(null);
 useEffect(()=>{let active=true;setIdentity(session.snapshot());const unsubscribe=session.subscribe(value=>{if(active)setIdentity(value);});void session.refresh().catch(()=>{});const lifecycle=AppState.addEventListener('change',state=>{if(state==='active')void session.refresh().catch(()=>{});else session.clear();});return()=>{active=false;unsubscribe();lifecycle.remove();session.clear();};},[session]);
 if(!identity)return <View>{auth?<NativeSignIn key={authOwner.current.epoch} {...{auth,session,language}}/>:<><Text>{language==='hi'?'सत्यापित टेस्ट सत्र आवश्यक है।':'A verified Test sign-in session is required.'}</Text><Pressable accessibilityRole="button" onPress={()=>void session.refresh().catch(()=>{})}><Text>{language==='hi'?'सत्र जाँचें':'Verify session'}</Text></Pressable></>}</View>;
 const row=selected?.userId===identity.userId?selected.row:null;
 const subject=row?{kind:row.subject_kind,subject:row.subject_id}:sellerSubject;
 return <View style={{gap:12}}>
  {auth&&<Pressable accessibilityRole="button" onPress={()=>{session.clear();void auth.signOut().catch(()=>{});}}><Text>{language==='hi'?'इस उपकरण से साइन आउट':'Sign out on this device'}</Text></Pressable>}
  {identity.reviewerHint&&!row&&<ReviewerQueue key={identity.userId} {...{session,client,identity,language}} onSelect={value=>setSelected({userId:identity.userId,row:value})}/>}
  {row&&<Pressable accessibilityRole="button" onPress={()=>setSelected(null)}><Text>{language==='hi'?'समीक्षा सूची पर लौटें':'Back to queue'}</Text></Pressable>}
  {subject&&<ModerationWorkspace key={`${identity.userId}:${subject.kind}:${subject.subject}`} {...subject} {...{client,requestId,language}} getSession={session.getSession} sessionUserId={identity.userId} reviewer={identity.reviewerHint}/>}
 </View>;
}
