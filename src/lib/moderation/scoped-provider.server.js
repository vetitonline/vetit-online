// SERVER ONLY. Adapters receive content evidence, never a database client/key.
// This is a coordinator boundary, not a replacement for database authorization.
import {screenModerationCase} from './worker.server.js';
export function createScopedProvider({businessId,check,expiresAt,provider,now=Date.now}){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const until=Date.parse(expiresAt);
 if(!uuid.test(businessId??'')||!['content','legal','images','credentials'].includes(check)||!Number.isFinite(until)||until<=now()||typeof provider?.screen!=='function')throw Error('Valid scoped provider configuration required.');
 return{screen:async(input,options)=>{
  if(now()>=until||input?.check!==check||input.businessId!==businessId||input.market!=='IN'||!['seller','product','service'].includes(input.kind)||!/^[0-9a-f]{64}$/.test(input.revision??''))throw Error('Provider scope unavailable.');
  const payload={revision:input.revision,kind:input.kind,market:input.market,policyVersion:input.policyVersion,
   ...(check==='content'?{text:input.text}:{}),...(check==='images'?{images:input.images?.map(image=>({path:image.path,storageVersion:image.storageVersion}))}:{})};
  const result=await provider.screen(payload,options);
  // Never expose raw provider diagnostics or extend evidence beyond this grant.
  const validity=Date.parse(result?.validUntil);
  return{status:result?.status,revision:result?.revision,...(Number.isFinite(validity)?{validUntil:new Date(Math.min(validity,until)).toISOString()}:{})};
 }};
}

/** Preferred scoped entry point. The coordinator alone owns the DB client;
 * external adapters receive no client, key, identity or permission configuration.
 * Automatic decision/publication is deliberately not exposed by this entry point.
 */
export async function screenBusinessCase(client,caseId,{businessId,expiresAt,providers={},timeoutMs=2000,now=Date.now}){
 if(typeof caseId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(caseId))throw Error('Valid scoped moderation case required.');
 const until=Date.parse(expiresAt);
 const live=()=>{if(!Number.isFinite(now())||now()>=until)throw Error('Scoped coordinator permission expired.');};
 const scoped={};
 for(const [check,provider] of Object.entries(providers))scoped[check]=createScopedProvider({businessId,check,expiresAt,provider,now});
 // Validate grant even if no adapters are configured (remaining checks fail closed).
 createScopedProvider({businessId,check:'content',expiresAt,provider:{screen:async()=>({})},now});
 const boundClient={rpc:async(name,args)=>{
  live();
  if(!['moderation_screening_context','moderation_attest'].includes(name)||args.p_case!==caseId)throw Error('Scoped coordinator operation denied.');
  const result=await client.rpc(name,args);
  live();
  if(name==='moderation_screening_context'&&!result.error&&(result.data?.businessId!==businessId||result.data?.market!=='IN'))throw Error('Scoped coordinator context denied.');
  return result;
 }};
 return screenModerationCase(boundClient,caseId,{providers:scoped,timeoutMs,attemptAutomaticApproval:false});
}
