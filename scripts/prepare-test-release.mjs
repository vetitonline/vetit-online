import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const target='apfyfmokcynqiaxqvvxx';
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export function executionBody(source) {
  if((source.match(/^begin;\s*$/gmi)||[]).length!==1 || (source.match(/^commit;\s*$/gmi)||[]).length!==1 || !/commit;\s*$/i.test(source)) throw Error('Expected exactly one outer transaction.');
  return source.replace(/^begin;\s*$/mi,'').replace(/^commit;\s*$/mi,'');
}
const literal = value => "'"+value.replaceAll("'","''")+"'";
export function guardedCorrection(entry,source,foundation,preceding,allEntries) {
  if(sha256(source)!==entry.sha256)throw Error('Correction source hash mismatch.');
  const body=executionBody(source),bodyHash=sha256(body);
  const delimiter='$vetit_payload_'+entry.releaseVersion+'$';
  if(body.includes(delimiter))throw Error('Payload delimiter collision.');
  const expected = [...foundation.map(row=>({version:row.version,name:row.name})),...preceding.map(row=>({version:row.releaseVersion,name:row.releaseName,bodyHash:row.bodyHash}))];
  const allowed=[...foundation.map(row=>row.version),...allEntries.map(row=>row.releaseVersion)];
  const sql=`-- PREPARED ONLY. Requires separate approval for exact Test identity and this executor.
-- Session flag is an operator attestation, NOT independent project identification.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';
do $vetit_release$
declare
  payload text := ${delimiter}${body}${delimiter};
  expected jsonb := ${literal(JSON.stringify(expected))}::jsonb;
  row_expected jsonb;
  recorded record;
begin
  if current_setting('vetit.approved_test_release',true) is distinct from '${target}:rc1-guarded' then
    raise exception 'Explicit verified Test release approval is required.';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then raise exception 'Existing migration ledger is required.'; end if;
  lock table supabase_migrations.schema_migrations in exclusive mode;
  if exists(select 1 from supabase_migrations.schema_migrations where version not in (${allowed.map(literal).join(',')})) then raise exception 'Unknown migration history: stop for review.'; end if;
  for row_expected in select value from jsonb_array_elements(expected) loop
    select name,statements into recorded from supabase_migrations.schema_migrations where version=row_expected->>'version';
    if not found or recorded.name is distinct from row_expected->>'name' then raise exception 'Missing or mismatched prerequisite migration.'; end if;
    if row_expected ? 'bodyHash' and encode(sha256(convert_to(array_to_string(recorded.statements,''),'UTF8')),'hex') is distinct from row_expected->>'bodyHash' then raise exception 'Prerequisite statement drift or different executor: stop for review.'; end if;
  end loop;
  if encode(sha256(convert_to(payload,'UTF8')),'hex') <> '${bodyHash}' then raise exception 'Payload checksum mismatch.'; end if;
  select name,statements into recorded from supabase_migrations.schema_migrations where version='${entry.releaseVersion}';
  if found then
    if recorded.name is distinct from '${entry.releaseName}' or encode(sha256(convert_to(array_to_string(recorded.statements,''),'UTF8')),'hex') is distinct from '${bodyHash}' then raise exception 'Applied migration differs: no repair or replay permitted.'; end if;
    raise notice 'Already applied and checksum matched: ${entry.releaseVersion}';
    return;
  end if;
  if exists(select 1 from supabase_migrations.schema_migrations where version in (${allEntries.filter(row=>row.releaseVersion>entry.releaseVersion).map(row=>literal(row.releaseVersion)).join(',')||"'no-later-version'"})) then raise exception 'Migration history has a gap: stop for review.'; end if;
  execute payload;
  insert into supabase_migrations.schema_migrations(version,name,statements) values('${entry.releaseVersion}','${entry.releaseName}',array[payload]);
end;
$vetit_release$;
commit;
`;
  return {sql,bodyHash};
}
export async function prepareRelease(candidateDirectory,outputDirectory,sourceDirectory) {
  const manifest=JSON.parse(await readFile(path.join(candidateDirectory,'release-manifest.json'),'utf8'));
  if(manifest.target!==target || manifest.additive.length!==6 || manifest.hostedExecutionApproved!==false)throw Error('Expected unapproved six-file Test candidate.');
  const all=[...manifest.historicalAliases,...manifest.additive];
  const sources=new Map();
  for(const row of all){const source=await readFile(path.join(sourceDirectory,row.path));const candidate=await readFile(path.join(candidateDirectory,row.candidatePath));if(sha256(source)!==row.sha256||sha256(candidate)!==row.sha256)throw Error('Source/candidate drift.');sources.set(row.path,source.toString('utf8'));}
  const prepared=[];
  for(const entry of manifest.additive){const built=guardedCorrection(entry,sources.get(entry.path),manifest.historicalAliases,prepared,manifest.additive);prepared.push({...entry,bodyHash:built.bodyHash,sql:built.sql});}
  const supplementalPath='supabase/test-project/release-corrections/seller-rejected-resubmission.proposal.sql';
  const supplemental=await readFile(path.join(sourceDirectory,supplementalPath));
  const regression=await readFile(path.join(sourceDirectory,'tests/test-acceptance-security.sql'));
  await mkdir(outputDirectory,{recursive:false});
  for(const [index,row] of prepared.entries())await writeFile(path.join(outputDirectory,`${String(index+1).padStart(2,'0')}-${row.releaseName}.guarded.sql`),row.sql,{flag:'wx'});
  await writeFile(path.join(outputDirectory,'supplemental-resubmission.UNVERSIONED.proposal.sql'),supplemental,{flag:'wx'});
  await writeFile(path.join(outputDirectory,'local-security-regression.prepared.sql'),regression,{flag:'wx'});
  await writeFile(path.join(outputDirectory,'prepared-manifest.json'),JSON.stringify({target,candidateId:manifest.candidateId+'-guarded-prepared',status:'PREPARED-NOT-EXECUTED',hostedApproved:false,additionalBlockers:[{path:supplementalPath,sha256:sha256(supplemental),status:'UNVERSIONED-SOURCE-REVIEWED-NOT-POSTGRES-TESTED'}],entries:prepared.map(({sql,...row})=>({...row,wrapperSha256:sha256(sql)}))},null,2),{flag:'wx'});
  await writeFile(path.join(outputDirectory,'README.txt'),'PREPARED ONLY. No SQL was executed. Choose either the original CLI candidate or this guarded executor after separate review; never mix ledger formats. Requires the existing Supabase migration ledger with version/name/statements columns. Verify exact Test connection independently: the custom session approval setting is only an attestation. Apply the six numbered files in order only after approval. Each is atomic with its new ledger INSERT; already-applied matching entries skip, ambiguity stops. No UPDATE/DELETE/repair of existing history. Recovery authorization is not implied. Do not point a CLI migration scanner at these wrappers. Existing historical statements require separately approved semantic comparison. Object drift despite matching history remains a preflight prerequisite. These wrappers have not been run on PostgreSQL or hosted Test. ADDITIONAL BLOCKER: the unversioned resubmission proposal needs local PostgreSQL validation, a separately generated migration version and approval; it is NOT part of the six numbered corrections. The regression file is loopback-only, synthetic and rollback-only, and expects that supplemental fix to be installed; it is not a hosted script.\n',{flag:'wx'});
  return {target,preparedFiles:prepared.length,sqlExecuted:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try {if(process.argv.length!==4)throw Error('Expected candidate directory and new output directory.');console.log(JSON.stringify(await prepareRelease(path.resolve(process.argv[2]),path.resolve(process.argv[3]),path.resolve(new URL('../',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')))));}
  catch{console.error('Release preparation stopped: check candidate, hashes and a new output directory. Existing files were not overwritten.');process.exitCode=1;}
}
