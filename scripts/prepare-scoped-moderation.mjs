// Offline proposal generator. Never connects to a database or grants identities.
import fs from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>fs.readFileSync(new URL(p,root),'utf8').replaceAll('\r\n','\n');
const durable=read('supabase/test-project/migrations/20261019102037_vetit_durable_moderation.sql');
const automatic=read('supabase/test-project/migrations/20261019111343_vetit_low_risk_automatic_approval.sql');
const storage=read('supabase/test-project/migrations/20261019120413_vetit_service_storage_boundaries.sql');
function definition(source,name){const start=source.indexOf(`create or replace function ${name}(`);if(start<0)throw Error('Missing source function');const tail=source.slice(start),delimiter=tail.match(/as (\$[a-z_]*\$)/i)?.[1];if(!delimiter)throw Error('Missing function delimiter');const first=tail.indexOf(delimiter),end=tail.indexOf(delimiter,first+delimiter.length);if(end<0)throw Error('Missing function terminator');return tail.slice(0,end+delimiter.length+1);}
function replace(source,old,value){if(!source.includes(old))throw Error('Source drift: expected replacement unavailable');return source.replaceAll(old,value);}
export function scopedProposal(){
let sql=read('supabase/test-project/release-corrections/business-scoped-moderation.foundation.sql');
let f=definition(durable,'vetit_moderation.authorize');
f=replace(f,'vetit_moderation.is_admin()','vetit_moderation.has_scope(b,\'review\')');
f=replace(f,'if found then return;end if;',"if found then perform vetit_moderation.require_scope(b,'review');return;end if;");sql+='\n'+f;
f=definition(durable,'public.moderation_decide');f=replace(f,"perform vetit_moderation.authorize(c.business_id,p_action<>'screen');","perform vetit_moderation.authorize(c.business_id,p_action<>'screen');\n if p_action<>'screen' then perform vetit_moderation.require_scope(c.business_id,case when p_action='approve' then 'publish' else 'review' end);end if;");sql+='\n'+f;
f=definition(durable,'vetit_moderation.publication_gate');f=replace(f,'vetit_moderation.is_admin()',"vetit_moderation.has_scope(c.business_id,case when approving then 'publish' else 'review' end)");sql+='\n'+f;
f=definition(automatic,'public.moderation_status');f=replace(f,'vetit_moderation.is_admin()',"vetit_moderation.has_scope(b,'read')");sql+='\n'+f;
f=definition(automatic,'public.moderation_queue');f=replace(f,'vetit_moderation.is_admin()','vetit_moderation.has_any_scope()');f=replace(f,'where c.is_current',"where vetit_moderation.has_scope(c.business_id,'read') and c.is_current");sql+='\n'+f;
f=definition(durable,'public.admin_listing_queue');f=replace(f,'vetit_moderation.is_admin()','vetit_moderation.has_any_scope()');f=replace(f,'where l.archived_at',"where vetit_moderation.has_scope(l.business_id,'read') and l.archived_at");sql+='\n'+f;
f=definition(durable,'public.review_seller_business');f=replace(f,"if not vetit_moderation.is_admin() then raise exception 'Current Vetit reviewer access required.' using errcode='42501';end if;","perform vetit_moderation.require_scope(p_business_id,case when p_decision='verified' then 'publish' else 'review' end);");sql+='\n'+f;
f=definition(durable,'public.review_seller_listing');f=replace(f,"if not vetit_moderation.is_admin() then raise exception 'Current Vetit reviewer access required.' using errcode='42501';end if;",'');f=replace(f,"select b.* into business_row", "perform vetit_moderation.require_scope(listing_business_id,case when p_decision='publish' then 'publish' else 'review' end);\n  select b.* into business_row");sql+='\n'+f;
f=definition(durable,'public.can_read_service_image');f=replace(f,'vetit_moderation.is_admin()',"vetit_moderation.has_scope(b.id,'read')");sql+='\n'+f;
f=definition(storage,'public.can_read_moderated_listing_image');f=replace(f,'vetit_moderation.is_admin()',"vetit_moderation.has_scope(b.id,'read')");sql+='\n'+f;
f=definition(durable,'public.guard_seller_catalog_mutations');
f=replace(f,"is_vetit_admin boolean := coalesce((auth.jwt()->'app_metadata'->>'vetit_admin') = 'true', false);",'is_vetit_admin boolean := false;');
f=replace(f,"if tg_table_name = 'businesses' then","if tg_table_name = 'businesses' then\n    is_vetit_admin := vetit_moderation.has_scope(new.id,'review');");
f=replace(f,"if tg_table_name = 'listings' then","if tg_table_name = 'listings' then\n    is_vetit_admin := vetit_moderation.has_scope(new.business_id,'review');");
f=replace(f,"if not found then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;","if not found then raise exception 'Parent product is unavailable.' using errcode = '42501'; end if;\n  is_vetit_admin := vetit_moderation.has_scope(parent_business_id,'review');");sql+='\n'+f;
// No remaining caller may use a global authorization shortcut.
sql+="\ncreate or replace function vetit_moderation.is_admin() returns boolean language sql stable set search_path='' as $$select false;$$;\ncommit;\n";
// Dedicated review identity must not require the unrelated global admin claim.
return sql.replaceAll("->>'vetit_admin'","->>'vetit_reviewer'");
}
if(process.argv[1]&&new URL('file:///'+process.argv[1].replaceAll('\\','/')).href===import.meta.url){const destination=new URL('supabase/test-project/release-corrections/business-scoped-moderation.proposal.sql',root);if(fs.existsSync(destination))throw Error('Preserving existing proposal; choose reviewed regeneration explicitly.');fs.writeFileSync(destination,scopedProposal(),{flag:'wx'});console.log('Scoped proposal prepared; no database accessed.');}
