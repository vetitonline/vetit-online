import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createDevicePreviewHandler} from '../scripts/device-preview-fixtures.mjs';
import {createDeviceAcceptanceRecord,assessDeviceAcceptance,parseDeviceAcceptanceRecord,DEVICE_CASES} from '../scripts/device-acceptance.mjs';
import {fetchCatalog} from '../src/lib/marketplace/catalog-client.js';
import {requestServices} from '../src/lib/services/service-client.js';
import {requestAppointmentSlots} from '../src/lib/services/appointment-client.js';
const commit='a'.repeat(40),id=n=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const handler=createDevicePreviewHandler();
const fixtureFetch=(url,options)=>Promise.resolve(handler(new Request(url,options)));
test('phone fixture catalogue and service responses use real shared clients without any hosted access',async()=>{
 const catalog=await fetchCatalog({},{baseUrl:'http://local.invalid',fetchImpl:fixtureFetch});assert.equal(catalog.products.length,1);assert.match(catalog.products[0].title,/Synthetic/);assert.equal(catalog.products[0].imageUrl,null);
 const empty=await fetchCatalog({query:'missing'},{baseUrl:'http://local.invalid',fetchImpl:fixtureFetch});assert.equal(empty.products.length,0);
 const services=await requestServices({baseUrl:'http://local.invalid',fetchImpl:fixtureFetch});assert.equal(services.services.length,3);const slots=await requestAppointmentSlots({baseUrl:'http://local.invalid',serviceListingId:id(10),fetchImpl:fixtureFetch});assert.equal(slots.slots.length,1);
 const health=await handler(new Request('http://local.invalid/__device/health')).json();assert.equal(health.fixtureOnly,true);assert.equal(health.databaseAccess,false);assert.equal(health.providerAccess,false);assert.equal(health.mutationsEnabled,false);
});
test('fixtures reject all writes, credentials and private APIs rather than simulating sign-in success',()=>{
 for(const path of ['/api/appointments','/api/checkout/orders','/api/catalog'])assert.equal(handler(new Request('http://local.invalid'+path,{method:'POST',body:'{}'})).status,405);
 for(const headers of [{authorization:'Bearer synthetic'},{cookie:'synthetic=1'}])assert.equal(handler(new Request('http://local.invalid/api/catalog',{headers})).status,403);
 assert.equal(handler(new Request('http://local.invalid/api/appointments')).status,401);
});
test('fixture HTTP transport is usable on a local socket without external network dependencies',async()=>{
 const server=createServer(async(req,res)=>{const response=handler(new Request('http://local.invalid'+req.url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const health=await fetch(`http://127.0.0.1:${server.address().port}/__device/health`).then(response=>response.json());assert.equal(health.fixtureOnly,true);}finally{await new Promise(resolve=>server.close(resolve));}
});
test('empty evidence stays incomplete and loopback cannot be declared as a phone backend',()=>{
 const record=createDeviceAcceptanceRecord(commit);record.apiOrigin=record.testApiOrigin='http://localhost:4324';const report=assessDeviceAcceptance(record);assert.equal(report.declaredEvidenceComplete,false);assert.ok(report.blockers.includes('PHONE_CANNOT_USE_COMPUTER_LOOPBACK'));assert.equal(report.productionApprovalGranted,false);
});
function filled(){const record=createDeviceAcceptanceRecord(commit);record.apiOrigin=record.testApiOrigin='https://synthetic.invalid';record.hostedApprovalReference='synthetic-review-reference';record.nativeHostConfigured=true;for(const device of record.devices){Object.assign(device,{model:'Synthetic physical device',osVersion:'Synthetic OS',physicalDevice:true,buildKind:'signed-internal',buildCommit:commit});for(const item of device.cases){item.status='pass';item.evidenceReference='synthetic-local-evidence';}}return record;}
test('complete declarations still cannot verify physical devices or authorize submission',()=>{
 const record=filled();const result=assessDeviceAcceptance(record);assert.equal(result.declaredEvidenceComplete,true);assert.equal(result.deviceResultsIndependentlyVerified,false);assert.equal(result.hostedExecutionAuthorized,false);assert.equal(result.storeSubmissionAuthorized,false);
});
test('preview results cannot stand in for authenticated native acceptance or signed install evidence',()=>{
 const record=filled();for(const device of record.devices)device.buildKind='preview';const report=assessDeviceAcceptance(record);assert.equal(report.declaredEvidenceComplete,false);assert.ok(report.blockers.includes('IOS_AUTHENTICATED_ACCEPTANCE_PREREQUISITES_REQUIRED'));assert.ok(report.blockers.includes('ANDROID_SIGNED_INSTALL_EVIDENCE_REQUIRED'));
});
test('mismatched commits, missing evidence, duplicate cases and production origins cannot pass',()=>{
 const record=filled();record.devices[0].buildCommit='b'.repeat(40);record.devices[1].cases[0].evidenceReference='';record.apiOrigin=record.testApiOrigin='https://vetit.online';const report=assessDeviceAcceptance(record);assert.equal(report.declaredEvidenceComplete,false);assert.ok(report.blockers.includes('EXPLICIT_TEST_ORIGIN_REQUIRED'));assert.ok(report.blockers.includes('ANDROID_BUILD_COMMIT_MISMATCH'));
 const duplicate=filled();duplicate.devices[0].cases[1].id=DEVICE_CASES[0];assert.throws(()=>assessDeviceAcceptance(duplicate));
});

test('PowerShell UTF-8 BOM records are accepted without reflecting malformed contents',()=>{
 const record=createDeviceAcceptanceRecord(commit);assert.deepEqual(parseDeviceAcceptanceRecord('\uFEFF'+JSON.stringify(record)),record);assert.throws(()=>parseDeviceAcceptanceRecord('{SYNTHETIC_PRIVATE_VALUE'),error=>!error.message.includes('SYNTHETIC_PRIVATE_VALUE'));
});
