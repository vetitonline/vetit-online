import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSubmission, INDIA_POLICY, screenContent, evaluateTextRules, validateSellerApplication} from '../src/lib/moderation/policy.js';
import {loadReviewQueue, queueFilters} from '../src/lib/moderation/queue.js';
const configured = {...INDIA_POLICY,automaticApproval:true};
test('seller application reuses business validation and requires explicit duplicate/category checks',()=>{
  const input={profileName:'Synthetic owner',country:'IN',display_name:'Synthetic business',business_type:'company',public_email:'synthetic@example.invalid'};
  assert.equal(validateSellerApplication(input).status,'failed');
  assert.deepEqual(validateSellerApplication(input,{duplicateStatus:'passed',categoryEligible:true}),{status:'passed',reasons:[]});
  for (const change of [{profileName:''},{display_name:'x'},{country:'US'},{business_type:'unrecognized'},{public_email:'invalid'},{public_email:'',public_phone:''}]) assert.equal(validateSellerApplication({...input,...change},{duplicateStatus:'passed',categoryEligible:true}).status,'failed');
});
test('configured deterministic text rules normalize case, punctuation and Hindi without returning text',()=>{
  const rules={prohibited:['synthetic prohibited'],restricted:['परीक्षण प्रतिबंधित'],suspicious:['guaranteed cure']};
  assert.deepEqual(evaluateTextRules('SYNTHETIC--PROHIBITED',rules),{status:'failed',reasons:['TEXT_PROHIBITED']});
  assert.deepEqual(evaluateTextRules('परीक्षण प्रतिबंधित',rules),{status:'failed',reasons:['TEXT_RESTRICTED']});
  assert.equal(evaluateTextRules('notguaranteed cure',rules).status,'passed');
  assert.equal(evaluateTextRules('GUARANTEED CURE',rules).status,'failed');
  assert.equal(evaluateTextRules('plain text').status,'unavailable');
});
const fixture = (type='product') => ({type,revision:'synthetic-v1',market:'IN',country:'IN',categoryClass:'ordinary',categoryAllowsAutomaticApproval:true,prohibited:false,suspicious:false,currency:'INR',priceMinor:100,
  checks:Object.fromEntries(['profile','business','ownership','category','duplicate','content','species','attributes','sellerVerification','professionalVerification'].map(name=>[name,{status:'passed',revision:'synthetic-v1'}])),
  images:[{status:'passed',revision:'synthetic-v1',contentHash:'synthetic-image-hash'}]});
for (const type of ['seller','product','service']) test(`${type}: complete ordinary checks qualify but never grant publication`,()=>{
  const result=assessSubmission(fixture(type),configured); assert.equal(result.outcome,'eligible');assert.equal(result.canPublish,false);assert.deepEqual(result.reasons,[]);
});
test('default policy disables automatic approval',()=>assert.ok(assessSubmission(fixture()).reasons.includes('AUTOMATIC_APPROVAL_DISABLED')));
for(const name of ['profile','business','ownership','category','duplicate','content','species','attributes','sellerVerification']) test(`mandatory ${name} unavailable requires review`,()=>{
  const input=fixture();delete input.checks[name];assert.equal(assessSubmission(input,configured).outcome,'review');
});
test('stale evidence is not accepted after seller correction',()=>{
  const input=fixture();input.revision='synthetic-v2';const result=assessSubmission(input,configured);assert.equal(result.outcome,'review');assert.ok(result.reasons.includes('IMAGE_NOT_SCREENED'));
});
test('prohibited wins over uncertainty',()=>{const input=fixture();input.prohibited=true;input.checks={};assert.equal(assessSubmission(input,configured).outcome,'blocked');});
for(const category of ['veterinary','live_animal','regulated']) test(`${category} always requires human review even with verification`,()=>{
  const input=fixture();input.categoryClass=category;assert.equal(assessSubmission(input,configured).risk,'high');assert.equal(assessSubmission(input,configured).outcome,'review');
});
test('unknown category, duplicate, suspicious text and unsupported market fail closed',()=>{
  const input=fixture();input.categoryClass='unclassified';input.checks.duplicate.status='failed';input.suspicious=true;input.market='US';const result=assessSubmission(input,configured);assert.equal(result.outcome,'review');assert.ok(result.reasons.includes('DUPLICATE_NOT_PASSED'));assert.ok(result.reasons.includes('MARKET_NOT_ELIGIBLE'));
});
test('unscreened, failed and duplicated images cannot qualify',()=>{
  for(const status of ['unavailable','failed','uncertain']) {const input=fixture();input.images[0].status=status;assert.equal(assessSubmission(input,configured).outcome,'review');}
  const input=fixture();input.images.push(input.images[0]);assert.equal(assessSubmission(input,configured).outcome,'review');
});
test('invalid price and currency cannot qualify',()=>{for(const priceMinor of [0,-1,1.5,NaN,Number.MAX_SAFE_INTEGER+1]){const input=fixture();input.priceMinor=priceMinor;assert.equal(assessSubmission(input,configured).outcome,'review');}});
test('missing, throwing, stale or slow provider never passes',async()=>{
  const input={revision:'synthetic-v1'};
  for(const provider of [undefined,{screen:async()=>{throw Error('private provider detail');}},{screen:async()=>({status:'passed',revision:'old'})},{screen:()=>new Promise(()=>{})}]) assert.equal((await screenContent(input,{provider,timeoutMs:2})).status,'unavailable');
});
test('provider returns only normalized evidence, no raw diagnostics',async()=>{
  assert.deepEqual(await screenContent({revision:'v1'},{provider:{screen:async()=>({status:'failed',revision:'v1',private:'discard'})}}),{status:'failed',revision:'v1'});
});
test('queue rejects invalid filters and unsupported risk claims',()=>{
  for(const q of ['status=appealed','kind=unknown','market=us','category=bad','before=2026-10-19','risk=low']) assert.throws(()=>queueFilters(new URLSearchParams(q)));
  assert.equal(queueFilters(new URLSearchParams()).p_limit,25);
});
test('seller, business-admin and editable user metadata never invoke queue RPC',async()=>{
  let calls=0; const client={rpc:()=>{calls++;}};
  for(const user of [null,{app_metadata:{}},{user_metadata:{vetit_reviewer:true}},{app_metadata:{business_admin:true}}]) await assert.rejects(loadReviewQueue(client,user,new URLSearchParams()),e=>e.status===403);
  assert.equal(calls,0);
});
test('queue errors redact database details and do not simulate empty success',async()=>{
  await assert.rejects(loadReviewQueue({rpc:async()=>({error:{code:'42883',message:'internal details'}})},{app_metadata:{vetit_reviewer:true}},new URLSearchParams()),e=>e.status===503 && !e.message.includes('internal'));
  await assert.rejects(loadReviewQueue({rpc:async()=>({data:{items:[],hasMore:'no'}})},{app_metadata:{vetit_reviewer:true}},new URLSearchParams()));
  assert.deepEqual(await loadReviewQueue({rpc:async()=>({data:{items:[],hasMore:false}})},{app_metadata:{vetit_reviewer:true}},new URLSearchParams()),{items:[],hasMore:false});
});
