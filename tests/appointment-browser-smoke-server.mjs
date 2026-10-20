/** Local fixture UI only: real appointment markup/client script, mocked HTTP.
 * No Astro SSR, real authentication, database access or external requests.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { INITIAL_APPOINTMENT_POLICY as policy } from '../src/lib/services/appointment-lifecycle.js';
const source=fs.readFileSync('src/pages/appointments.astro','utf8');
const script=source.match(/<script>([\s\S]*?)<\/script>/)[1];
const js=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replaceAll('../lib/services/','/src/lib/services/');
const html=source.replace(/^---[\s\S]*?---\s*/,'').replace('<SiteHeader />','<p>LOCAL FIXTURE SMOKE TEST — mocked API, no authentication/backend integration</p>').replace(/<script>[\s\S]*?<\/script>/,'<script type="module" src="/smoke-client.js"></script>').replace('</head>','<link rel="stylesheet" href="/styles.css"></head>');
const service='40000000-0000-4000-8000-000000000001',business='20000000-0000-4000-8000-000000000001',booking='60000000-0000-4000-8000-000000000001',slot='50000000-0000-4000-8000-000000000001';
const startsAt=new Date(Date.now()+3*86400000).toISOString(),endsAt=new Date(Date.parse(startsAt)+1800000).toISOString();
let mode='available';const commands=[];
const dashboard={bookings:[{id:booking,service_listing_id:service,appointment_slot_id:slot,status:'requested',requested_start:startsAt,requested_end:endsAt,price_minor:25000,currency_code:'INR',lifecycle_revision:1,lifecycle_policy_snapshot:policy}],events:[],waitlist:[],offers:[],notifications:[],providerBusinesses:[{id:business,display_name:'Fixture clinic'}],services:[{id:service,title:'Fixture consultation'}],slots:[{id:slot,service_listing_id:service,starts_at:startsAt,ends_at:endsAt,status:'available',lifecycle_resource_key:'clinician_1'}],policies:[{service_listing_id:service,policy}],payments:[],refunds:[],truncated:false};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4323');
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:");
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/__smoke/mode'){mode=['available','unavailable','unauthorized'].includes(url.searchParams.get('state'))?url.searchParams.get('state'):'available';return json({mode});}
  if(url.pathname==='/__smoke/commands')return json(commands);
  if(url.pathname==='/api/appointments'){
    if(mode!=='available')return json({apiVersion:1,state:mode},mode==='unauthorized'?401:503);
    if(req.method==='POST'){let body='';for await(const chunk of req){body+=chunk;if(body.length>8192)return json({},413);}commands.push(JSON.parse(body));return json({apiVersion:1,state:'accepted',data:{bookingId:booking}});}
    return json({apiVersion:1,state:'available',data:url.searchParams.has('serviceListingId')?{title:'Fixture consultation',priceMinor:25000,currencyCode:'INR',policy}:dashboard});
  }
  if(url.pathname==='/api/services/slots')return json({apiVersion:1,state:'available',serviceListingId:service,slots:[{id:slot,service_listing_id:service,starts_at:startsAt,ends_at:endsAt}],truncated:false});
  if(url.pathname==='/smoke-client.js'){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(js);}
  if(url.pathname==='/styles.css'){res.writeHead(200,{'Content-Type':'text/css'});return res.end(fs.readFileSync('styles.css'));}
  if(/^\/src\/lib\/services\/[a-z-]+\.js$/.test(url.pathname)){const file=path.join(process.cwd(),url.pathname);if(fs.existsSync(file)){res.writeHead(200,{'Content-Type':'text/javascript'});return res.end(fs.readFileSync(file));}}
  if(url.pathname==='/appointments'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(html);}
  res.writeHead(404);res.end('Local smoke fixture only');
});
server.listen(4323,'127.0.0.1',()=>console.log('Fixture UI: http://127.0.0.1:4323/appointments?service='+service));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
