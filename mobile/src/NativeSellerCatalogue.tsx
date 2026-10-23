import React,{useEffect,useRef,useState} from 'react';
import {AppState,Linking,Pressable,Text,TextInput,View} from 'react-native';
import {createNativeSellerCatalogue,filterNativeSellerCatalogue,type SellerCatalogueState,type SellerCatalogueAction} from './seller-catalogue.js';
import {sellerCatalogueCopy} from '../../src/lib/seller/catalogue-copy.js';
import {resolveMobileApiBase} from '../../src/lib/supabase/test-endpoints.js';
import type {CatalogueFields} from '../../src/lib/seller/catalogue-contract.js';
import type {NativeModerationSession} from './moderation-session.js';
const blankFields=():CatalogueFields=>({title:'',description:'',category_id:'',base_amount_minor:'',species_ids:[],variant_sku:[],variant_name:[],variant_value:[],variant_amount_minor:[]});
const blankView:SellerCatalogueState={phase:'idle',businesses:[],animals:[],categories:[],products:[]};
const idle:SellerCatalogueAction={phase:'idle',command:null};
export function NativeSellerCatalogue({session,apiBaseUrl,testApiOrigin,language='en'}:{session:NativeModerationSession;apiBaseUrl:string;testApiOrigin:string;language?:string}){
 const copy=sellerCatalogueCopy(language),sourceKey=apiBaseUrl+'|'+testApiOrigin;
 const initial=()=>({source:session,sourceKey,view:blankView,action:idle,businessId:'',listingId:null as string|null,revision:undefined as string|undefined,fields:blankFields(),dirty:false,editing:false,filters:{query:'',status:'',business:''}});
 const [saved,setSaved]=useState(initial);
 const state=saved.source===session&&saved.sourceKey===sourceKey?saved:initial();
 const host=useRef<ReturnType<typeof createNativeSellerCatalogue>|null>(null);
 useEffect(()=>{let active=true;setSaved(initial());const controller=createNativeSellerCatalogue({session,apiBaseUrl,testApiOrigin,render:view=>{if(active)setSaved(s=>view.phase==='signin'?{...initial(),view}:{...s,source:session,sourceKey,view});},renderAction:action=>{if(active)setSaved(s=>({...s,source:session,sourceKey,action,...(action.phase==='success'?{dirty:false,editing:false,fields:blankFields(),listingId:null,revision:undefined}:{})}));}});host.current=controller;void controller.load();const listener=AppState.addEventListener('change',value=>{if(value==='active')void controller.load();else controller.clear();});return()=>{active=false;listener.remove();controller.dispose();if(host.current===controller)host.current=null;};},[session,apiBaseUrl,testApiOrigin]);
 const {view,action,fields}=state,busy=!['idle','success','invalid'].includes(action.phase),disabled=busy||view.phase!=='ready';
 const button=(label:string,run:()=>void,force=false)=><Pressable accessibilityRole="button" disabled={force?action.phase==='saving':disabled} onPress={run}><Text>{label}</Text></Pressable>;
 const currentProduct=view.products.find(p=>p.id===state.listingId&&p.businessId===state.businessId);
 const selectionCurrent=view.businesses.some(b=>b.id===state.businessId)&&(!state.listingId||!!currentProduct?.editable&&currentProduct.revision===state.revision);
 const editorButton=(label:string,run:()=>void)=>selectionCurrent?button(label,run):<Pressable accessibilityRole="button" disabled><Text>{label}</Text></Pressable>;
 const change=(key:keyof CatalogueFields,value:string|string[])=>setSaved(s=>({...s,fields:{...s.fields,[key]:value},dirty:true}));
 const input=(label:string,key:keyof CatalogueFields,value:string,onChange=(text:string)=>change(key,text))=><View><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} editable={!disabled&&selectionCurrent} onChangeText={onChange} autoCapitalize="none" multiline={key==='description'} maxLength={key==='description'?5000:key==='title'?160:120}/></View>;
 const choose=(businessId:string,product?:SellerCatalogueState['products'][number])=>{if(state.dirty)return;setSaved(s=>({...s,businessId,listingId:product?.id??null,revision:product?.revision,fields:product?JSON.parse(JSON.stringify(product.fields)):blankFields(),editing:true,dirty:false}));};
 const openOnline=(path:string)=>{const origin=resolveMobileApiBase(apiBaseUrl,testApiOrigin);void Linking.openURL(new URL(path,origin).toString()).catch(()=>undefined);};
 const variantKeys=['variant_sku','variant_name','variant_value','variant_amount_minor'] as const;
 const selectedCategory=view.categories.find(c=>c.id===fields.category_id);
 const visibleProducts=filterNativeSellerCatalogue(view.products,view.categories,state.filters);
 const filtersLocked=busy||state.editing||view.phase!=='ready';
 const filterButton=(label:string,selected:boolean,run:()=>void)=><Pressable accessibilityRole="button" accessibilityState={{selected,disabled:filtersLocked}} disabled={filtersLocked} onPress={run}><Text>{selected?'✓ ':''}{label}</Text></Pressable>;
 const setFilter=(key:'query'|'status'|'business',value:string)=>{if(!filtersLocked)setSaved(s=>({...s,filters:{...s.filters,[key]:value}}));};
 return <View style={{gap:12}}><Text accessibilityRole="header">{copy.title}</Text><Text>{copy.intro}</Text>
 {view.phase==='loading'&&<Text accessibilityLiveRegion="polite">{copy.loading}</Text>}{view.phase==='signin'&&<Text>{copy.signin}</Text>}{view.phase==='error'&&<Text accessibilityRole="alert">{copy.error}</Text>}
 {view.phase==='ready'&&!view.businesses.length&&<Text>{copy.empty}</Text>}
 <Pressable accessibilityRole="button" disabled={busy||state.dirty} onPress={()=>openOnline('/seller/onboarding')}><Text>{copy.online}</Text></Pressable>
 {view.phase==='ready'&&view.businesses.length>0&&<View style={{gap:8}}>
 <Text accessibilityRole="header">{copy.search}</Text><TextInput accessibilityLabel={copy.search} value={state.filters.query} maxLength={160} editable={!filtersLocked} onChangeText={value=>setFilter('query',value)}/>
 <Text>{copy.filterHelp}</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{filterButton(copy.allStatuses,!state.filters.status,()=>setFilter('status',''))}{(['draft','submitted','published','rejected'] as const).map(status=><View key={status}>{filterButton(copy.statusLabels[status],state.filters.status===status,()=>setFilter('status',status))}</View>)}</View>
 <View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{filterButton(copy.allBusinesses,!state.filters.business,()=>setFilter('business',''))}{view.businesses.map(b=><View key={b.id}>{filterButton(b.name,state.filters.business===b.id,()=>setFilter('business',b.id))}</View>)}</View>
 {filterButton(copy.clearFilters,false,()=>{if(!filtersLocked)setSaved(s=>({...s,filters:{query:'',status:'',business:''}}));})}
 <Text accessibilityLiveRegion="polite">{copy.results(visibleProducts.length,view.products.length)}</Text>{!visibleProducts.length&&<Text>{copy.noMatches}</Text>}
 </View>}
 {view.businesses.filter(b=>!state.filters.business||state.filters.business===b.id).map(b=><View key={b.id}><Text accessibilityRole="header">{b.name}</Text>{button(copy.new+': '+b.name,()=>choose(b.id))}{visibleProducts.filter(p=>p.businessId===b.id).map(p=><View key={p.id}><Text>{p.fields.title} · {p.status} · {p.imageCount}/5 photos</Text>{p.editable?button(copy.edit+': '+p.fields.title,()=>choose(b.id,p)):<Text>{copy.readonly}</Text>}{button(copy.photos+': '+p.fields.title,()=>{if(!state.dirty)openOnline('/seller/products/'+p.id);})}</View>)}</View>)}
 {(state.dirty||(state.editing&&view.phase==='ready'&&!selectionCurrent))&&<View>{state.dirty&&<Text>{copy.dirty}</Text>}{button(copy.discard,()=>setSaved(s=>({...s,editing:false,dirty:false,fields:blankFields(),listingId:null,revision:undefined})))}</View>}
 {state.editing&&view.phase==='ready'&&<View style={{gap:10}}>
 {!selectionCurrent&&<Text accessibilityRole="alert">{copy.staleEditor}</Text>}
 {input(copy.name,'title',fields.title)}{input(copy.description,'description',fields.description)}
 <Text accessibilityRole="header">{copy.categories}</Text>{view.categories.map(c=><View key={c.id}>{editorButton(`${fields.category_id===c.id?'✓ ':''}${c.label}`,()=>{change('category_id',c.id);change('species_ids',fields.species_ids.filter(id=>view.animals.some(a=>a.id===id)&&(!c.species.length||c.species.includes(id))));})}</View>)}
 {(!selectedCategory||fields.species_ids.some(id=>!view.animals.some(a=>a.id===id)||!!selectedCategory.species.length&&!selectedCategory.species.includes(id)))&&<Text accessibilityRole="alert">{copy.missingCategory}</Text>}
 <Text accessibilityRole="header">{copy.species}</Text>{selectedCategory&&view.animals.filter(a=>!selectedCategory.species.length||selectedCategory.species.includes(a.id)).map(a=><View key={a.id}>{editorButton(`${fields.species_ids.includes(a.id)?'✓ ':''}${a.label}`,()=>change('species_ids',fields.species_ids.includes(a.id)?fields.species_ids.filter(id=>id!==a.id):[...fields.species_ids,a.id]))}</View>)}
 <Text>{copy.pricing}</Text>{input(copy.price,'base_amount_minor',fields.base_amount_minor)}
 {fields.variant_sku.map((_sku,index)=><View key={index}>{variantKeys.map((key,k)=><View key={key}>{input(`${[copy.sku,copy.option,copy.value,copy.variantPrice][k]} ${index+1}`,key,fields[key][index]??'',text=>change(key,fields[key].map((v,i)=>i===index?text:v)))}</View>)}{editorButton(`${copy.remove} ${index+1}`,()=>setSaved(s=>({...s,dirty:true,fields:{...s.fields,...Object.fromEntries(variantKeys.map(key=>[key,s.fields[key].filter((_,i)=>i!==index)]))}})))}</View>)}
 {fields.variant_sku.length<20&&editorButton(copy.add,()=>setSaved(s=>({...s,dirty:true,fields:{...s.fields,...Object.fromEntries(variantKeys.map(key=>[key,[...s.fields[key],'']]))}})))}
 <Text>{copy.photoHelp}</Text>{state.listingId&&editorButton(copy.photos,()=>{if(!state.dirty)openOnline('/seller/products/'+state.listingId);})}
 {editorButton(copy.save,()=>host.current?.prepare({action:'save',businessId:state.businessId,listingId:state.listingId,expectedRevision:state.revision,fields}))}
 {state.listingId&&!state.dirty&&editorButton(copy.submit,()=>host.current?.prepare({action:'submit',businessId:state.businessId,listingId:state.listingId,expectedRevision:state.revision}))}<Text>{copy.submitHelp}</Text>
 </View>}
 {action.phase==='confirm'&&<View><Text accessibilityRole="header">{copy.question}</Text><Text>{action.command?.action==='submit'?copy.submit:copy.save}</Text><Text>{action.command?.fields?.title??view.products.find(p=>p.id===action.command?.listingId)?.fields.title}</Text>{action.command?.fields&&<Text selectable>{JSON.stringify(action.command.fields,null,2)}</Text>}{button(copy.apply,()=>void host.current?.confirm(),true)}{button(copy.back,()=>host.current?.cancel(),true)}</View>}
 {['invalid','saving','success','uncertain','rejected'].includes(action.phase)&&<Text accessibilityLiveRegion="polite">{copy[action.phase as 'invalid'|'saving'|'success'|'uncertain'|'rejected']}</Text>}
 {['uncertain','rejected'].includes(action.phase)&&button(copy.check,()=>void host.current?.reconcile(),true)}
 {!busy&&<Pressable accessibilityRole="button" disabled={state.dirty||view.phase==='loading'} onPress={()=>void host.current?.load()}><Text>{copy.refresh}</Text></Pressable>}
 </View>;
}
