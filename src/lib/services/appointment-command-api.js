import {isSameOriginMutation,matchesExpectedAccount} from '../api/request-security.js';
import {readJsonBody} from '../api/json-body.js';
import {AppointmentLifecycleError,normalizeAppointmentCommand} from './appointment-lifecycle.js';
/** Shared cookie/bearer command boundary. Account precondition is never a role grant. */
export function createAppointmentCommandHandler({authenticate,rpc,statusForCode}) {
 const json=(state,status,data)=>new Response(JSON.stringify({apiVersion:1,state,...(data?{data}:{})}),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 return async({request,cookies})=>{
  try {
   if(request.method!=='POST')return json('method_not_allowed',405);
   if(!isSameOriginMutation(request))return json('forbidden',403);
   if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json('invalid_request',415);
   const auth=await authenticate(request,cookies);
   if(auth.state!=='authenticated')return json(auth.state==='unavailable'?'unavailable':'unauthorized',auth.state==='unavailable'?503:401);
   if(!matchesExpectedAccount(request,auth.user.id))return json('session_changed',409);
   const body=await readJsonBody(request,8192);if(!body.ok)return json('invalid_request',body.status);
   const command=normalizeAppointmentCommand(body.value);
   const result=await rpc(auth.supabase,'appointment_lifecycle_command',{p_command:command});
   if(result.error)return json('unavailable',statusForCode(result.error.code));
   if(!result.data)return json('unavailable',503);
   return json('accepted',200,result.data);
  }catch(error){return json('invalid_request',error instanceof AppointmentLifecycleError?error.status:503);}
 };
}
