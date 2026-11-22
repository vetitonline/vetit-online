import {createServer} from 'node:http';
import {createDevicePreviewHandler} from './device-preview-fixtures.mjs';
const args=process.argv.slice(2);if(args.some(arg=>arg!=='--lan'))throw Error('Only --lan is supported. No hosted URL or credentials are accepted.');
const host=args.includes('--lan')?'0.0.0.0':'127.0.0.1',handler=createDevicePreviewHandler();
const server=createServer(async(req,res)=>{try{const response=handler(new Request('http://local.invalid'+req.url,{method:req.method,headers:req.headers}));res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());}catch{res.writeHead(500,{'Content-Type':'application/json'});res.end('{"fixtureOnly":true,"state":"error"}');}});
server.on('error', error => {console.error(error.code==='EADDRINUSE'?'Fixture port 4324 is already in use. Stop your earlier preview or choose another computer session; no existing process was stopped.':'Fixture server could not start.');process.exitCode=1;});
server.listen(4324,host,()=>{process.send?.({ready:true});console.log(`Read-only device fixtures on ${host}:4324. No database/provider access; no sign-in or writes.`);if(host==='0.0.0.0')console.log('Use your computer private LAN IP on your phones, not localhost. Trusted private Wi-Fi only.');});
