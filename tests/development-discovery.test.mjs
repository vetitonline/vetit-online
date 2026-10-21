import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {featuredDiscoveryCards} from '../src/lib/marketplace/home-discovery.js';
import {attachProductImageFallback} from '../src/lib/marketplace/image-fallback.js';
import {mountNativeComponent} from './native-component-harness.mjs';

test('available short featured rows reach four using real destinations, never fake products',()=>{
 for(const count of [1,2,3]){
  const cards=featuredDiscoveryCards('available',count);
  assert.equal(cards.length+count,4);assert.equal(new Set(cards.map(x=>x.href)).size,cards.length);
  assert.ok(cards.every(x=>['/products','/services','/shop'].includes(x.href)));
 }
 for(const [state,count] of [['error',2],['empty',0],['available',0],['available',4]])assert.deepEqual(featuredDiscoveryCards(state,count),[]);
});
test('existing category source images are actual WebP assets',()=>{
 for(const name of ['dog','cat','bird','fish','livestock','essentials']){
  const bytes=fs.readFileSync(new URL('../public/images/discovery/'+name+'.webp',import.meta.url));
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
 }
});
test('web seller images fall back for network errors and cached failures without retry loops',()=>{
 for(const cached of [false,true]){
  const image=Object.assign(new EventTarget(),{complete:cached,naturalWidth:0,hidden:false});const fallback={hidden:true};
  const detach=attachProductImageFallback(image,fallback);
  if(!cached){assert.equal(fallback.hidden,true);image.dispatchEvent(new Event('error'));}
  assert.equal(image.hidden,true);assert.equal(fallback.hidden,false);detach();
 }
});
const modules={'react-native':{Image:'Image',Text:'Text',View:'View'}};
test('actual native photo handler replaces failed image with labelled fallback',()=>{
 const ui=mountNativeComponent('ProductPhoto.tsx','PhotoAttempt',{uri:'https://example.invalid/photo.jpg',label:'Seller photo',fallback:'Seller photo unavailable',style:{}},modules);
 const image=ui.nodes().find(n=>n.type==='Image');assert.ok(image);
 image.props.onError();ui.render();assert.equal(ui.nodes().some(n=>n.type==='Image'),false);assert.match(ui.text(),/Seller photo unavailable/);
});
test('native changed photo URI changes attempt key; missing URI uses fallback',()=>{
 const props={uri:'https://example.invalid/a.jpg',label:'Photo',fallback:'Unavailable',style:{}};
 const ui=mountNativeComponent('ProductPhoto.tsx','ProductPhoto',props,modules);const first=ui.nodes()[0].props.key;
 props.uri='https://example.invalid/b.jpg';ui.render();assert.notEqual(ui.nodes()[0].props.key,first);
 const missing=mountNativeComponent('ProductPhoto.tsx','PhotoAttempt',{...props,uri:null},modules);assert.match(missing.text(),/Unavailable/);
});
