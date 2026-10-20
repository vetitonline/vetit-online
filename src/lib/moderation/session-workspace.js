import {ModerationError,moderationSubject,normalizeModerationCommand} from './workflow.js';

/** Session-injected UI coordinator. Never supplies identity, roles or publication
 * authority. Server authorization remains mandatory for every request. */
export function createModerationWorkspace({client,getSession,kind,subject,requestId=()=>crypto.randomUUID()}){
 moderationSubject(kind,subject);
 let data=null,busy=false,blocked=true,lastPayload='',lastKey='',principal=null,refreshing=null;
 async function session(){const value=await getSession();if(!value?.accessToken||typeof value.userId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.userId))throw new ModerationError('Sign in to the Test environment.',401);return value;}
 function sameUser(value,expected){if(value.userId!==expected)throw new ModerationError('Account changed. Refresh the case.',401);}
 async function run(operation){
  if(busy)throw new ModerationError('An operation is already running.',409);
  busy=true;
  try{return await operation();}catch(error){if([401,403,409].includes(error?.status))blocked=true;if([401,403].includes(error?.status))data=null;throw error;}finally{busy=false;}
 }
 return{
  snapshot:()=>({data,busy,refreshRequired:blocked}),
  refresh:()=>{
   if(refreshing)return refreshing;
   const attempt=run(async()=>{data=null;blocked=true;principal=null;const before=await session();const result=await client.status(kind,subject,before);sameUser(await session(),before.userId);data=result;principal=before.userId;blocked=false;lastPayload='';lastKey='';return result;}).finally(()=>{if(refreshing===attempt)refreshing=null;});
   refreshing=attempt;return attempt;
  },
  submit:(action,fields={})=>run(async()=>{
   if(blocked)throw new ModerationError('Refresh the case before making changes.',409);
   const c=data?.case;
   if(action==='open'&&c&&!['rejected','corrections'].includes(c.state))throw new ModerationError('Only corrected or unsubmitted subjects may be submitted.');
   const payload=action==='open'?{action,kind,subject}:{action,caseId:c?.caseId,version:c?.version,reasons:fields.reasons??[],note:fields.note??'',correction:fields.correction??''};
   const serialized=JSON.stringify(payload);
   if(serialized!==lastPayload){lastPayload=serialized;lastKey=requestId();}
   const command=normalizeModerationCommand(action==='open'?payload:{...payload,requestId:lastKey});
   const before=await session();sameUser(before,principal);
   const result=await client.command(command,before);sameUser(await session(),principal);
   blocked=true; // Never decide from a stale snapshot after any accepted mutation.
   return result;
  }),
 };
}
