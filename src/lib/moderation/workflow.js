import { resolveMobileApiBase } from '../supabase/test-endpoints.js';
export class ModerationError extends Error { constructor(message,status=422){super(message);this.status=status;} }
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const states=['pending','screened','eligible','approved','rejected','corrections','escalated','blocked'];
function validAutomaticStatus(value){return value===undefined||value&&typeof value==='object'&&['not_approved','approved','review_required'].includes(value.status)&&value.publicationEnabled===false&&['approvedAt','validUntil'].every(key=>value[key]===undefined||typeof value[key]==='string'&&Number.isFinite(Date.parse(value[key])))&&(value.status!=='approved'||typeof value.approvedAt==='string'&&typeof value.validUntil==='string');}
export function moderationSubject(kind,subject){
 if(!['seller','product','service'].includes(kind)||!UUID.test(subject??''))throw new ModerationError('Invalid moderation subject.');
 return {kind,subject};
}
export function normalizeModerationCommand(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ModerationError('Invalid moderation command.');
 if(value.action==='open'){
  if(Object.keys(value).some(k=>!['action','kind','subject'].includes(k)))throw new ModerationError('Unsupported moderation field.');
  return {action:'open',...moderationSubject(value.kind,value.subject)};
 }
 if(!['screen','approve','reject','corrections','escalate'].includes(value.action)||Object.keys(value).some(k=>!['action','caseId','version','requestId','reasons','note','correction'].includes(k))||!UUID.test(value.caseId??'')||!UUID.test(value.requestId??'')||!Number.isSafeInteger(value.version)||value.version<1)throw new ModerationError('Invalid moderation decision.');
 const reasons=value.reasons??[],note=value.note??'',correction=value.correction??'';
 if(!Array.isArray(reasons)||reasons.length>10||reasons.some(r=>typeof r!=='string'||!/^[A-Z][A-Z0-9_]{1,63}$/.test(r))||typeof note!=='string'||note.length>1000||typeof correction!=='string'||correction.length>1000||['reject','corrections','escalate'].includes(value.action)&&!reasons.length||value.action==='corrections'&&!correction.trim())throw new ModerationError('Explain the decision using reason codes and correction requirements.');
 return {action:value.action,caseId:value.caseId,version:value.version,requestId:value.requestId,reasons:[...new Set(reasons)],note,correction};
}
export function moderationRpcStatus(code){return code==='42501'?403:['40001','23505','40P01','55P03'].includes(code)?409:['22023','23514','22P02'].includes(code)?422:503;}
function queueArguments(params){
 const kind=params.get('kind')||null,state=params.get('state')||null,market=params.get('market')||null,category=params.get('category')||null,classification=params.get('classification')||null,before=params.get('before')||null,id=params.get('id')||null;
 if(kind&&!['seller','product','service'].includes(kind)||state&&!states.includes(state)||market&&!/^[A-Z]{2}$/.test(market)||category&&!UUID.test(category)||classification&&!['ordinary','regulated','veterinary','live_animal','prohibited','unconfigured'].includes(classification)||Boolean(before)!==Boolean(id)||before&&(!Number.isFinite(Date.parse(before))||before.length>40||!UUID.test(id)))throw new ModerationError('Invalid moderation queue filters.');
 return {p_kind:kind,p_state:state,p_market:market,p_category:category,p_classification:classification,p_before:before,p_id:id};
}
export async function loadModerationQueue(client,params){
 const {data,error}=await client.rpc('moderation_queue',queueArguments(params));
 if(error)throw new ModerationError('Moderation queue unavailable.',moderationRpcStatus(error.code));
 return checkedQueue(data);
}
function checkedQueue(data){
 if(!data||!Array.isArray(data.items)||data.items.length>25||typeof data.hasMore!=='boolean'||data.hasMore&&!data.items.length||data.items.some(i=>!i||!UUID.test(i.id??'')||!UUID.test(i.subject_id??'')||!['seller','product','service'].includes(i.subject_kind)||!states.includes(i.state)||!Number.isSafeInteger(i.version)||i.version<1||typeof i.title!=='string'||typeof i.seller_name!=='string'||!['ordinary','regulated','veterinary','live_animal','prohibited','unconfigured'].includes(i.classification)||!/^[A-Z]{2}$/.test(i.market??'')||i.category_id!==null&&!UUID.test(i.category_id??'')||!Array.isArray(i.reasons)||i.reasons.some(r=>typeof r!=='string')||!Number.isFinite(Date.parse(i.created_at))||!Number.isFinite(Date.parse(i.updated_at))||!validAutomaticStatus(i.automatic_approval)))throw new ModerationError('Invalid moderation queue response.',503);
 return data;
}
/** Triage only; this never grants reviewer permission or publication authority. */
export function moderationNeedsReview(c){return Boolean(c&&(c.reasons?.length||['screened','blocked','escalated'].includes(c.state)||c.automaticApproval?.status==='review_required'));}
export async function getModerationQueue({baseUrl,testOrigin,accessToken,fetchImpl=fetch,signal},params=new URLSearchParams()){
 queueArguments(params);
 const origin=resolveMobileApiBase(baseUrl,testOrigin);
 if(typeof accessToken!=='string'||!accessToken||/\s/.test(accessToken)||accessToken.length>8192)throw new ModerationError('A verified session is required.',401);
 const url=new URL('/api/moderation',origin);url.searchParams.set('view','queue');
 for(const key of ['kind','state','market','category','classification','before','id'])if(params.get(key))url.searchParams.set(key,params.get(key));
 const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,10000);
 try{const response=await fetchImpl(url.href,{method:'GET',headers:{accept:'application/json',authorization:`Bearer ${accessToken}`},cache:'no-store',credentials:'omit',signal:abort.signal});if(!response.ok)throw new ModerationError('Reviewer queue unavailable.',response.status);const result=await response.json();if(result?.apiVersion!==1||result.state!=='available')throw new ModerationError('Unsupported moderation queue response.',503);return checkedQueue(result.data);}
 catch(error){if(error instanceof ModerationError)throw error;throw new ModerationError('Reviewer queue unavailable.',503);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
export async function executeModeration(client,value){
 const c=normalizeModerationCommand(value);
 const {data,error}=await client.rpc(c.action==='open'?'moderation_open':'moderation_decide',c.action==='open'?{p_kind:c.kind,p_subject:c.subject}:{p_case:c.caseId,p_version:c.version,p_action:c.action,p_request:c.requestId,p_reasons:c.reasons,p_note:c.note,p_correction:c.correction});
 if(error)throw new ModerationError('Moderation action unavailable or case changed.',moderationRpcStatus(error.code));
 if(!data||!UUID.test(data.caseId??'')||!Number.isSafeInteger(data.version)||!states.includes(data.state))throw new ModerationError('Invalid moderation response.',503);
 return data;
}
export async function loadModerationStatus(client,kind,subject){
 moderationSubject(kind,subject);
 const {data,error}=await client.rpc('moderation_status',{p_kind:kind,p_subject:subject});
 if(error)throw new ModerationError('Moderation status unavailable.',moderationRpcStatus(error.code));
 return checkedStatus(data);
}
function checkedStatus(data){
 if(!data||!Array.isArray(data.events)||data.events.length>50||data.events.some(e=>!e||!Number.isSafeInteger(e.id)||typeof e.operation!=='string'||!states.includes(e.state)||!Array.isArray(e.reasons)||e.reasons.some(r=>typeof r!=='string')||typeof e.at!=='string'||!Number.isFinite(Date.parse(e.at))||e.note!==null&&typeof e.note!=='string'||e.reviewer!==null&&!UUID.test(e.reviewer??''))||data.case!==null&&(!data.case||!UUID.test(data.case.caseId??'')||!Number.isSafeInteger(data.case.version)||!states.includes(data.case.state)||!Array.isArray(data.case.reasons)||data.case.reasons.some(r=>typeof r!=='string')||typeof data.case.correction!=='string'||!validAutomaticStatus(data.case.automaticApproval)))throw new ModerationError('Invalid moderation status.',503);
 return data;
}
export async function getModerationStatus({baseUrl,testOrigin,accessToken,fetchImpl=fetch,signal},kind,subject){
 moderationSubject(kind,subject);const origin=resolveMobileApiBase(baseUrl,testOrigin);
 if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||/\s/.test(accessToken)||accessToken.length>8192))throw new ModerationError('Invalid authentication token.',401);
 const url=new URL('/api/moderation',origin);url.searchParams.set('kind',kind);url.searchParams.set('subject',subject);
 const abort=new AbortController();const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();const timer=setTimeout(cancel,10000);
 try{
  const response=await fetchImpl(url.href,{method:'GET',headers:{accept:'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{})},credentials:'same-origin',cache:'no-store',signal:abort.signal});
  if(!response.ok)throw new ModerationError('Moderation status unavailable.',response.status);
  const result=await response.json();if(result?.apiVersion!==1||result.state!=='available')throw new ModerationError('Unsupported moderation response.',503);return checkedStatus(result.data);
 }catch(error){if(error instanceof ModerationError)throw error;throw new ModerationError('Moderation service unavailable.',503);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
/** Shared native/browser transport. Explicit matching TEST origins, no token storage. */
export async function requestModeration({baseUrl,testOrigin,accessToken,fetchImpl=fetch,signal},command){
 const origin=resolveMobileApiBase(baseUrl,testOrigin);
 if(accessToken!==undefined&&(typeof accessToken!=='string'||!accessToken||/\s/.test(accessToken)||accessToken.length>8192))throw new ModerationError('Invalid authentication token.',401);
 const body=normalizeModerationCommand(command);
 const abort=new AbortController();const cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 const timer=setTimeout(cancel,10000);
 try{
  const response=await fetchImpl(new URL('/api/moderation',origin).href,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json',...(accessToken?{authorization:`Bearer ${accessToken}`}:{})},body:JSON.stringify(body),signal:abort.signal,cache:'no-store'});
  if(!response.ok)throw new ModerationError(response.status===409?'The case changed. Refresh before deciding.':'Moderation action was not accepted.',response.status);
  const result=await response.json();if(result?.apiVersion!==1||result.state!=='accepted'||!UUID.test(result.data?.caseId??'')||!Number.isSafeInteger(result.data?.version)||!states.includes(result.data?.state))throw new ModerationError('Invalid moderation response.',503);
  return result.data;
 }catch(error){if(error instanceof ModerationError)throw error;throw new ModerationError('Moderation service unavailable. Refresh status before retrying.',503);}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
}
