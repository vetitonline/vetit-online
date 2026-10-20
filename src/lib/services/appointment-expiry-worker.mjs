/** Server-side orchestration only. No transport, credentials, cron or auto-start. */
import { randomUUID } from 'node:crypto';
export async function runAppointmentExpiryWorker({enabled=false,invoke,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),newId=randomUUID,maxRuns=4,limit=20}={}) {
  if(!enabled) return {state:'disabled',runs:[]};
  if(typeof invoke!=='function'||!Number.isInteger(maxRuns)||maxRuns<1||maxRuns>10||!Number.isInteger(limit)||limit<1||limit>100) throw new Error('Invalid expiry worker configuration.');
  const runs=[];
  for(let batch=0;batch<maxRuns;batch++) {
    const runId=newId();let receipt;
    for(let attempt=0;attempt<3;attempt++) {
      try { receipt=await invoke({p_run_id:runId,p_limit:limit}); break; }
      catch(error) {
        // Only transport/transaction failures are retried, retaining the run ID.
        if(attempt===2||!['40001','40P01','55P03','57014','TRANSPORT'].includes(error?.code)) throw error;
        await wait(250*2**attempt);
      }
    }
    if(!receipt||!['completed','disabled'].includes(receipt.state)||typeof receipt.hasMore!=='boolean'||!['processed','retryable','failed'].every(key=>Number.isSafeInteger(receipt[key])&&receipt[key]>=0)) throw new Error('Invalid expiry worker receipt.');
    runs.push({runId,...receipt});
    if(receipt.state==='disabled') return {state:'disabled',runs};
    if(receipt.failed) return {state:'attention_required',runs};
    if(!receipt.hasMore&&!receipt.retryable) return {state:'drained',runs};
    await wait(250*2**Math.min(batch,3));
  }
  return {state:'bounded',runs};
}
