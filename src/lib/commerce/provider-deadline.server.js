/** Bounded provider call, no retry. Abort is advisory; a late create response is
 * never treated as proof of failure or used to start another payment attempt. */
export async function withProviderDeadline(operation,timeoutMs){
 const controller=new AbortController();let timer;
 try{return await Promise.race([Promise.resolve().then(()=>operation(controller.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('Provider result is unconfirmed.'));},timeoutMs);})]);}
 finally{clearTimeout(timer);controller.abort();}
}
