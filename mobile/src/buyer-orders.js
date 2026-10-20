import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import {createOrderWorkspace} from '../../src/lib/buyer/order-workspace.js';
import {requestBuyerOrders,BuyerOrderError} from '../../src/lib/buyer/orders-client.js';
const blank=phase=>({phase,mode:'list',orders:[],detail:null,nextCursor:null});
/** Private read-only workspace. Verified identity stays outside UI snapshots;
 * account changes invalidate outstanding work even if transport ignores abort.
 */
export function createNativeBuyerOrders({session,apiBaseUrl,testApiOrigin,render,read=requestBuyerOrders}){
 const baseUrl=resolveMobileApiBase(apiBaseUrl,testApiOrigin);
 let owner=session.snapshot()?.userId??null,epoch=0,disposed=false,workspace,lastQuery={};
 function make(){return createOrderWorkspace({render,read:async options=>{
  const generation=epoch;
  const auth=await session.getSession();
  if(disposed||generation!==epoch||auth.userId!==owner)throw new BuyerOrderError('Session changed.',401);
  const controller=new AbortController();const cancel=()=>controller.abort();options.signal?.addEventListener('abort',cancel,{once:true});if(options.signal?.aborted)cancel();
  let timer;
  try{
   const result=await Promise.race([
    Promise.resolve().then(()=>read({...options,baseUrl,accessToken:auth.accessToken,signal:controller.signal})),
    new Promise((_,reject)=>{timer=setTimeout(()=>{cancel();reject(new BuyerOrderError('Order history timed out.',503));},5000);}),
   ]);
   if(disposed||generation!==epoch||controller.signal.aborted)throw new BuyerOrderError('Session changed.',401);
   const latest=await session.getSession();
   if(disposed||generation!==epoch||latest.userId!==auth.userId||owner!==auth.userId)throw new BuyerOrderError('Session changed.',401);
   return result;
  }finally{clearTimeout(timer);options.signal?.removeEventListener('abort',cancel);}
 }});}
 workspace=make();
 const clear=()=>{epoch++;lastQuery={};workspace.dispose();workspace=make();render(blank('signin'));};
 const unsubscribe=session.subscribe(identity=>{const next=identity?.userId??null;if(next!==owner){const invalidate=owner!==null||next===null;owner=next;if(invalidate)clear();}});
 const load=(options={})=>{if(disposed)return Promise.resolve();lastQuery={...options};return workspace.load(lastQuery);};
 return{load,retry:()=>disposed?Promise.resolve():workspace.load(lastQuery),clear:()=>{if(!disposed)clear();},dispose:()=>{disposed=true;epoch++;unsubscribe();workspace.dispose();}};
}
