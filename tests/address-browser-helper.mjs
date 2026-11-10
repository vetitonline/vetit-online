import { spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Installed Chromium + standard CDP only. An isolated profile, no user browser state. */
export async function startAddressBrowser(){
  const profile=await mkdtemp(join(tmpdir(),'vetit-address-browser-'));
  const child=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe']});
  const browserUrl=await new Promise((resolve,reject)=>{let output='';const timer=setTimeout(()=>reject(Error('Chromium did not expose a local debugging endpoint.')),15000);child.once('error',reject);child.stderr.on('data',chunk=>{output=(output+chunk).slice(-10000);const found=output.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:[^\s]+)/);if(found){clearTimeout(timer);resolve(found[1]);}});child.once('exit',code=>{clearTimeout(timer);reject(Error('Chromium exited before startup: '+code));});});
  const port=new URL(browserUrl).host;
  const targets=await(await fetch(`http://${port}/json/list`)).json();
  const target=targets.find(value=>value.type==='page');if(!target)throw Error('No isolated browser page.');
  const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let next=0;const pending=new Map(),listeners=new Map();
  socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error(message.error.message)):item.resolve(message.result);}else for(const fn of listeners.get(message.method)??[])Promise.resolve(fn(message.params)).catch(error=>{errors.push(error.message);});});
  const errors=[];
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Browser command timed out: '+method));},15000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  const on=(name,callback)=>{if(!listeners.has(name))listeners.set(name,[]);listeners.get(name).push(callback);};
  const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);return result.result.value;};
  const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Browser condition timed out: '+expression);};
  await send('Page.enable');await send('Runtime.enable');
  on('Runtime.exceptionThrown',event=>{errors.push(event.exceptionDetails.exception?.description??event.exceptionDetails.text);});
  on('Page.javascriptDialogOpening',()=>send('Page.handleJavaScriptDialog',{accept:true}));
  return{send,on,evaluate,wait,errors,async close(){socket.close();child.kill('SIGTERM');await new Promise(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',resolve);setTimeout(()=>{child.kill('SIGKILL');resolve();},2000).unref();}});await rm(profile,{recursive:true,force:true});}};
}
