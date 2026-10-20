import React,{useRef,useEffect,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import type {createSecureNativeAuthAdapter} from './secure-auth-adapter';
import type {NativeModerationSession} from './moderation-session.js';
export function NativeSignIn({auth,session,language='en'}:{auth:ReturnType<typeof createSecureNativeAuthAdapter>;session:NativeModerationSession;language?:'en'|'hi'}){
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const mounted=useRef(true),inFlight=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);const hi=language==='hi';
 async function submit(verify:boolean){if(inFlight.current)return;inFlight.current=true;setBusy(true);setMessage('');try{if(verify){await auth.verifyEmailOtp(email,code);if(!mounted.current)return;await session.refresh();if(mounted.current)setEmail('');}else{await auth.requestEmailOtp(email);if(mounted.current){setSent(true);setMessage(hi?'यदि खाता मौजूद है तो कोड आएगा।':'If the account exists, a verification code will arrive.');}}}catch{if(mounted.current)setMessage(hi?'साइन इन नहीं हुआ। विवरण जाँचें।':'Sign-in was not completed. Check the details and try again.');}finally{inFlight.current=false;if(mounted.current){setCode('');setBusy(false);}}}
 return <View style={{gap:8}}>
  <Text accessibilityRole="header">{hi?'टेस्ट खाते में साइन इन':'Sign in to your Test account'}</Text>
  <TextInput accessibilityLabel={hi?'ईमेल':'Email'} value={email} onChangeText={value=>{setEmail(value);setSent(false);setCode('');}} editable={!busy} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} maxLength={254}/>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void submit(false)}><Text>{hi?'ईमेल कोड भेजें':'Send email code'}</Text></Pressable>
  {sent&&<><TextInput accessibilityLabel={hi?'सत्यापन कोड':'Verification code'} value={code} onChangeText={setCode} editable={!busy} keyboardType="number-pad" secureTextEntry autoCorrect={false} maxLength={8}/><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void submit(true)}><Text>{hi?'कोड सत्यापित करें':'Verify code'}</Text></Pressable></>}
  {!!message&&<Text accessibilityRole="alert">{message}</Text>}
 </View>;
}
