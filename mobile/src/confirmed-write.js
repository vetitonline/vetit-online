/** In-memory confirmation gate. Unknown outcomes never automatically retry.
 * Backend authorization remains authoritative; refresh must provide fresh data.
 */
export function createConfirmedWrite({session,validate,send,refresh,matches,render,timeoutMs=10000}){
 if(!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Invalid timeout');
 let epoch=0,disposed=false,operation=null,pending=null,abort=null,owner=session.snapshot()?.userId??null;
 let state={phase:'idle',command:null};
 const emit=phase=>{state={phase,command:operation?.command??null};if(!disposed)render(state);};
 const clear=()=>{epoch++;abort?.abort();pending=null;operation=null;emit('idle');};
 const unsubscribe=session.subscribe(value=>{if((value?.userId??null)!==owner){owner=value?.userId??null;clear();}});
 const prepare=input=>{if(disposed||!owner||!['idle','success','invalid'].includes(state.phase))return false;try{operation={command:validate(input),owner};emit('confirm');return true;}catch{operation=null;emit('invalid');return false;}};
 async function reconcile(){if(disposed||pending)return;const generation=epoch;try{await refresh();if(disposed||generation!==epoch)return;if(operation&&matches(operation.command)){operation=null;emit('success');}else emit(operation?'uncertain':'idle');}catch{if(!disposed&&generation===epoch)emit(operation?'uncertain':'invalid');}}
 function confirm(){
  if(pending)return pending;if(disposed||state.phase!=='confirm'||!operation)return Promise.resolve();
  const currentOperation=operation;try{validate(currentOperation.command);}catch{operation=null;emit('invalid');return Promise.resolve();}
  const generation=++epoch,controller=new AbortController();abort=controller;let sent=false,timer,accepted=false;
  const current=()=>!disposed&&generation===epoch;
  emit('saving');
  const work=async()=>{const auth=await session.getSession();if(!current()||controller.signal.aborted||auth.userId!==owner||auth.userId!==currentOperation.owner)throw Object.assign(Error('Session changed'),{status:401});sent=true;await send(currentOperation.command,auth.accessToken,controller.signal);const latest=await session.getSession();if(!current()||latest.userId!==owner)throw Error('Session changed');};
  pending=Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Unconfirmed write')),timeoutMs);})]).then(()=>{if(current()){accepted=true;emit('uncertain');}}).catch(error=>{if(!current())return;if(!sent||[400,401,403,409,415,422].includes(error?.status)){operation=null;emit('rejected');}else emit('uncertain');}).finally(async()=>{clearTimeout(timer);controller.abort();if(current()){pending=null;if(accepted)await reconcile();}});
  return pending;
 }
 return{prepare,confirm,reconcile,cancel:()=>{if(state.phase==='confirm'){operation=null;emit('idle');}},clear,snapshot:()=>state,dispose:()=>{disposed=true;clear();unsubscribe();}};
}
