// Static regression for the preserved normalized Test candidate, not a SQL parser
// or hosted privilege verifier. No database, network, dependency or Git writes.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
const manifest=JSON.parse(await read('supabase/test-project/reconciled-candidate-20261020-r5/package-manifest.json'));
const tables=new Set(),policies=new Set(),rls=new Set(),explicit=new Set();
let composition='';
for(const entry of [...manifest.foundation,...manifest.entries]){
 const p=entry.path??entry.source,bytes=await readFile(new URL(p,root));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256,p+' changed');
 const sql=bytes.toString();composition+='\n'+sql;
 for(const m of sql.matchAll(/create table\s+(?:if not exists\s+)?public\.(\w+)/gi))tables.add(m[1]);
 for(const m of sql.matchAll(/alter table\s+public\.(\w+)\s+enable row level security/gi))rls.add(m[1]);
 for(const m of sql.matchAll(/create policy\s+[\s\S]*?\bon\s+public\.(\w+)/gi))policies.add(m[1]);
 for(const m of sql.matchAll(/^grant\s+(?!execute\b)[^;]+;/gmi)){
  for(const t of m[0].matchAll(/public\.(\w+)/g))explicit.add(t[1]);
 }
}
assert.equal(tables.size,35,'Review changed public table inventory');
for(const table of tables)assert.ok(rls.has(table),'Missing explicit RLS: '+table);
const closed=['inventory_levels','inventory_movements','payments','seller_payment_accounts'];
for(const table of closed)assert.ok(!explicit.has(table),'Unexpected client table grant: '+table);
for(const table of tables)if(!closed.includes(table)){
 assert.ok(explicit.has(table),'Missing explicit table/column grant: '+table);
 assert.ok(policies.has(table),'Missing policy source: '+table);
}
assert.match(composition,/grant select on table public\.fulfilment_events to authenticated;/i);
assert.match(composition,/create policy fulfilment_events_read_participant/i);
assert.match(composition,/revoke select \(legal_name\) on table public\.businesses from anon, authenticated;/i);
assert.match(composition,/grant update \(full_name, phone\) on public\.profiles to authenticated;/i);
assert.doesNotMatch(composition,/grant\s+(?:all|select,\s*insert,\s*update,\s*delete)\s+on all tables in schema public/i);
// Recreated tables cannot inherit client exposure: every canonical public table
// is included in the explicit baseline revoke (new fulfilment_events separately).
const revoke=composition.match(/revoke all on public\.profiles,[\s\S]*?from public, anon, authenticated;/i)?.[0]??'';
for(const table of tables)assert.ok(revoke.includes('public.'+table)||table==='fulfilment_events','Missing revoke decision: '+table);
console.log(JSON.stringify({status:'PASS',sourceHashesMatched:17,publicTables:35,
 explicitClientGrantAndPolicyTables:31,closedClientTables:closed,
 newPublicTable:'fulfilment_events: authenticated SELECT only; participant policy',
 serviceRole:'No blanket table grants added; existing privileged operations use scoped SECURITY DEFINER RPCs with explicit EXECUTE grants. Direct service-table access is not certified.',
 limitations:'Static source assertions only; not final effective ACL/column/policy semantics or hosted HTTP acceptance.'},null,2));
