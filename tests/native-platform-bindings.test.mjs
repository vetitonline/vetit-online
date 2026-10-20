import test from 'node:test';import assert from 'node:assert/strict';
import {prepareNativePlatformBindings} from '../mobile/src/native-platform-bindings.ts';
import {createSecureNativeAuthAdapter} from '../mobile/src/secure-auth-adapter.ts';
const namespace='vetit.test.apfyfmokcynqiaxqvvxx.auth.v1';
const id='10000000-0000-4000-8000-000000000001';
function fixture(){const values=new Map(),calls=[];const secureStore={WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,isAvailableAsync:async()=>true,getItemAsync:async(key,options)=>{calls.push({key,options});return values.get(key)??null;},setItemAsync:async(key,value,options)=>{calls.push({key,options});values.set(key,value);},deleteItemAsync:async(key,options)=>{calls.push({key,options});values.delete(key);}};return{values,calls,input:{platform:'android',approved:true,secureStore,crypto:{randomUUID:()=>id}}};}
test('platform bridge preserves Test namespace and protected options on synthetic storage only',async()=>{
 const f=fixture(),b=await prepareNativePlatformBindings(f.input);
 assert.equal(b.requestId(),id);await b.storage.setItem(namespace,'synthetic-session');assert.equal(await b.storage.getItem(namespace),'synthetic-session');
 await b.storage.removeItem(namespace);assert.equal(f.values.size,0);
 for(const c of f.calls){assert.equal(c.options.requireAuthentication,true);assert.equal(c.options.keychainService,namespace);assert.equal(c.options.keychainAccessible,1);}
 const count=f.calls.length;assert.throws(()=>b.storage.getItem('production-session'));assert.equal(f.calls.length,count);
});
test('missing approval/platform/storage/UUID bindings fail closed without creating sessions',async()=>{
 for(const change of [{approved:false},{platform:'web'},{crypto:{}},{secureStore:{}}]){const f=fixture();await assert.rejects(prepareNativePlatformBindings({...f.input,...change}));assert.equal(f.calls.length,0);}
 const f=fixture();f.input.secureStore.isAvailableAsync=async()=>false;await assert.rejects(prepareNativePlatformBindings(f.input));assert.equal(f.calls.length,0);
});
test('native availability timeout prevents hung binding from returning a storage adapter',async()=>{
 const f=fixture();let finish;f.input.secureStore.isAvailableAsync=()=>new Promise(resolve=>{finish=resolve;});
 await assert.rejects(prepareNativePlatformBindings({...f.input,availabilityTimeoutMs:5}),/storage unavailable/);finish(true);assert.equal(f.calls.length,0);
});
test('platform errors and malformed UUIDs are sanitized; no random fallback exists',async()=>{
 const f=fixture();f.input.crypto.randomUUID=()=> 'invalid';const b=await prepareNativePlatformBindings(f.input);assert.throws(b.requestId,/cryptographic UUID unavailable/);
 f.input.secureStore.getItemAsync=async()=>{throw Error('private diagnostic');};await assert.rejects(b.storage.getItem(namespace),e=>!e.message.includes('private diagnostic'));
});
test('prepared buyer seller reviewer fixtures compose with actual native auth adapter without hosted auth',async()=>{
 for(const role of ['buyer','seller','reviewer']){
  const f=fixture(),bindings=await prepareNativePlatformBindings(f.input);let settings,created=0;
  const adapter=createSecureNativeAuthAdapter({testSupabaseUrl:'https://apfyfmokcynqiaxqvvxx.supabase.co',publishableKey:'sb_publishable_synthetic_only',storage:bindings.storage,testAuthApproved:true,secureStorageApproved:true,onIdentityInvalidated:()=>{},now:()=>1000,createClient:(_url,_key,options)=>{created++;settings=options;return{auth:{getSession:async()=>({data:{session:{access_token:`synthetic-${role}`,expires_at:9999}},error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}}}});
  await settings.auth.storage.setItem(namespace,`synthetic-${role}`);assert.equal(await adapter.getAccessToken(),`synthetic-${role}`);assert.equal(created,1);assert.equal(settings.auth.autoRefreshToken,false);assert.equal(settings.auth.detectSessionInUrl,false);adapter.dispose();await assert.rejects(adapter.getAccessToken());
 }
});
