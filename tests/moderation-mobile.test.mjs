import test from 'node:test';
import assert from 'node:assert/strict';
import {createMobileModerationClient} from '../mobile/src/moderation-client.ts';
const id='10000000-0000-4000-8000-000000000001';
test('native adapter requires explicit Test configuration and a session',()=>{
 assert.throws(()=>createMobileModerationClient({apiBaseUrl:'https://vetit.online',testApiOrigin:'https://vetit.online'}));
 const client=createMobileModerationClient({apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321'});
 assert.throws(()=>client.status('product',id,{accessToken:''}));
});
test('native adapter reads status with bearer only in headers',async()=>{
 const client=createMobileModerationClient({apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321',fetchImpl:async(url,options)=>{assert.ok(!url.includes('synthetic-token'));assert.equal(options.headers.authorization,'Bearer synthetic-token');return new Response(JSON.stringify({apiVersion:1,state:'available',data:{case:null,events:[]}}));}});
 assert.deepEqual(await client.status('service',id,{accessToken:'synthetic-token'}),{case:null,events:[]});
});
test('native adapter submits through shared command validation',async()=>{
 let calls=0;const client=createMobileModerationClient({apiBaseUrl:'http://localhost:4321',testApiOrigin:'http://localhost:4321',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({apiVersion:1,state:'accepted',data:{caseId:id,version:1,state:'pending'}}));}});
 assert.equal((await client.command({action:'open',kind:'product',subject:id},{accessToken:'synthetic-token'})).state,'pending');
 await assert.rejects(client.command({action:'auto_approve',caseId:id,version:1,requestId:id},{accessToken:'synthetic-token'}));assert.equal(calls,1);
});
