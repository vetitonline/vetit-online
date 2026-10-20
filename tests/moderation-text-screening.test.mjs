import test from 'node:test';
import assert from 'node:assert/strict';
import {screenModerationCase} from '../src/lib/moderation/worker.server.js';
import {createModerationRoutes,fixtureId} from './moderation-api-fixture.mjs';
const rules={policyVersion:'synthetic-policy-1',prohibited:['synthetic prohibited'],restricted:['synthetic restricted'],suspicious:['संदिग्ध प्रस्ताव']};
async function screening(text,textRules=rules,{providerFails=false}={}){
 const calls=[];let version=1,contentCalls=0;
 const pass={screen:async({revision})=>({status:'passed',revision,validUntil:new Date(Date.now()+60000).toISOString()})};
 const providers={content:{screen:async input=>{contentCalls++;if(providerFails)throw Error('private provider diagnostic');return pass.screen(input);}},images:pass,legal:pass};
 const result=await screenModerationCase({rpc:async(name,args)=>{calls.push({name,args});if(name==='moderation_screening_context')return{data:{caseId:fixtureId,version,revision:'a'.repeat(64),policyId:fixtureId,policyVersion:'synthetic-policy-1',text,kind:'product',classification:'ordinary',requiresCredentials:false,images:[{path:'synthetic.jpg',storageVersion:'b'.repeat(64)}]}};return name==='moderation_attest'?{data:{version:++version}}:{data:{caseId:fixtureId,version:++version,published:false,outcome:'approved'}};}},fixtureId,{providers,textRules,attemptAutomaticApproval:true});
 return{result,calls,contentCalls};
}
test('suspicious Hindi and restricted matches require human review and prevent provider/approval bypass',async()=>{
 for(const text of ['यह संदिग्ध प्रस्ताव है','SYNTHETIC RESTRICTED offer']){const f=await screening(text);assert.equal(f.contentCalls,0);assert.equal(f.result.checks[0].status,'uncertain');assert.equal(f.calls.find(c=>c.name==='moderation_attest').args.p_status,'uncertain');assert.ok(!f.calls.some(c=>c.name==='moderation_auto_approve'));assert.ok(!JSON.stringify(f.result).includes(text));}
});
test('prohibited matches fail; missing/mismatched rule policy cannot certify content',async()=>{
 const blocked=await screening('Synthetic prohibited offer');assert.equal(blocked.result.checks[0].status,'failed');
 for(const config of [{...rules,policyVersion:'different'},null,{policyVersion:'synthetic-policy-1'}]){const f=await screening('ordinary text',config);assert.equal(f.result.checks[0].status,'unavailable');assert.equal(f.contentCalls,0);}
});
test('clean configured text still requires trusted provider success and never overrides failures',async()=>{
 const clean=await screening('Ordinary synthetic product');assert.equal(clean.contentCalls,1);assert.equal(clean.result.automaticApproval.published,false);
 const failed=await screening('Ordinary synthetic product',rules,{providerFails:true});assert.equal(failed.result.checks[0].status,'unavailable');assert.ok(!failed.calls.some(c=>c.name==='moderation_auto_approve'));assert.ok(!JSON.stringify(failed).includes('private provider diagnostic'));
});
test('escalation requires authenticated reviewer metadata and current database reviewer permission',async()=>{
 const command={action:'escalate',caseId:fixtureId,version:4,requestId:fixtureId,reasons:['SUSPICIOUS_CONTENT'],note:'Synthetic only'};
 const request=()=>({request:new Request('http://localhost:4321/api/moderation',{method:'POST',headers:{origin:'http://localhost:4321','content-type':'application/json'},body:JSON.stringify(command)}),cookies:{}});
 for(const admin of [false,true]){let calls=0;const route=createModerationRoutes(async()=>({state:'authenticated',user:{app_metadata:{vetit_admin:admin},user_metadata:{vetit_admin:true}},supabase:{rpc:async(name,args)=>{calls++;assert.equal(name,'moderation_decide');assert.equal(args.p_request,fixtureId);assert.deepEqual(args.p_reasons,['SUSPICIOUS_CONTENT']);return{error:{code:'42501',message:'private reviewer diagnostic'}};}}}));const response=await route.POST(request());assert.equal(response.status,403);assert.equal(calls,admin?1:0);assert.ok(!(await response.text()).includes('diagnostic'));}
});
