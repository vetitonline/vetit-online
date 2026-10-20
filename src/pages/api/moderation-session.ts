import type {APIRoute} from 'astro';
import {authenticateApiRequest} from '../../lib/supabase/api-auth';
/** Verified identity only. reviewerHint is presentation; queue/decisions still
 * require a current registered reviewer in the database on every operation. */
export const GET:APIRoute=async({request,cookies})=>{
 let auth;
 try{auth=await authenticateApiRequest(request,cookies);}catch{auth={state:'unavailable' as const};}
 const status=auth.state==='authenticated'?200:auth.state==='unauthenticated'?401:503;
 return new Response(JSON.stringify(auth.state==='authenticated'?{apiVersion:1,state:'available',userId:auth.user.id,reviewerHint:[true,'true'].includes(auth.user.app_metadata?.vetit_reviewer)}:{apiVersion:1,state:auth.state}),{status,headers:{'content-type':'application/json','cache-control':'private, no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'}});
};
