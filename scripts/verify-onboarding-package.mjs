// Offline integrity/ordering review only; no database, network or execution path.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function verifyOnboardingPackage(root) {
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 if(manifest.package!=='vetit-onboarding-20261022-r1'||manifest.targetProject!=='apfyfmokcynqiaxqvvxx'||manifest.hostedApproved!==false||manifest.executionReady!==false||manifest.linked!==false||!/^\d{14}$/.test(manifest.version))throw Error('Unapproved target/readiness metadata');
 const frozen=JSON.parse(fs.readFileSync(new URL('../supabase/test-project/releases/vetit-test-20261021-r1/release-manifest.json',import.meta.url),'utf8'));
 const expected=[...frozen.foundationPreserve.map(x=>x.version),...frozen.entries.map(x=>x.version)];
 if(JSON.stringify(manifest.expectedLedgerBefore)!==JSON.stringify(expected)||manifest.expectedLedgerBefore.includes(manifest.version))throw Error('Unexpected predecessor ledger');
 const forward=`supabase/migrations/${manifest.version}_vetit_seller_onboarding_v2.sql`;
 if(manifest.entries.length!==2||manifest.entries[0].path!==forward||manifest.entries[0].automaticForward!==true||manifest.entries[1].path!=='reversal-review.sql'||manifest.entries[1].automaticForward!==false)throw Error('Unexpected execution paths');
 const migrations=fs.readdirSync(path.join(root,'supabase/migrations'));
 if(migrations.length!==1||migrations[0]!==path.basename(forward))throw Error('Unreviewed migration present');
 for(const item of manifest.entries){
  const bytes=fs.readFileSync(path.join(root,item.path));
  if(createHash('sha256').update(bytes).digest('hex')!==item.sha256)throw Error('Payload changed');
  const sql=bytes.toString('utf8');
  if((sql.match(/^begin;\s*$/gm)||[]).length!==1||(sql.match(/^commit;\s*$/gm)||[]).length!==1)throw Error('Transaction wrapper mismatch');
 }
 return {version:manifest.version,payloadsVerified:2,executionReady:false,expectedPredecessors:18};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(verifyOnboardingPackage(process.argv[2])));
