import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as lifecycle from '../src/lib/services/appointment-lifecycle.js';
const owner='10000000-0000-4000-8000-000000000001',bookingId='10000000-0000-4000-8000-000000000002';
class Element {
 constructor(){this.children=[];this.events={};this.hidden=false;this.disabled=false;this.value='';this.textContent='';}
 append(...children){this.children.push(...children);} replaceChildren(...children){this.children=children;this.textContent='';}
 add(...children){this.append(...children);} addEventListener(name,fn){this.events[name]=fn;} reset(){} querySelector(){return new Element();} setAttribute(){}
}
const data=()=>({profileId:owner,bookings:[{id:bookingId,service_listing_id:owner,appointment_slot_id:owner,status:'confirmed',requested_start:'2099-01-01T12:00:00Z',requested_end:'2099-01-01T13:00:00Z',price_minor:100,currency_code:'INR',lifecycle_revision:1,lifecycle_policy_snapshot:lifecycle.INITIAL_APPOINTMENT_POLICY}],events:[],waitlist:[],offers:[],notifications:[],providerBusinesses:[],services:[],slots:[],policies:[],payments:[],refunds:[],truncated:false});
async function mount({read=async()=>data(),send=async()=>({bookingId})}={}){
 const source=fs.readFileSync(new URL('../src/pages/appointments.astro',import.meta.url),'utf8');const nodes=new Map();
 for(const match of source.matchAll(/id="appointment-([^"]+)"/g))nodes.set(match[1],new Element());
 const events={},calls=[];let auth;
 const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const modules={
 '../lib/services/appointment-lifecycle-client.js':{getAppointmentDashboard:read,sendAppointmentCommand:async(command,options)=>{calls.push({command,options});return send(command,options);}},
 '../lib/services/appointment-lifecycle.js':lifecycle,
 '../lib/services/appointment-client.js':{requestAppointmentSlots:async()=>({slots:[]})},
 '../lib/supabase/browser':{createSupabaseBrowserClient:()=>({auth:{onAuthStateChange:fn=>{auth=fn;return {data:{subscription:{unsubscribe(){}}}};}}})},
 };
 const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
 new Function('require','exports','document','window','location','Option','confirm',code)(name=>{assert.ok(modules[name],name);return modules[name];},{},{getElementById:id=>nodes.get(id.replace('appointment-','')),createElement:()=>new Element(),querySelectorAll:()=>[]},{addEventListener:(name,fn)=>events[name]=fn},{pathname:'/appointments',search:'',origin:'https://test.invalid'},function(label,value){this.textContent=label;this.value=value;},()=>true);
 await flush();return {nodes,calls,flush,auth:event=>auth(event),hide:()=>events.pagehide(),buttons:()=>nodes.get('bookings').children.flatMap(card=>card.children).filter(node=>node.events.click)};
}
test('actual appointment page binds cancellation to the loaded account and clears data on sign-out',async()=>{
 const ui=await mount();const cancel=ui.buttons().find(button=>button.textContent==='Cancel appointment');assert.ok(cancel);cancel.events.click();await ui.flush();assert.equal(ui.calls[0].options.profileId,owner);assert.equal(ui.calls[0].command.action,'cancel');
 ui.auth('SIGNED_OUT');assert.equal(ui.nodes.get('bookings').children.length,0);assert.equal(ui.nodes.get('customer').hidden,true);cancel.events.click();await ui.flush();assert.equal(ui.calls.length,1);
});
test('late dashboard responses after account change or page exit cannot restore private bookings',async()=>{
 for(const event of ['signout','exit']){let finish;const ui=await mount({read:()=>new Promise(resolve=>finish=resolve)});event==='exit'?ui.hide():ui.auth('SIGNED_OUT');finish(data());await ui.flush();assert.equal(ui.nodes.get('bookings').children.length,0);}
});
test('unconfirmed writes require a fresh dashboard before another command',async()=>{
 const ui=await mount({send:async()=>{throw Error('lost acknowledgement');}});const cancel=ui.buttons().find(button=>button.textContent==='Cancel appointment');cancel.events.click();await ui.flush();assert.match(ui.nodes.get('status').textContent,/Refresh to check/);assert.equal(ui.nodes.get('bookings').children.length,0);cancel.events.click();await ui.flush();assert.equal(ui.calls.length,1);
});
