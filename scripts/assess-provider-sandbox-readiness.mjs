import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const requirements={payment:['providerAccountAvailable','idempotentCreate','independentStatusLookup','amountCurrencyBinding','boundedRequests'],delivery:['providerAccountAvailable','syntheticRecipientsOnly','idempotentSend','independentStatusLookup','receiptBinding','boundedRequests'],charges:['providerAccountAvailable','serverPriceSellerBinding','quoteExpiry','inrMinorUnits','coverageReviewed','taxPolicyReviewed','boundedRequests']};
/** Declared evidence inventory only. No provider, network, credentials or approval. */
export function assessProviderSandboxReadiness(plan){
 if(!plan||plan.mode!=='sandbox'||Object.keys(plan).some(key=>!['mode','providers'].includes(key))||!plan.providers||typeof plan.providers!=='object'||Array.isArray(plan.providers)||Object.keys(plan.providers).some(key=>!Object.hasOwn(requirements,key)))throw Error('Invalid sandbox readiness plan.');
 const blockers=[];
 for(const [kind,keys] of Object.entries(requirements)){
  const provider=plan.providers[kind];if(!provider||Object.keys(provider).some(key=>!keys.includes(key))||keys.some(key=>typeof provider[key]!=='boolean'))throw Error('Invalid sandbox capability declaration.');
  for(const key of keys)if(!provider[key])blockers.push(kind.toUpperCase()+'_'+key.replace(/[A-Z]/g,char=>'_'+char).toUpperCase());
 }
 return{declaredCapabilitiesComplete:blockers.length===0,blockers,providerRuntimeVerified:false,hostedAcceptanceVerified:false,hostedExecutionAuthorized:false,liveOperationAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const plan=JSON.parse(await readFile(new URL('../docs/provider-sandbox-readiness.example.json',import.meta.url),'utf8'));process.stdout.write(JSON.stringify(assessProviderSandboxReadiness(plan),null,2)+'\n');}
