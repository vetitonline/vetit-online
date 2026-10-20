import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
// Pure validation of already-captured identity/ledger and local sources. No transport.
export async function verifyReleaseSources({projectId,ledger,manifest,readSource}) {
  if(projectId!==manifest.target)throw Error('Wrong release target');
  if(ledger.length!==manifest.foundation.length||ledger.some((row,i)=>row.version!==manifest.foundation[i].version||row.name!==manifest.foundation[i].name))throw Error('Ledger drift: stop for review');
  for(const item of [...manifest.foundation,...manifest.additive]) {
    const actual=createHash('sha256').update(await readSource(item.path)).digest('hex');
    if(actual!==item.sha256)throw Error('Source drift: '+item.path);
  }
  return {verified:true,hostedExecutionApproved:false,versionsAssigned:manifest.additive.every(x=>!!x.releaseVersion)};
}
if(process.argv[2]==='--self-test') {
  const assert=await import('node:assert/strict');
  const root=new URL('../',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('supabase/test-project/release-corrections/source-manifest.json',root),'utf8'));
  const options={projectId:manifest.target,ledger:manifest.foundation.map(({version,name})=>({version,name})),manifest,readSource:path=>readFile(new URL(path,root))};
  assert.deepEqual(await verifyReleaseSources(options),{verified:true,hostedExecutionApproved:false,versionsAssigned:false});
  await assert.rejects(()=>verifyReleaseSources({...options,projectId:'production'}),/Wrong release target/);
  await assert.rejects(()=>verifyReleaseSources({...options,ledger:options.ledger.slice(1)}),/Ledger drift/);
  await assert.rejects(()=>verifyReleaseSources({...options,ledger:options.ledger.map((r,i)=>i===0?{...r,name:'different'}:r)}),/Ledger drift/);
  await assert.rejects(()=>verifyReleaseSources({...options,readSource:async()=>Buffer.from('changed')}),/Source drift/);
  console.log('PASS 5/5 release-source guards: expected sources, wrong target, missing history, renamed history, changed SQL');
}
