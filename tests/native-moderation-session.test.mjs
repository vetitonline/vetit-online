import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeModerationSession} from '../mobile/src/moderation-session.js';
const id='10000000-0000-4000-8000-000000000001';
const config={apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321',getAccessToken:async()=> 'synthetic-token'};
const response=()=>new Response(JSON.stringify({apiVersion:1,state:'available',userId:id,reviewerHint:true}));
test('native session verifies remotely, deduplicates verification and keeps tokens out of snapshots',async()=>{
 let requests=0;const snapshots=[];const host=createNativeModerationSession({...config,fetchImpl:async(url,options)=>{requests++;assert.equal(new URL(url).pathname,'/api/moderation-session');assert.ok(!url.includes('synthetic-token'));assert.equal(options.headers.authorization,'Bearer synthetic-token');assert.equal(options.credentials,'omit');return response();}});const unsubscribe=host.subscribe(value=>snapshots.push(value));const [a,b]=await Promise.all([host.refresh(),host.getSession()]);assert.equal(requests,1);assert.equal(a.userId,id);assert.equal(b.accessToken,'synthetic-token');assert.ok(!JSON.stringify(snapshots).includes('synthetic-token'));host.clear();assert.equal(host.snapshot(),null);unsubscribe();
});
test('native session rejects rotated tokens and cannot resurrect after background/sign-out',async()=>{
 let token='synthetic-first';const host=createNativeModerationSession({...config,getAccessToken:async()=>token,fetchImpl:async()=>{token='synthetic-second';return response();}});await assert.rejects(host.refresh(),e=>e.status===401);assert.equal(host.snapshot(),null);
 let finish,started;const ready=new Promise(resolve=>{started=resolve;});const other=createNativeModerationSession({...config,fetchImpl:()=>new Promise(resolve=>{finish=resolve;started();})});const pending=other.refresh();await ready;other.clear();await assert.rejects(pending);finish(response());await Promise.resolve();assert.equal(other.snapshot(),null);
});
test('secure token-source failures, unavailable verification and invalid identities fail closed and permit explicit retry',async()=>{
 let calls=0;const host=createNativeModerationSession({...config,getAccessToken:()=>{if(++calls===1)throw Error('private diagnostic');return Promise.resolve('synthetic-token');},fetchImpl:async()=>response()});await assert.rejects(host.refresh(),e=>e.status===503&&!e.message.includes('private'));assert.equal((await host.refresh()).userId,id);
 for(const reply of [new Response('{}',{status:401}),new Response('{}',{status:503}),new Response(JSON.stringify({apiVersion:1,state:'available',userId:'invalid',reviewerHint:true}))]){const f=createNativeModerationSession({...config,fetchImpl:async()=>reply});await assert.rejects(f.refresh());assert.equal(f.snapshot(),null);}
});
test('token acquisition is bounded and abort cannot later populate identity',async()=>{
 let release,requests=0;const host=createNativeModerationSession({...config,timeoutMs:5,getAccessToken:()=>new Promise(resolve=>{release=resolve;}),fetchImpl:async()=>{requests++;return response();}});await assert.rejects(host.refresh(),e=>e.status===503);release('synthetic-token');await Promise.resolve();await Promise.resolve();assert.equal(requests,0);assert.equal(host.snapshot(),null);
});
test('production origin is refused before reading tokens',()=>assert.throws(()=>createNativeModerationSession({...config,apiBaseUrl:'https://vetit.online',testApiOrigin:'https://vetit.online'})));
