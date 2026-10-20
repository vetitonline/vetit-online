import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {getModerationStatus,getModerationQueue,requestModeration,type ModerationCommand,type SubjectKind} from '../../src/lib/moderation/workflow.js';

/** Native contract adapter, no token storage or implicit production origin.
 * Caller supplies a verified session; native sign-in/screens are separate work.
 */
export function createMobileModerationClient(config:{apiBaseUrl:string;testApiOrigin:string;fetchImpl?:typeof fetch}){
 const baseUrl=resolveMobileApiBase(config.apiBaseUrl,config.testApiOrigin);
 function options(session:{accessToken:string;signal?:AbortSignal}){
  if(!session.accessToken?.trim())throw new Error('A signed-in Test session is required.');
  return{baseUrl,testOrigin:config.testApiOrigin,fetchImpl:config.fetchImpl,accessToken:session.accessToken,signal:session.signal};
 }
 return{
  queue:(params:URLSearchParams,session:{accessToken:string;signal?:AbortSignal})=>getModerationQueue(options(session),params),
  status:(kind:SubjectKind,subject:string,session:{accessToken:string;signal?:AbortSignal})=>getModerationStatus(options(session),kind,subject),
  command:(command:ModerationCommand,session:{accessToken:string;signal?:AbortSignal})=>requestModeration(options(session),command),
 };
}
