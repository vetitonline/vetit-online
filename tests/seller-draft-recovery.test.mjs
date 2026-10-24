// Actual component browser script, synthetic DOM/storage/fetch only. No browser,
// hosted upload, deletion or database operation is performed by this harness.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as sellerValidation from '../src/lib/seller/validation.js';
import {validateSellerImageSelection} from '../src/lib/seller/image-selection.js';
const id='10000000-0000-4000-8000-000000000001';
class Element{
 constructor(){this.disabled=false;this.dataset={};this.children=[];this.listeners={};this.classList={add(){},remove(){},toggle(){}};this.value='';}
 set textContent(value){this.text=value;this.children=[];}get textContent(){return this.text??'';}
 addEventListener(name,callback){this.listeners[name]=callback;}append(...children){this.children.push(...children);}
}
function mount({fetchImpl,upload=async()=>({error:null}),files=[{type:'image/png',size:100,name:'synthetic.png'}],fields={}}={}){
 const button=new Element(),status=new Element(),images=new Element(),form=new Element();images.files=files;images.dataset.maxImages='5';form.action='http://localhost:4321/api/seller/product';
 let listingField=null,deletes=0,fieldIssue=null;const navigations=[];
 form.querySelector=selector=>({'[data-product-images]':images,'[data-image-status]':status,'button[type="submit"]':button,'input[name="species_ids"]:checked':{checked:true},'input[name="listing_id"]':listingField,'[data-seller-category]':{options:[{value:id,dataset:{species:id}}]}})[selector]??null;
 form.append=element=>{listingField=element;};
 class SyntheticFormData extends FormData{constructor(){super();for(const [key,value] of Object.entries({title:'Synthetic draft',business_id:id,category_id:id,species_ids:id,base_amount_minor:'100',...fields}))this.set(key,value);if(listingField)this.set('listing_id',listingField.value);}}
 const document={querySelector:selector=>selector==='[data-seller-product-form]'?form:null,createElement:()=>new Element()};
 const window={addEventListener(){},location:{assign:url=>navigations.push(url)}};
 const source=fs.readFileSync(new URL('../src/components/seller/SellerProductForm.astro',import.meta.url),'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
 const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const modules={'../../lib/supabase/browser':{createSupabaseBrowserClient:()=>({storage:{from:()=>({upload,remove:async()=>{deletes++;}})}})},'../../lib/seller/image-selection.js':{validateSellerImageSelection},'../../lib/seller/validation.js':sellerValidation,'../../lib/seller/field-feedback.js':{clearSellerFieldFeedback:()=>{fieldIssue=null;},showSellerFieldFeedback:(_form,issue)=>{fieldIssue=issue;return Boolean(issue);}}};
 new Function('require','exports','document','window','fetch','FormData',compiled)(name=>{if(!(name in modules))throw Error('Unexpected dependency');return modules[name];},{},document,window,fetchImpl,SyntheticFormData);
 return{button,status,navigations,fieldIssue:()=>fieldIssue,deletes:()=>deletes,listingField:()=>listingField,submit:()=>form.listeners.submit({preventDefault(){}})};
}
test('a confirmed draft survives thrown upload failure without a second save or automatic cleanup',async()=>{
 let saves=0;const ui=mount({fetchImpl:async url=>url.includes('image-reservation')?new Response(JSON.stringify({imageId:id,path:`${id}/${id}/${id}.png`})):(saves++,new Response(JSON.stringify({listingId:id}))),upload:async()=>{throw Error('private upload diagnostic');}});
 await ui.submit();assert.equal(ui.listingField().value,id);assert.equal(ui.button.disabled,true);assert.match(ui.status.textContent,/Draft saved/);assert.ok(!ui.status.textContent.includes('private'));const link=ui.status.children.find(c=>typeof c!=='string');assert.equal(link.href,`/seller/products/${id}?images=unavailable`);await ui.submit();assert.equal(saves,1);assert.equal(ui.deletes(),0);
});
test('web shared field validation retains entered values and selected photos without starting a request',async()=>{
 let calls=0;const fields={title:'x'};const ui=mount({fields,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({listingId:id}));}});
 await ui.submit();assert.equal(ui.fieldIssue().field,'title');assert.equal(fields.title,'x');assert.equal(calls,0);assert.equal(ui.button.disabled,false);
 fields.title='Corrected draft';await ui.submit();assert.ok(calls>0);assert.equal(ui.fieldIssue(),null);
});
test('fresh server field rejection is displayed without redirecting or clearing the web draft',async()=>{
 const issue={field:'category_id',message:'That category is not available for seller listings.'};const ui=mount({files:[],fetchImpl:async()=>Response.json({fieldIssue:issue},{status:422})});
 await ui.submit();assert.deepEqual(ui.fieldIssue(),issue);assert.equal(ui.button.disabled,false);assert.deepEqual(ui.navigations,[]);assert.equal(ui.deletes(),0);
});
test('uncertain save responses lock retry and preserve a draft-inspection route',async()=>{
 for(const response of [()=>{throw Error('network diagnostic');},()=>new Response('{}',{status:503}),()=>new Response(JSON.stringify({listingId:'invalid'}))]){let calls=0;const ui=mount({files:[],fetchImpl:async()=>{calls++;return response();}});await ui.submit();await ui.submit();assert.equal(calls,1);assert.equal(ui.button.disabled,true);assert.match(ui.status.textContent,/confirmation unavailable/);assert.equal(ui.status.children.find(c=>typeof c!=='string').href,'/seller');}
});
test('validation rejection permits correction; revision conflict locks retry and retains selected photos for review',async()=>{
 let calls=0;const ui=mount({files:[],fetchImpl:async()=>++calls===1?new Response('{}',{status:422}):new Response(JSON.stringify({listingId:id}))});await ui.submit();assert.equal(ui.button.disabled,false);await ui.submit();assert.equal(calls,2);assert.equal(ui.navigations[0],`/seller/products/${id}?saved=1`);
 let conflicts=0;const stale=mount({fetchImpl:async()=>{conflicts++;return new Response('{}',{status:409});}});await stale.submit();await stale.submit();assert.equal(conflicts,1);assert.equal(stale.button.disabled,true);assert.match(stale.status.textContent,/fields and selected photos are retained/);assert.deepEqual(stale.navigations,[]);
});
test('double submit and failed upload responses preserve existing objects and reservations',async()=>{
 let finish,started,saves=0;const ready=new Promise(resolve=>{started=resolve;});const ui=mount({fetchImpl:async url=>{if(url.includes('image-reservation'))return new Response(JSON.stringify({imageId:id,path:`${id}/${id}/${id}.png`}));saves++;started();return new Promise(resolve=>{finish=resolve;});},upload:async()=>({error:Error('unconfirmed')})});
 const pending=ui.submit();await ready;await ui.submit();finish(new Response(JSON.stringify({listingId:id})));await pending;assert.equal(saves,1);assert.equal(ui.deletes(),0);assert.match(ui.navigations[0],/images=unavailable/);
});
test('validated photo paths upload with replacement disabled; forged reservation paths preserve the saved draft and never upload',async()=>{for(const valid of [true,false]){let uploads=0;const ui=mount({fetchImpl:async url=>new Response(JSON.stringify(url.includes('image-reservation')?{imageId:id,path:valid?`${id}/${id}/${id}.png`:`${id}/${id}/../foreign.png`}:{listingId:id})),upload:async(path,_file,options)=>{uploads++;assert.equal(path,`${id}/${id}/${id}.png`);assert.equal(options.upsert,false);return{error:null};}});await ui.submit();assert.equal(uploads,valid?1:0);assert.equal(ui.listingField().value,id);assert.equal(ui.deletes(),0);if(valid)assert.equal(ui.navigations[0],`/seller/products/${id}?saved=1`);else{assert.equal(ui.button.disabled,true);assert.match(ui.status.textContent,/Draft saved/);}}});
