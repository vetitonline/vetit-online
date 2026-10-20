// SERVER ONLY. No API route, key, scheduler or live worker is enabled by this file.
import {screenContent,evaluateTextRules} from './policy.js';
import {ModerationError,moderationRpcStatus} from './workflow.js';
/** Trusted adapters must inspect actual bytes/legal evidence, not trust filenames.
 * Image storageVersion identifies the DB snapshot; it is NOT a file-content hash.
 */
export async function screenModerationCase(client,caseId,{providers={},issuer='configured_worker',timeoutMs=2000,attemptAutomaticApproval=false,textRules}={}){
 if(!/^[a-z0-9_-]{1,80}$/.test(issuer))throw new ModerationError('Invalid screening issuer.');
 const {data:context,error}=await client.rpc('moderation_screening_context',{p_case:caseId});
 if(error)throw new ModerationError('Screening context unavailable.',moderationRpcStatus(error.code));
 if(!context||context.caseId!==caseId||!context.revision||!['seller','product','service'].includes(context.kind)||!Array.isArray(context.images))throw new ModerationError('Invalid screening context.',503);
 if(!context.policyId)return{state:'unavailable',reasons:['POLICY_UNAVAILABLE'],checks:[]};
 if(attemptAutomaticApproval&&(!Number.isSafeInteger(context.version)||context.version<1))throw new ModerationError('Screening version unavailable.',503);
 let version=context.version;
 const checks=['content','legal',...(context.kind==='seller'?[]:['images']),...(context.requiresCredentials?['credentials']:[])];
 const recorded=[];
 for(const check of checks){
  let validUntil=null;
  const configured=providers[check];
  const provider=configured?{screen:async (input,options)=>{
   const response=await configured.screen(input,options);
   if(response?.status==='passed'){
    const expiry=Date.parse(response.validUntil);
    if(!Number.isFinite(expiry)||expiry<=Date.now())return{status:'unavailable',revision:input.revision};
    validUntil=expiry;
   }
   return response;
  }}:undefined;
  const input={check,revision:context.revision,kind:context.kind,subjectId:context.subjectId,businessId:context.businessId,market:context.market,policyVersion:context.policyVersion,
   ...(check==='content'?{text:context.text}:{}),...(check==='images'?{images:context.images}:{})};
  let preliminary;
  if(check==='content'&&textRules!==undefined){
   const assessed=textRules?.policyVersion===context.policyVersion&&typeof context.policyVersion==='string'?evaluateTextRules(context.text,textRules):{status:'unavailable',reasons:[]};
   if(assessed.status!=='passed')preliminary={status:assessed.status==='unavailable'?'unavailable':assessed.reasons.includes('TEXT_PROHIBITED')?'failed':'uncertain'};
  }
  const evidence=preliminary??(check==='images'&&(!context.images.length||context.images.some(i=>typeof i.path!=='string'||!/^[0-9a-f]{64}$/.test(i.storageVersion??'')))?{status:'unavailable'}:await screenContent(input,{provider,timeoutMs}));
  const result=await client.rpc('moderation_attest',{p_case:caseId,p_revision:context.revision,p_policy:context.policyId,p_check:check,p_status:evidence.status,p_issuer:issuer,p_expires:new Date(Math.min(Date.now()+60*60*1000,validUntil??Infinity)).toISOString(),p_request:crypto.randomUUID()});
  if(result.error)throw new ModerationError('Evidence changed or could not be recorded. Refresh before retrying.',moderationRpcStatus(result.error.code));
  if(attemptAutomaticApproval){if(!Number.isSafeInteger(result.data?.version)||result.data.version<=version)throw new ModerationError('Evidence version unavailable.',503);version=result.data.version;}
  recorded.push({check,status:evidence.status});
 }
 // Defense in depth: authoritative eligibility is still checked by the DB RPC.
 const ordinaryListing=['product','service'].includes(context.kind)&&context.classification==='ordinary'&&context.requiresCredentials===false;
 const automaticApproval=attemptAutomaticApproval&&ordinaryListing&&recorded.every(check=>check.status==='passed')?await requestAutomaticApproval(client,caseId,version,crypto.randomUUID()):undefined;
 return{state:'recorded',checks:recorded,...(automaticApproval?{automaticApproval}:{})};
}

/** Server-only, service-role RPC. Approval never grants publication authority. */
export async function requestAutomaticApproval(client,caseId,version,requestId){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(caseId)||!uuid.test(requestId)||!Number.isSafeInteger(version)||version<1)throw new ModerationError('Valid case version and request key required.');
 const {data,error}=await client.rpc('moderation_auto_approve',{p_case:caseId,p_version:version,p_request:requestId});
 if(error)throw new ModerationError('Automatic decision unavailable; refresh before retrying.',moderationRpcStatus(error.code));
 if(!data||data.caseId!==caseId||!Number.isSafeInteger(data.version)||!['disabled','review_required','approved','already_approved'].includes(data.outcome)||data.published!==false)throw new ModerationError('Invalid automatic decision response.',503);
 return data;
}

/** Bounded server coordinator for a trusted caller; no scheduler, credentials,
 * queue discovery or automation activation. Each failed case stops without retry.
 */
export async function screenModerationBatch(client,caseIds,options={}){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!Array.isArray(caseIds)||caseIds.length<1||caseIds.length>10||caseIds.some(id=>typeof id!=='string'||!uuid.test(id))||new Set(caseIds).size!==caseIds.length)throw new ModerationError('Provide one to ten unique moderation cases.');
 const results=[];
 for(const caseId of caseIds){
  try{results.push({caseId,state:'completed',result:await screenModerationCase(client,caseId,options)});}
  catch(error){results.push({caseId,state:'failed',status:error instanceof ModerationError?error.status:503});}
 }
 return results;
}
