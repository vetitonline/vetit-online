import test from 'node:test';
import assert from 'node:assert/strict';
import {mountNativeComponent,drainNativeTasks} from './native-component-harness.mjs';
const id='10000000-0000-4000-8000-000000000001';
test('actual native sign-in handlers prevent two taps before state commits',async()=>{
 let calls=0,finish;const auth={requestEmailOtp:()=>{calls++;return new Promise(resolve=>{finish=resolve;});},verifyEmailOtp:async()=>{}};
 const ui=mountNativeComponent('NativeSignIn.tsx','NativeSignIn',{auth,session:{refresh:async()=>{}},language:'en'});ui.input('Email','test@example.invalid');const button=ui.button('Send email code');button.props.onPress();button.props.onPress();assert.equal(calls,1);ui.render();assert.equal(ui.button('Send email code').props.disabled,true);finish();await drainNativeTasks();ui.render();assert.equal(ui.button('Send email code').props.disabled,false);assert.ok(ui.button('Verify code'));ui.unmount();
});
test('detached sign-in UI does not initiate session verification after OTP completion',async()=>{
 let finish,refreshes=0;const auth={requestEmailOtp:async()=>{},verifyEmailOtp:()=>new Promise(resolve=>{finish=resolve;})};const ui=mountNativeComponent('NativeSignIn.tsx','NativeSignIn',{auth,session:{refresh:async()=>{refreshes++;}}});ui.input('Email','test@example.invalid');ui.button('Send email code').props.onPress();await drainNativeTasks();ui.render();ui.input('Verification code','123456');const code=ui.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel==='Verification code');assert.equal(code.props.secureTextEntry,true);ui.button('Verify code').props.onPress();ui.unmount();finish();await drainNativeTasks();assert.equal(refreshes,0);
});
test('Hindi sign-in errors hide provider diagnostics and keep verification code transient',async()=>{
 const ui=mountNativeComponent('NativeSignIn.tsx','NativeSignIn',{auth:{requestEmailOtp:async()=>{throw Error('private provider diagnostic');}},session:{refresh:async()=>{}},language:'hi'});ui.input('ईमेल','test@example.invalid');ui.button('ईमेल कोड भेजें').props.onPress();await drainNativeTasks();ui.render();assert.match(ui.text(),/साइन इन नहीं हुआ/);assert.ok(!ui.text().includes('diagnostic'));assert.equal(ui.button('ईमेल कोड भेजें').props.disabled,false);ui.unmount();
});
function moderationProps(data,reviewer=true){return{client:{status:async()=>data,command:async()=>{throw Error('No write expected');}},getSession:async()=>({userId:id,accessToken:'synthetic-only'}),sessionUserId:id,requestId:()=>id,kind:'product',subject:id,reviewer};}
test('native effect replay coalesces status reads and never exposes manual approval for automatically approved cases',async()=>{
 let reads=0,finish;const data={case:{caseId:id,version:2,state:'eligible',reasons:[],correction:'',automaticApproval:{status:'approved',publicationEnabled:false,approvedAt:new Date().toISOString(),validUntil:new Date(Date.now()+60000).toISOString()}},events:[]};const props=moderationProps(data);props.client.status=()=>{reads++;return new Promise(resolve=>{finish=resolve;});};const ui=mountNativeComponent('ModerationWorkspace.tsx','ModerationWorkspace',props);ui.replayEffects();await drainNativeTasks();assert.equal(reads,1);finish(data);await drainNativeTasks();ui.render();assert.match(ui.text(),/publication pending/);assert.equal(ui.button('Approve / publish'),undefined);assert.equal(ui.button('Refresh').props.disabled,false);ui.unmount();
});
test('flagged cases expose review actions only in reviewer UI; seller status remains readable',async()=>{
 const data={case:{caseId:id,version:2,state:'screened',reasons:['CONTENT_NOT_PASSED'],correction:'',automaticApproval:{status:'not_approved',publicationEnabled:false}},events:[]};for(const reviewer of [false,true]){const ui=mountNativeComponent('ModerationWorkspace.tsx','ModerationWorkspace',moderationProps(data,reviewer));await drainNativeTasks();ui.render();assert.match(ui.text(),/CONTENT_NOT_PASSED/);assert.equal(Boolean(ui.button('Escalate')),reviewer);assert.equal(Boolean(ui.button('Request corrections')),reviewer);assert.match(ui.text(),/Automatic publication is disabled/);ui.unmount();}
});
