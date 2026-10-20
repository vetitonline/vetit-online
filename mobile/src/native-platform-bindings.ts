import type {ProtectedAuthStorage} from './secure-auth-adapter';
type StoreOptions={keychainService:string;keychainAccessible:number;requireAuthentication:boolean};
export type NativeStoreModule={WHEN_UNLOCKED_THIS_DEVICE_ONLY:number;isAvailableAsync():Promise<boolean>;getItemAsync(key:string,options:StoreOptions):Promise<string|null>;setItemAsync(key:string,value:string,options:StoreOptions):Promise<void>;deleteItemAsync(key:string,options:StoreOptions):Promise<void>};
const namespace='vetit.test.apfyfmokcynqiaxqvvxx.auth.v1';
/** Explicit dependency injection only: no package import, client, device operation,
 * or fallback runs at module load. Real OS/biometric acceptance is still required.
 */
export async function prepareNativePlatformBindings(input:{platform:'android'|'ios';approved:boolean;secureStore:NativeStoreModule;crypto:{randomUUID():string};availabilityTimeoutMs?:number}):Promise<{storage:ProtectedAuthStorage;requestId:()=>string}>{
 if(input.approved!==true||!['android','ios'].includes(input.platform))throw Error('Approved native Test platform required.');
 const store=input.secureStore;
 if(!store||!Number.isFinite(store.WHEN_UNLOCKED_THIS_DEVICE_ONLY)||['isAvailableAsync','getItemAsync','setItemAsync','deleteItemAsync'].some(key=>typeof store[key as keyof NativeStoreModule]!=='function')||typeof input.crypto?.randomUUID!=='function')throw Error('Approved secure storage and cryptographic UUID bindings required.');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const wait=Number.isFinite(input.availabilityTimeoutMs)?Math.max(1,Math.min(input.availabilityTimeoutMs!,5000)):5000;
 try{const available=await Promise.race([Promise.resolve().then(()=>store.isAvailableAsync()),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error()),wait);})]);if(available!==true)throw Error();}catch{throw Error('Native secure storage unavailable.');}finally{clearTimeout(timer);}
 const options=()=>({keychainService:namespace,keychainAccessible:store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,requireAuthentication:true});
 const key=(value:string)=>{if(![namespace,namespace+'-code-verifier',namespace+'-user'].includes(value))throw Error('Unexpected Test storage namespace.');return value;};
 async function safe<T>(operation:()=>Promise<T>):Promise<T>{try{return await operation();}catch{throw Error('Protected Test storage operation unavailable.');}}
 const storage:ProtectedAuthStorage={kind:'os-protected',getItem:value=>{const name=key(value);return safe(()=>store.getItemAsync(name,options()));},setItem:(value,content)=>{const name=key(value);return safe(()=>store.setItemAsync(name,content,options()));},removeItem:value=>{const name=key(value);return safe(()=>store.deleteItemAsync(name,options()));}};
 const requestId=()=>{try{const value=input.crypto.randomUUID();if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))throw Error();return value;}catch{throw Error('Platform cryptographic UUID unavailable.');}};
 return{storage,requestId};
}
