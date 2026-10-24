// Offline hook/event harness for actual TSX source. NOT React Native rendering,
// layout, accessibility-engine, secure-storage or device acceptance.
import fs from 'node:fs';
import ts from 'typescript';
import * as workflow from '../src/lib/moderation/workflow.js';
import * as workspace from '../src/lib/moderation/session-workspace.js';
import * as buyerCopy from '../src/lib/marketplace/workspace-copy.js';
import * as providerAppointmentActions from '../mobile/src/provider-appointment-actions.js';
export function mountNativeComponent(filename,exportName,props,extraModules={},nativeOverrides={}){
 const slots=[];let cursor=0,tree,effects=[];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,i)=>Object.is(value,b[i]));
 const react={
  Fragment:'Fragment',createElement:(type,attributes,...children)=>({type,props:{...attributes,children},children}),
  useState:initial=>{const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,value=>{slots[i].value=typeof value==='function'?value(slots[i].value):value;}];},
  useRef:initial=>{const i=cursor++;return slots[i]??(slots[i]={current:initial});},
  useMemo:(make,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps))slots[i]={value:make(),deps};return slots[i].value;},
  useCallback:(fn,deps)=>react.useMemo(()=>fn,deps),
  useEffect:(setup,deps)=>{const i=cursor++;if(!slots[i]||!same(slots[i].deps,deps)){const previous=slots[i];slots[i]={setup,deps,cleanup:previous?.cleanup};effects.push(slots[i]);}},
 };
 const native=Object.fromEntries(['View','Text','TextInput','Pressable','ActivityIndicator'].map(name=>[name,name]));
 const openedLinks=[];native.Linking={openURL:async url=>{openedLinks.push(url);}};
 const lifecycle=new Set();native.AppState={addEventListener:(_event,callback)=>{lifecycle.add(callback);return{remove:()=>lifecycle.delete(callback)};}};
 Object.assign(native,nativeOverrides);
 const modules={react:{__esModule:true,default:react,...react},'react-native':native,'../../src/lib/moderation/workflow.js':workflow,'../../src/lib/moderation/session-workspace.js':workspace,'../../src/lib/marketplace/workspace-copy.js':buyerCopy,'./provider-appointment-actions.js':providerAppointmentActions,'./NativeProviderSchedule':{NativeProviderSchedule:'NativeProviderSchedule'},...extraModules};
 const source=fs.readFileSync(new URL('../mobile/src/'+filename,import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
 const exports={};new Function('require','exports',compiled)(name=>{if(!(name in modules))throw Error('Unexpected component dependency');return modules[name];},exports);
 const all=(value,out=[])=>{if(Array.isArray(value))value.forEach(child=>all(child,out));else if(value&&typeof value==='object'){out.push(value);all(value.children,out);}return out;};
 const text=value=>Array.isArray(value)?value.map(text).join(''):value&&typeof value==='object'?text(value.children):typeof value==='string'?value:'';
 const api={
  openedLinks,
  render:()=>{cursor=0;effects=[];tree=exports[exportName](props);for(const effect of effects){effect.cleanup?.();effect.cleanup=effect.setup();}return tree;},
  nodes:()=>all(tree),text:()=>text(tree),
  input:(label,value)=>{const input=all(tree).find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label);if(!input)throw Error('Expected labelled input');input.props.onChangeText(value);api.render();},
  button:label=>all(tree).find(n=>n.type==='Pressable'&&text(n.children)===label),
  replayEffects:()=>{for(const effect of slots.filter(s=>s?.setup)){effect.cleanup?.();effect.cleanup=effect.setup();}},
  appState:value=>{for(const listener of lifecycle)listener(value);api.render();},
  unmount:()=>{for(const effect of slots.filter(s=>s?.setup))effect.cleanup?.();},
 };
 api.render();return api;
}
export async function drainNativeTasks(){for(let i=0;i<20;i++)await Promise.resolve();}
