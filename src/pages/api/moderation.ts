import type {APIRoute} from 'astro';
import {authenticateApiRequest} from '../../lib/supabase/api-auth';
import {isSameOriginMutation} from '../../lib/api/request-security.js';
import {readJsonBody} from '../../lib/api/json-body.js';
import {executeModeration,loadModerationStatus,loadModerationQueue,moderationSubject,normalizeModerationCommand,ModerationError} from '../../lib/moderation/workflow.js';
import type {QueueClient} from '../../lib/moderation/queue.js';
const reply=(status:number,state:string,data?:unknown)=>new Response(JSON.stringify({apiVersion:1,state,...(data?{data}:{})}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store',vary:'Cookie, Authorization','x-content-type-options':'nosniff'}});
export const GET:APIRoute=async({request,cookies,url})=>{
 const auth=await authenticateApiRequest(request,cookies);if(auth.state!=='authenticated')return reply(auth.state==='unauthenticated'?401:503,auth.state);
 try{if(url.searchParams.get('view')==='queue'){if(![true,'true'].includes(auth.user.app_metadata?.vetit_reviewer))return reply(403,'forbidden');return reply(200,'available',await loadModerationQueue(auth.supabase as unknown as QueueClient,url.searchParams));}const {kind,subject}=moderationSubject(url.searchParams.get('kind'),url.searchParams.get('subject'));return reply(200,'available',await loadModerationStatus(auth.supabase as unknown as QueueClient,kind,subject));}
 catch(error){return reply(error instanceof ModerationError?error.status:503,'unavailable');}
};
export const POST:APIRoute=async({request,cookies})=>{
 if(!isSameOriginMutation(request))return reply(403,'forbidden');
 if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return reply(415,'invalid_request');
 const auth=await authenticateApiRequest(request,cookies);if(auth.state!=='authenticated')return reply(auth.state==='unauthenticated'?401:503,auth.state);
 const body=await readJsonBody(request,8192);if(!body.ok)return reply(body.status,'invalid_request');
 try{const command=normalizeModerationCommand(body.value);if(!['open','screen'].includes(command.action)&&![true,'true'].includes(auth.user.app_metadata?.vetit_reviewer))return reply(403,'forbidden');return reply(200,'accepted',await executeModeration(auth.supabase as unknown as QueueClient,command));}
 catch(error){return reply(error instanceof ModerationError?error.status:503,'unavailable');}
};
