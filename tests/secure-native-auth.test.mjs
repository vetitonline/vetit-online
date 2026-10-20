import test from 'node:test';
import assert from 'node:assert/strict';
import {createSecureNativeAuthAdapter} from '../mobile/src/secure-auth-adapter.ts';
import fs from 'node:fs';
import ts from 'typescript';
import {createNativeModerationSession} from '../mobile/src/moderation-session.js';
import {createMobileModerationClient} from '../mobile/src/moderation-client.ts';
import * as endpoints from '../src/lib/supabase/test-endpoints.js';
import * as workflow from '../src/lib/moderation/workflow.js';
// Resolve actual Metro-style TypeScript source without changing app/module config.
const source=fs.readFileSync(new URL('../mobile/src/secure-native-moderation.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const modules={'./secure-auth-adapter':{createSecureNativeAuthAdapter},'./moderation-session.js':{createNativeModerationSession},'./moderation-client':{createMobileModerationClient},'../../src/lib/supabase/test-endpoints.js':endpoints,'../../src/lib/moderation/workflow.js':workflow};
const exports={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected bootstrap dependency');return modules[name];},exports);
const {createSecureNativeModeration}=exports;
const id='10000000-0000-4000-8000-000000000001',namespace='vetit.test.apfyfmokcynqiaxqvvxx.auth.v1';
function fixture(overrides={}){
 let invalidations=0,created=0,subscriber,session={access_token:'synthetic-token',expires_at:2000000000},unsubscribed=false;
 const calls=[],stored=new Map();let clientOptions;
 const auth={getSession:async()=>({data:{session},error:null}),signInWithOtp:async args=>{calls.push(['request',args]);return{error:null};},verifyOtp:async args=>{calls.push(['verify',args]);return{data:{session},error:null};},signOut:async args=>{calls.push(['signOut',args]);session=null;return{error:null};},onAuthStateChange:callback=>{subscriber=callback;callback('INITIAL_SESSION');return{data:{subscription:{unsubscribe:()=>{unsubscribed=true;}}}};},...overrides};
 const options={testSupabaseUrl:'https://apfyfmokcynqiaxqvvxx.supabase.co',publishableKey:'sb_publishable_synthetic_only',storage:{kind:'os-protected',getItem:async key=>stored.get(key)??null,setItem:async(key,value)=>{stored.set(key,value);},removeItem:async key=>{stored.delete(key);}},createClient:(url,key,settings)=>{created++;clientOptions=settings;return{auth};},testAuthApproved:true,secureStorageApproved:true,onIdentityInvalidated:()=>{invalidations++;},now:()=>1900000000000};
 return{options,calls,create:()=>createSecureNativeAuthAdapter(options),settings:()=>clientOptions,created:()=>created,invalidations:()=>invalidations,emit:event=>subscriber(event),unsubscribed:()=>unsubscribed};
}
test('native auth rejects production, unapproved storage, secret keys and missing approval before client creation',()=>{
 for(const patch of [{testSupabaseUrl:'https://different-project.supabase.co'},{testAuthApproved:false},{secureStorageApproved:false},{publishableKey:'sb_secret_synthetic_invalid'},{storage:{kind:'plain'}}]){const f=fixture();assert.throws(()=>createSecureNativeAuthAdapter({...f.options,...patch}));assert.equal(f.created(),0);}
});
test('native auth namespaces protected storage and disables URL ingestion and background refresh',async()=>{
 const f=fixture();const adapter=f.create(),settings=f.settings().auth;assert.equal(settings.autoRefreshToken,false);assert.equal(settings.detectSessionInUrl,false);assert.equal(settings.persistSession,true);assert.equal(settings.flowType,'pkce');assert.equal(f.invalidations(),0);
 await settings.storage.setItem(namespace,'synthetic-private-session');assert.equal(await settings.storage.getItem(namespace),'synthetic-private-session');assert.throws(()=>settings.storage.getItem('unrelated-existing-key'));adapter.dispose();assert.equal(f.unsubscribed(),true);await assert.rejects(adapter.getAccessToken(),e=>e.status===401);
});
test('existing-user email OTP operations are validated and cannot request signup or arbitrary redirect',async()=>{
 const f=fixture(),adapter=f.create();assert.throws(()=>adapter.requestEmailOtp('invalid'));assert.throws(()=>adapter.verifyEmailOtp('test@example.invalid','not-a-code'));assert.equal(f.calls.length,0);
 await adapter.requestEmailOtp(' TEST@example.invalid ');await adapter.verifyEmailOtp('TEST@example.invalid','123456');assert.deepEqual(f.calls[0],['request',{email:'test@example.invalid',options:{shouldCreateUser:false}}]);assert.equal(f.calls[1][1].type,'email');assert.equal((await adapter.getAccessToken()),'synthetic-token');
});
test('expired/invalid sessions and provider diagnostics never become identity or error details',async()=>{
 const stale=fixture({getSession:async()=>({data:{session:{access_token:'synthetic',expires_at:1}},error:null})});assert.equal(await stale.create().getAccessToken(),null);
 const failed=fixture({getSession:async()=>{throw Error('private storage diagnostic');}});await assert.rejects(failed.create().getAccessToken(),e=>e.status===503&&!e.message.includes('private'));
});
test('device-scoped sign-out blocks reuse even if provider sign-out fails; auth state events invalidate safely',async()=>{
 const f=fixture({signOut:async args=>{assert.deepEqual(args,{scope:'local'});return{error:Error('private signout diagnostic')};}}),adapter=f.create();f.emit('TOKEN_REFRESHED');assert.equal(f.invalidations(),0);await assert.rejects(adapter.signOut(),e=>e.status===503&&!e.message.includes('diagnostic'));assert.equal(await adapter.getAccessToken(),null);assert.ok(f.invalidations()>0);
});
test('sign-out cannot resurrect an in-flight verification',async()=>{
 let finish,started;const ready=new Promise(resolve=>{started=resolve;});const f=fixture({verifyOtp:()=>new Promise(resolve=>{finish=resolve;started();})}),adapter=f.create();const verification=adapter.verifyEmailOtp('test@example.invalid','123456');await ready;await assert.rejects(adapter.signOut(),e=>e.status===409);finish({data:{session:{access_token:'synthetic',expires_at:2000000000}},error:null});await assert.rejects(verification,e=>e.status===401);assert.equal(await adapter.getAccessToken(),null);
});
test('composed native moderation verifies adapter tokens through Test API and crypto approval precedes client creation',async()=>{
 const f=fixture();const config={auth:f.options,apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321',platformCryptoApproved:true,requestId:()=>id,fetchImpl:async(url,options)=>{assert.equal(new URL(url).pathname,'/api/moderation-session');assert.equal(options.headers.authorization,'Bearer synthetic-token');return new Response(JSON.stringify({apiVersion:1,state:'available',userId:id,reviewerHint:false}));}};
 assert.throws(()=>createSecureNativeModeration({...config,platformCryptoApproved:false}));assert.equal(f.created(),0);const native=createSecureNativeModeration(config);assert.equal((await native.session.refresh()).userId,id);native.dispose();assert.equal(native.session.snapshot(),null);
});
test('timed-out auth operations cannot later restore token access',async()=>{
 let finish;const f=fixture({getSession:()=>new Promise(resolve=>{finish=resolve;})});const adapter=createSecureNativeAuthAdapter({...f.options,operationTimeoutMs:5});await assert.rejects(adapter.getAccessToken(),e=>e.status===503);finish({data:{session:{access_token:'synthetic-token',expires_at:2000000000}},error:null});await Promise.resolve();assert.equal(await adapter.getAccessToken(),null);assert.ok(f.invalidations()>0);
});
