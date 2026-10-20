// Offline DOM harness for the actual browser script. Not browser/SSR acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as workflow from '../src/lib/moderation/workflow.js';
const id='10000000-0000-4000-8000-000000000001';
class Element{
 constructor(){this.disabled=false;this.value='';this.children=[];this.listeners={};this.text='';}
 set textContent(value){this.text=String(value);this.children=[];}
 get textContent(){return this.text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
 append(...children){this.children.push(...children);}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 async click(){if(!this.disabled)await Promise.all((this.listeners.click??[]).map(fn=>fn()));}
}
function mount(fetchImpl){
 const actions=['approve','reject','corrections','screen','escalate','open'].map(action=>Object.assign(new Element(),{dataset:{moderationAction:action}}));
 const feedback=new Element(),reason=new Element(),note=new Element(),correction=new Element();reason.value='FIX_REQUIRED';correction.value='Synthetic correction';
 const panel={dataset:{kind:'product',subject:id,caseId:id,version:'1'},querySelectorAll:()=>actions,querySelector:selector=>({'.moderation-feedback':feedback,'.moderation-reason':reason,'.moderation-note':note,'.moderation-correction':correction})[selector]};
 let reloads=0;const location={origin:'http://localhost:4321',pathname:'/admin/moderation',search:`?kind=product&subject=${id}`,reload:()=>{reloads++;}};
 const document={querySelectorAll:()=>[panel],createElement:()=>new Element()};
 const source=fs.readFileSync(new URL('../src/components/seller/ModerationPanel.astro',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','exports','document','location','crypto',compiled)(()=>({...workflow,requestModeration:(options,command)=>workflow.requestModeration({...options,fetchImpl},command)}),{},document,location,crypto);
 return{actions,feedback,reloads:()=>reloads};
}
test('actual panel script disables stale actions and provides refresh',async()=>{
 const ui=mount(async()=>new Response('{}',{status:409}));await ui.actions[0].click();assert.ok(ui.actions.every(a=>a.disabled));assert.match(ui.feedback.textContent,/Case changed/);const refresh=ui.feedback.children.find(c=>typeof c!=='string');await refresh.click();assert.equal(ui.reloads(),1);
});
test('actual panel script provides session-expiry sign-in without private fields in URL',async()=>{
 const ui=mount(async()=>new Response('{}',{status:401}));await ui.actions[0].click();assert.match(ui.feedback.textContent,/Session expired/);assert.ok(ui.actions.every(a=>a.disabled));const link=ui.feedback.children.find(c=>typeof c!=='string');assert.match(link.href,/^\/login\?next=/);assert.ok(!link.href.includes('Synthetic'));
});
test('actual panel script reuses idempotency key after a lost response',async()=>{
 const calls=[];const ui=mount(async(_,options)=>{calls.push(JSON.parse(options.body));return calls.length===1?new Response('{}',{status:503}):new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{caseId:id,state:'approved',version:2}}));});
 await ui.actions[0].click();await ui.actions[0].click();assert.equal(calls.length,2);assert.equal(calls[0].requestId,calls[1].requestId);assert.equal(ui.reloads(),1);
});
test('actual panel script prevents duplicate concurrent clicks',async()=>{
 let calls=0,finish;const ui=mount(async()=>{calls++;return await new Promise(resolve=>{finish=resolve;});});
 const first=ui.actions[0].click();await ui.actions[0].click();assert.equal(calls,1);assert.ok(ui.actions.every(a=>a.disabled));finish(new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{caseId:id,state:'approved',version:2}})));await first;assert.equal(ui.reloads(),1);
});

test('actual panel script locks actions after reviewer permission revocation',async()=>{
 const ui=mount(async()=>new Response('{}',{status:403}));await ui.actions[4].click();assert.ok(ui.actions.every(a=>a.disabled));assert.match(ui.feedback.textContent,/Access denied/);
});
test('actual panel escalation carries reason and current version; seller submission cannot send reviewer fields',async()=>{
 const calls=[];const ui=mount(async(_,options)=>{calls.push(JSON.parse(options.body));return new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{caseId:id,state:'escalated',version:2}}));});await ui.actions[4].click();assert.equal(calls[0].action,'escalate');assert.deepEqual(calls[0].reasons,['FIX_REQUIRED']);assert.equal(calls[0].version,1);await ui.actions[5].click();assert.deepEqual(calls[1],{action:'open',kind:'product',subject:id});
});
