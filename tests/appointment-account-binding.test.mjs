import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppointmentCommandHandler} from '../src/lib/services/appointment-command-api.js';
import {sendAppointmentCommand} from '../src/lib/services/appointment-lifecycle-client.js';
const owner='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002';
function fixture(){const calls=[];return {calls,handler:createAppointmentCommandHandler({authenticate:async()=>({state:'authenticated',user:{id:owner},supabase:{}}),statusForCode:()=>409,rpc:async(_client,name,args)=>{calls.push({name,args});return {data:{bookingId:other,status:'cancelled'}};}})};}
const req=(profileId,body={action:'cancel',bookingId:other,expectedRevision:1},origin='https://test.invalid')=>({request:new Request('https://test.invalid/api/appointments',{method:'POST',headers:{origin,'content-type':'application/json',...(profileId===undefined?{}:{'x-vetit-profile-id':profileId})},body:JSON.stringify(body)})});
test('stale or missing account preconditions cannot cancel, reschedule or change waitlists',async()=>{
 for(const action of ['cancel','reschedule','joinWaitlist','acceptOffer','leaveWaitlist'])for(const identity of [undefined,other,'invalid']){
  const f=fixture();assert.equal((await f.handler(req(identity,{action}))).status,409);assert.equal(f.calls.length,0);
 }
});
test('same-account cookie and native bearer commands share validation and strip claimed ownership',async()=>{
 for(const bearer of [false,true]){const f=fixture();const request=req(owner,{action:'cancel',bookingId:other,expectedRevision:1,customerId:other,role:'admin'});if(bearer){request.request.headers.delete('origin');request.request.headers.set('authorization','Bearer aaa.bbb.ccc');}
 const response=await f.handler(request);assert.equal(response.status,200);assert.deepEqual(f.calls[0].args,{p_command:{action:'cancel',bookingId:other,expectedRevision:1}});assert.match(response.headers.get('cache-control'),/no-store/);
 }
});
test('cross-site requests and malformed commands do not reach lifecycle RPC',async()=>{
 const f=fixture();assert.equal((await f.handler(req(owner,{},'https://evil.invalid'))).status,403);assert.equal((await f.handler(req(owner,{action:'cancel',bookingId:'bad'}))).status,422);assert.equal(f.calls.length,0);
});
test('shared native/browser transport includes account binding for cancellation and rescheduling',async()=>{
 for(const action of ['cancel','reschedule']){let init;await sendAppointmentCommand({action,bookingId:other,expectedRevision:2,...(action==='reschedule'?{slotId:owner}:{})},{baseUrl:'https://test.invalid',profileId:owner,accessToken:'synthetic-token',fetchImpl:async(_url,options)=>{init=options;return Response.json({apiVersion:1,state:'accepted',data:{bookingId:other}});}});assert.equal(init.headers['x-vetit-profile-id'],owner);assert.equal(init.credentials,'omit');}
});

test('account conflicts have an actionable safe message without reflecting server diagnostics',async()=>{
 await assert.rejects(sendAppointmentCommand({action:'cancel',bookingId:other,expectedRevision:1},{baseUrl:'https://test.invalid',profileId:owner,fetchImpl:async()=>Response.json({state:'session_changed',message:'secret'},{status:409})}),error=>error.status===409&&/account changed/.test(error.message)&&!error.message.includes('secret'));
});
