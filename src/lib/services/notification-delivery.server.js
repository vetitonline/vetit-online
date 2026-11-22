import {randomUUID} from 'node:crypto';
import {withProviderDeadline} from '../commerce/provider-deadline.server.js';
import {appointmentId} from './appointment-lifecycle.js';
const ref=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(value);
const fail=()=>{throw Error('Sandbox notification operation is unconfirmed. Reconcile before retrying.');};
/** No credentials, recipient lookup, production transport, route or scheduling.
 * Unknown sends stay claimed. Never infer provider failure from a timeout. */
export function createSandboxNotificationWorker({approved=false,client,provider,timeoutMs=10000,newId=randomUUID}={}){
 if(approved!==true||!client?.rpc||provider?.mode!=='sandbox'||typeof provider.name!=='string'||!/^[a-z][a-z0-9_-]{1,31}$/.test(provider.name)||provider.idempotent!==true||typeof provider.send!=='function'||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000||typeof newId!=='function')throw Error('Explicit sandbox notification approval and idempotent adapter are required.');
 let running=false;
 const invoke=async(name,args)=>{try{const result=await withProviderDeadline(()=>client.rpc(name,args),timeoutMs);if(result?.error||!result)fail();return result.data;}catch{fail();}};
 const validate=job=>{appointmentId(job.id);appointmentId(job.notificationId);appointmentId(job.claimToken);if(!['email','push'].includes(job.channel)||typeof job.targetReference!=='string'||!/^synthetic:[A-Za-z0-9_-]{1,80}$/.test(job.targetReference))fail();};
 const bound=(proof,job)=>proof?.verified===true&&proof.mode==='sandbox'&&proof.provider===provider.name&&proof.idempotencyKey===job.id&&proof.channel===job.channel&&proof.targetReference===job.targetReference;
 const finish=async(job,proof)=>{if(!bound(proof,job)||!['accepted','rejected'].includes(proof.status)||!ref(proof.reference))fail();const state=proof.status==='accepted'?'sent':'failed';if(await invoke('finish_sandbox_appointment_notification',{p_outbox_id:job.id,p_claim_token:job.claimToken,p_state:state,p_receipt:proof.reference})!==state)fail();return state;};
 async function reconcile(outboxId){
  if(typeof provider.getVerifiedStatus!=='function')throw Error('Sandbox delivery status adapter is required.');
  try{
   const id=appointmentId(outboxId),job=await invoke('get_sandbox_appointment_delivery',{p_outbox_id:id});validate(job);if(job.id!==id||!['processing','sent','failed'].includes(job.status))fail();
   if(job.status!=='processing')return{state:'already_finished'};
   const proof=await withProviderDeadline(signal=>provider.getVerifiedStatus({idempotencyKey:id,channel:job.channel,targetReference:job.targetReference,signal}),timeoutMs);
   if(!bound(proof,job)||!['accepted','rejected','pending','unknown'].includes(proof.status))fail();
   if(['pending','unknown'].includes(proof.status))return{state:'unconfirmed'};
   return{state:await finish(job,proof)};
  }catch{fail();}
 }
 return{reconcile,async run(limit=25){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw Error('Notification batch must be from 1 to 100.');
  if(running)return{state:'skipped',scanned:0,sent:0,failed:0,unconfirmed:0};
  running=true;
  try{
   const token=appointmentId(newId());
   const jobs=await invoke('claim_sandbox_appointment_notifications',{p_run_id:token,p_limit:limit});
   if(!Array.isArray(jobs)||jobs.length>limit)fail();
   const seen=new Set();for(const job of jobs){const id=appointmentId(job.id);appointmentId(job.notificationId);if(seen.has(id)||job.claimToken!==token||!['email','push'].includes(job.channel)||typeof job.targetReference!=='string'||!/^synthetic:[A-Za-z0-9_-]{1,80}$/.test(job.targetReference))fail();seen.add(id);}
   const counts={state:'completed',scanned:jobs.length,sent:0,failed:0,unconfirmed:0};
   for(const job of jobs){
    try{
     // A generic notification avoids forwarding clinical, contact or payload data.
     const proof=await withProviderDeadline(signal=>provider.send({idempotencyKey:job.id,channel:job.channel,targetReference:job.targetReference,template:'appointment_update',locale:'en',message:'You have an appointment update. Open Vetit Online to review it.',signal}),timeoutMs);
     const state=await finish(job,proof);
     counts[state]++;
    }catch{counts.unconfirmed++;}
   }
   if(counts.unconfirmed)counts.state='attention_required';
   return counts;
  }catch{fail();}finally{running=false;}
 }};
}
