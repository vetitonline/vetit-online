import {createSecureNativeAuthAdapter,type SecureNativeAuthOptions} from './secure-auth-adapter';
import {createNativeModerationSession,type NativeModerationSession} from './moderation-session.js';
import {createMobileModerationClient} from './moderation-client';
import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {ModerationError,type SubjectKind} from '../../src/lib/moderation/workflow.js';

/** Compose only after approval and OS storage/UUID bindings exist. No defaults
 * create a client or activate this adapter in the current preview. */
export function createSecureNativeModeration(options:{auth:Omit<SecureNativeAuthOptions,'onIdentityInvalidated'>;apiBaseUrl:string;testApiOrigin:string;platformCryptoApproved:boolean;requestId:()=>string;fetchImpl?:typeof fetch;sellerSubject?:{kind:SubjectKind;subject:string}}){
 resolveMobileApiBase(options.apiBaseUrl,options.testApiOrigin);
 if(options.platformCryptoApproved!==true||typeof options.requestId!=='function')throw new ModerationError('Approved platform cryptographic UUID source required.',403);
 let session:NativeModerationSession|undefined;
 const auth=createSecureNativeAuthAdapter({...options.auth,onIdentityInvalidated:()=>session?.clear()});
 session=createNativeModerationSession({apiBaseUrl:options.apiBaseUrl,testApiOrigin:options.testApiOrigin,getAccessToken:auth.getAccessToken,fetchImpl:options.fetchImpl});
 const client=createMobileModerationClient({apiBaseUrl:options.apiBaseUrl,testApiOrigin:options.testApiOrigin,fetchImpl:options.fetchImpl});
 return{auth,session,client,requestId:options.requestId,sellerSubject:options.sellerSubject,dispose:()=>{session?.clear();auth.dispose();}};
}
