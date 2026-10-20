// Synthetic loopback-only browser fixture. Real component script and API route,
// injected auth/RPC; never imports Supabase config or credentials.
import fs from 'node:fs';
import http from 'node:http';
import ts from 'typescript';
import {fileURLToPath} from 'node:url';
import {createModerationRoutes,fixtureId} from './moderation-api-fixture.mjs';
export async function createModerationBrowserFixture(){
 const source=fs.readFileSync(new URL('../src/components/seller/ModerationPanel.astro',import.meta.url),'utf8');
 const script=ts.transpileModule(source.match(/<script>([\s\S]*?)<\/script>/)[1],{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 let mode='success',version=1,state='eligible',requests=[],rpcCalls=0,writes=0;const replies=new Map();
 const routes=createModerationRoutes(async()=>mode==='expired'?{state:'unauthenticated'}:{state:'authenticated',user:{app_metadata:{vetit_reviewer:true}},supabase:{rpc:async(name,args)=>{
  rpcCalls++;if(mode==='conflict')return{error:{code:'40001'}};
  if(replies.has(args.p_request))return{data:replies.get(args.p_request)};
  await new Promise(resolve=>setTimeout(resolve,150));writes++;version++;state='approved';
  const data={caseId:fixtureId,version,state};replies.set(args.p_request,data);return{data};
 }}});
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1');
   if(url.pathname==='/'&&['conflict','expired','success','lost'].includes(url.searchParams.get('mode'))&&mode!==url.searchParams.get('mode')){mode=url.searchParams.get('mode');version=1;state='eligible';requests=[];rpcCalls=0;writes=0;replies.clear();}
   if(url.pathname==='/__fixture/status'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({mode,requests,rpcCalls,writes,version,state}));return;}
   res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self';script-src 'self';style-src 'self';connect-src 'self';img-src 'self' data:;font-src 'self'");
   if(url.pathname==='/api/moderation'){
    let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>16384){res.writeHead(413);res.end();return;}}
    requests.push(JSON.parse(raw));
    const request=new Request(`http://127.0.0.1:${server.address().port}/api/moderation`,{method:'POST',headers:req.headers,body:raw});
    const result=await routes.POST({request,cookies:{}});
    const lost=mode==='lost'&&requests.length===1;
    res.writeHead(lost?503:result.status,Object.fromEntries(result.headers));res.end(lost?'{}':Buffer.from(await result.arrayBuffer()));return;
   }
   const assets={
    '/src/components/seller/panel.js':()=>script,
    '/src/lib/moderation/workflow.js':()=>fs.readFileSync(new URL('../src/lib/moderation/workflow.js',import.meta.url)),
    '/src/lib/supabase/test-endpoints.js':()=>fs.readFileSync(new URL('../src/lib/supabase/test-endpoints.js',import.meta.url)),
    '/styles.css':()=>fs.readFileSync(new URL('../styles.css',import.meta.url)),
   };
   if(assets[url.pathname]){res.writeHead(200,{'content-type':url.pathname.endsWith('.css')?'text/css':'text/javascript'});res.end(assets[url.pathname]());return;}
   if(url.pathname!=='/'){res.writeHead(404);res.end();return;}
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><title>Local synthetic moderation acceptance</title></head><body><main class="seller-page"><p>LOCAL SYNTHETIC FIXTURE — no hosted integration</p><section class="seller-panel moderation-workspace" data-kind="product" data-subject="${fixtureId}" data-case-id="${fixtureId}" data-version="${version}"><h1>Review / समीक्षा</h1><p class="fixture-state">${state}</p><label>Reason<input class="moderation-reason" value="FIX_REQUIRED"></label><label>Private note<textarea class="moderation-note"></textarea></label><label>Correction<textarea class="moderation-correction">Synthetic correction only</textarea></label>${['approve','reject','corrections','screen'].map(action=>`<button type="button" data-moderation-action="${action}">${action}</button>`).join(' ')}<p class="moderation-feedback" role="alert"></p></section></main><script type="module" src="/src/components/seller/panel.js"></script></body></html>`);
  }catch{res.writeHead(500);res.end('Fixture failure');}
 });

 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const deadline=setTimeout(()=>{server.closeAllConnections();server.close();},120000);
 return{server,origin,reset(nextMode){mode=nextMode;version=1;state='eligible';requests=[];rpcCalls=0;writes=0;replies.clear();},stats(){return{requests,rpcCalls,writes,version,state};},async close(){clearTimeout(deadline);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){const fixture=await createModerationBrowserFixture();console.log('LOCAL_SYNTHETIC_FIXTURE '+fixture.origin);}
