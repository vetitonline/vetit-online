import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import test from 'node:test';
import {Worker} from 'node:worker_threads';

const astroRequire=createRequire(fs.realpathSync(new URL('../node_modules/astro/package.json',import.meta.url)));
const adapterRequire=createRequire(fs.realpathSync(new URL('../node_modules/@astrojs/vercel/package.json',import.meta.url)));
const routingRequire=createRequire(adapterRequire.resolve('@vercel/routing-utils'));
const CachePolicy=astroRequire('http-cache-semantics');
const request={url:'https://synthetic.invalid/product',method:'GET',headers:{host:'synthetic.invalid'}};
const staleRequests=['max-stale','max-stale=999999'].map(value=>({...request,headers:{...request.headers,'cache-control':value}}));

test('max-stale cannot reuse private, no-store, no-cache or implicitly shared cookie responses',()=>{
 for(const headers of [
  {'cache-control':'no-store','set-cookie':'synthetic=private'},
  {'cache-control':'private, max-age=60'},
  {'cache-control':'no-cache','set-cookie':'synthetic=private'},
  {'set-cookie':'synthetic=private'},
  {'cache-control':'public, no-cache, max-age=60'},
  {'cache-control':'private, stale-while-revalidate=99999'},
 ]){
  const policy=new CachePolicy(request,{status:200,headers});
  for(const incoming of staleRequests){
   const result=policy.evaluateRequest(incoming);
   assert.equal(policy.satisfiesWithoutRevalidation(incoming),false);
   assert.equal(result.response,undefined);
   assert.equal(result.revalidation.synchronous,true);
   assert.equal('set-cookie' in result.revalidation.headers,false);
  }
 }
});

test('request no-store and unauthorized shared responses cannot be revived by stale directives',()=>{
 for(const headers of [{'cache-control':'no-store'},{authorization:'Bearer synthetic-private'}]){
  const policy=new CachePolicy({...request,headers:{...request.headers,...headers}},{status:200,headers:{'cache-control':'max-age=60'}});
  assert.equal(policy.storable(),false);
  for(const incoming of staleRequests)assert.equal(policy.satisfiesWithoutRevalidation(incoming),false);
 }
});

test('explicit public caching, ordinary allowed stale responses and personal caches retain their semantics',()=>{
 const publicPolicy=new CachePolicy(request,{status:200,headers:{'cache-control':'public, max-age=60','set-cookie':'synthetic=explicit'}});
 assert.equal(publicPolicy.satisfiesWithoutRevalidation(request),true);
 const expired=new CachePolicy(request,{status:200,headers:{'cache-control':'public, max-age=1'}});
 expired.now=()=>Date.now()+10000;
 assert.equal(expired.satisfiesWithoutRevalidation(staleRequests[1]),true);
 const personal=new CachePolicy(request,{status:200,headers:{'cache-control':'private, max-age=60','set-cookie':'synthetic=personal'}},{shared:false});
 assert.equal(personal.satisfiesWithoutRevalidation(request),true);
 const varied=new CachePolicy(request,{status:200,headers:{'cache-control':'public, max-age=60',vary:'*'}});
 assert.equal(varied.satisfiesWithoutRevalidation(staleRequests[1]),false);
});

test('Vercel route conversion retains product parameters after its scoped regex dependency correction',()=>{
 assert.equal(routingRequire('path-to-regexp/package.json').version,'6.3.0');
 const routes=adapterRequire('@vercel/routing-utils').convertRewrites([{source:'/products/:slug',destination:'/shop/:slug'}]);
 assert.equal(routes.length,1);
 assert.equal(new RegExp(routes[0].src).test('/products/pet-food'),true);
 assert.equal(new RegExp(routes[0].src).test('/services/pet-food'),false);
 assert.ok(routes[0].dest.includes('/shop/'));
});

test('adversarial multi-parameter routes reject within a bounded worker without blocking the test process',async()=>{
 const entry=routingRequire.resolve('path-to-regexp');
 const result=await new Promise((resolve,reject)=>{
  const worker=new Worker(`const {parentPort,workerData}=require('node:worker_threads');const {pathToRegexp}=require(workerData);const re=pathToRegexp('/:a-:b');parentPort.postMessage({valid:re.test('/pet-food'),attack:re.test('/a'+'-a'.repeat(8000)+'/a')});`,{eval:true,workerData:entry});
  const timer=setTimeout(()=>{void worker.terminate();reject(Error('Route regex exceeded three-second safety bound'));},3000);
  worker.once('message',value=>{clearTimeout(timer);resolve(value);});
  worker.once('error',error=>{clearTimeout(timer);reject(error);});
 });
 assert.deepEqual(result,{valid:true,attack:false});
});

test('Astro resolves the reviewed patched Vite generation',()=>{
 assert.equal(astroRequire('vite/package.json').version,'8.3.3');
});
