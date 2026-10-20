import type {APIRoute} from 'astro';
import {authenticateApiRequest} from '../../../lib/supabase/api-auth';
import {isSameOriginMutation} from '../../../lib/api/request-security.js';
import {readJsonBody} from '../../../lib/api/json-body.js';
import {loadSellerCatalogue,writeSellerCatalogue} from '../../../lib/seller/catalogue.js';
export const prerender=false;
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
export const GET:APIRoute=async({request,cookies})=>{
 const auth=await authenticateApiRequest(request,cookies);if(auth.state!=='authenticated')return json({state:auth.state},auth.state==='unavailable'?503:401);
 try{return json({apiVersion:1,data:await loadSellerCatalogue(auth.supabase,auth.user.id)});}catch{return json({state:'unavailable'},503);}
};
export const POST:APIRoute=async({request,cookies})=>{
 if(!isSameOriginMutation(request))return json({state:'forbidden'},403);
 if(request.headers.get('content-type')?.split(';',1)[0].trim().toLowerCase()!=='application/json')return json({state:'invalid'},415);
 const auth=await authenticateApiRequest(request,cookies);if(auth.state!=='authenticated')return json({state:auth.state},auth.state==='unavailable'?503:401);
 const body=await readJsonBody(request,32768);if(!body.ok)return json({state:'invalid'},body.status);
 try{return json({apiVersion:1,data:await writeSellerCatalogue(auth.supabase,auth.user.id,body.value)});}catch(error){const status=typeof error==='object'&&error&&'status'in error?Number(error.status):503;return json({state:'unconfirmed'},[400,403,409,422].includes(status)?status:503);}
};
