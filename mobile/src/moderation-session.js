import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {ModerationError} from '../../src/lib/moderation/workflow.js';

/** Existing platform auth supplies tokens from its secure storage. This host
 * never persists, logs or exposes tokens in subscription snapshots. */
export function createNativeModerationSession({apiBaseUrl,testApiOrigin,getAccessToken,fetchImpl=fetch,timeoutMs=10000}){
 const origin=resolveMobileApiBase(apiBaseUrl,testApiOrigin),listeners=new Set();
 let identity=null,epoch=0,pending=null,controller=null;
 const publish=value=>{identity=value;for(const listener of listeners)listener(value);};
 const clear=()=>{epoch++;controller?.abort();pending=null;publish(null);};
 function refresh(){
  if(pending)return pending;
  const generation=epoch;controller=new AbortController();const local=controller;
  const operation=(async()=>{
   try{
    const token=await Promise.resolve().then(getAccessToken);if(typeof token!=='string'||!token||/\s/.test(token)||token.length>8192)throw new ModerationError('Sign in to Test.',401);
    if(local.signal.aborted||generation!==epoch)throw new ModerationError('Session changed.',401);
    const response=await fetchImpl(new URL('/api/moderation-session',origin).href,{method:'GET',headers:{accept:'application/json',authorization:`Bearer ${token}`},credentials:'omit',cache:'no-store',signal:local.signal});
    if(!response.ok)throw new ModerationError('Session verification unavailable.',response.status);
    const value=await response.json();
    if(value?.apiVersion!==1||value.state!=='available'||typeof value.reviewerHint!=='boolean'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.userId??''))throw new ModerationError('Invalid verified identity.',503);
    const latest=await getAccessToken();if(generation!==epoch||local.signal.aborted||latest!==token)throw new ModerationError('Session changed. Sign in again.',401);
    const verified={userId:value.userId,reviewerHint:value.reviewerHint};publish(verified);
    return{userId:verified.userId,accessToken:token};
   }catch(error){throw error instanceof ModerationError?error:new ModerationError('Session verification unavailable.',503);}
  })();
  let cancel;
  const deadline=new Promise((_,reject)=>{cancel=()=>reject(new ModerationError('Session verification cancelled or timed out.',503));local.signal.addEventListener('abort',cancel,{once:true});});
  const timer=setTimeout(()=>local.abort(),Number.isFinite(timeoutMs)?Math.max(1,Math.min(timeoutMs,10000)):10000);
  const task=Promise.race([operation,deadline]).catch(error=>{if(generation===epoch)publish(null);throw error;}).finally(()=>{clearTimeout(timer);local.signal.removeEventListener('abort',cancel);if(pending===task)pending=null;});
  pending=task;return task;
 }
 return{snapshot:()=>identity,subscribe:listener=>{listeners.add(listener);return()=>listeners.delete(listener);},refresh,getSession:refresh,clear};
}
