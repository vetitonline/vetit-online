import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {normalizeQuoteLines} from '../../src/lib/commerce/checkout-quote.js';
import {requestCheckoutQuote} from '../../src/lib/commerce/quote-client.js';
/** Explicit read-only quote operation. No order, payment or stock reservation. */
export function createNativeCheckoutReview({session,apiBaseUrl,testApiOrigin,lines,render,read=requestCheckoutQuote}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin),input=normalizeQuoteLines({lines});
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,busy=false,active;
 const clear=()=>{epoch++;active?.abort();busy=false;render({phase:'signin',quote:null});};
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){const invalidate=owner!==null||next===null;owner=next;if(invalidate)clear();}});
 return{clear,run:async()=>{
  if(disposed||busy)return;busy=true;const generation=epoch,controller=new AbortController();active=controller;
  render({phase:'loading',quote:null});const timer=setTimeout(()=>controller.abort(),10000);
  const current=()=>!disposed&&generation===epoch&&!controller.signal.aborted;
  try{
   const auth=await session.getSession();if(!current())throw Error('Session unavailable.');if(auth.userId!==owner)throw Object.assign(Error('Session changed.'),{status:401});
   const quote=await Promise.race([read(input,{baseUrl,accessToken:auth.accessToken,signal:controller.signal}),new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true}))]);
   if(!current())throw Error('Session unavailable.');const latest=await session.getSession();if(!current())throw Error('Session unavailable.');if(latest.userId!==auth.userId||owner!==auth.userId)throw Object.assign(Error('Session changed.'),{status:401});
   render({phase:'ready',quote});
  }catch(error){if(!disposed&&generation===epoch)render({phase:error?.status===401?'signin':'error',quote:null});}
  finally{clearTimeout(timer);if(active===controller){active=null;busy=false;}}
 },dispose:()=>{disposed=true;epoch++;active?.abort();unsubscribe();}};
}
