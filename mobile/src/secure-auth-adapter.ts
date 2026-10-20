import type {createClient as SupabaseCreateClient} from '@supabase/supabase-js';
import {assertTestSupabaseUrl} from '../../src/lib/supabase/test-endpoints.js';
import {ModerationError} from '../../src/lib/moderation/workflow.js';

export type ProtectedAuthStorage={kind:'os-protected';getItem(key:string):Promise<string|null>;setItem(key:string,value:string):Promise<void>;removeItem(key:string):Promise<void>};
export type SecureNativeAuthOptions={testSupabaseUrl:string;publishableKey:string;storage:ProtectedAuthStorage;createClient:typeof SupabaseCreateClient;testAuthApproved:boolean;secureStorageApproved:boolean;onIdentityInvalidated:()=>void;now?:()=>number;operationTimeoutMs?:number};
const storageKey='vetit.test.apfyfmokcynqiaxqvvxx.auth.v1';
/** Prepared adapter only. No module-level client, credentials, network, token
 * ingestion, redirect exchange or insecure storage fallback is provided. */
export function createSecureNativeAuthAdapter(options:SecureNativeAuthOptions){
 assertTestSupabaseUrl(options.testSupabaseUrl);
 if(options.testAuthApproved!==true||options.secureStorageApproved!==true)throw new ModerationError('Explicit Test auth and secure storage approval required.',403);
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(options.publishableKey??''))throw new ModerationError('An approved Test publishable key is required.');
 if(options.storage?.kind!=='os-protected'||['getItem','setItem','removeItem'].some(key=>typeof options.storage[key as keyof ProtectedAuthStorage]!=='function'))throw new ModerationError('Approved OS-protected storage is required.');
 const allowed=(key:string)=>{if(![storageKey,storageKey+'-code-verifier',storageKey+'-user'].includes(key))throw new ModerationError('Unexpected authentication storage namespace.');return key;};
 const storage={getItem:(key:string)=>options.storage.getItem(allowed(key)),setItem:(key:string,value:string)=>options.storage.setItem(allowed(key),value),removeItem:(key:string)=>options.storage.removeItem(allowed(key))};
 const client=options.createClient(options.testSupabaseUrl,options.publishableKey,{auth:{storage,storageKey,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce'}});
 let busy=false,disposed=false,suspended=false,epoch=0;
 const subscription=client.auth.onAuthStateChange(event=>{
  if(event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')return;
  if(event==='SIGNED_OUT'){epoch++;suspended=true;}
  options.onIdentityInvalidated();
 }).data.subscription;
 async function run<T>(operation:()=>Promise<T>):Promise<T>{
  if(disposed)throw new ModerationError('Native auth adapter is closed.',401);
  if(busy)throw new ModerationError('An authentication operation is already running.',409);
  busy=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const wait=Number.isFinite(options.operationTimeoutMs)?Math.max(1,Math.min(options.operationTimeoutMs!,10000)):10000;
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{epoch++;suspended=true;options.onIdentityInvalidated();reject(new ModerationError('Test authentication timed out; local access remains blocked.',503));},wait);});
  try{return await Promise.race([Promise.resolve().then(operation),deadline]);}catch(error){if(error instanceof ModerationError)throw error;throw new ModerationError('Test authentication unavailable.',503);}finally{clearTimeout(timer);busy=false;}
 }
 const email=(value:string)=>{const normalized=typeof value==='string'?value.trim().toLowerCase():'';if(normalized.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(normalized))throw new ModerationError('Enter a valid email address.');return normalized;};
 return{
  getAccessToken:()=>run(async()=>{
   if(suspended)return null;
   const result=await client.auth.getSession();if(suspended||disposed)return null;if(result.error)throw new ModerationError('Test session unavailable.',503);
   const s=result.data.session;if(!s)return null;
   if(typeof s.access_token!=='string'||!s.access_token||/\s/.test(s.access_token)||s.access_token.length>8192||!Number.isFinite(s.expires_at)||(s.expires_at??0)*1000<=(options.now??Date.now)()+15000)return null;
   return s.access_token; // Transport only; identity is verified by moderation-session.
  }),
  requestEmailOtp:(value:string)=>{const address=email(value);return run(async()=>{const {error}=await client.auth.signInWithOtp({email:address,options:{shouldCreateUser:false}});if(error)throw new ModerationError('Test sign-in request was not accepted.',503);});},
  verifyEmailOtp:(value:string,token:string)=>{const address=email(value);if(typeof token!=='string'||!/^\d{6,8}$/.test(token))throw new ModerationError('Enter the email verification code.');const generation=epoch;return run(async()=>{const {data,error}=await client.auth.verifyOtp({email:address,token,type:'email'});if(disposed||generation!==epoch||error||!data.session)throw new ModerationError('Test sign-in could not be verified.',401);suspended=false;options.onIdentityInvalidated();});},
  signOut:()=>{epoch++;suspended=true;options.onIdentityInvalidated();return run(async()=>{const {error}=await client.auth.signOut({scope:'local'});if(error)throw new ModerationError('Sign-out could not be confirmed; local access remains blocked.',503);});},
  dispose:()=>{epoch++;disposed=true;suspended=true;subscription.unsubscribe();options.onIdentityInvalidated();},
 };
}
