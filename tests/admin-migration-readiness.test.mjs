import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('pending admin migration matches isolated-tested proposal and remains outside automatic migration discovery',async()=>{
 const proposal=await readFile(new URL('../supabase/test-project/20261121170000_admin_order_overview.proposal.sql',import.meta.url),'utf8');
 const pending=await readFile(new URL('../supabase/pending-migrations/20261121170000_admin_order_overview.sql',import.meta.url),'utf8');
 assert.equal(pending,proposal);assert.match(pending,/auth\.uid\(\) is null/);assert.match(pending,/app_metadata/);assert.match(pending,/revoke all[\s\S]*from public,anon/);assert.doesNotMatch(pending,/grant (?:select|insert|update|delete).*on (?:table )?public\.orders/i);assert.doesNotMatch(pending,/customer_profile_id|delivery_address_snapshot|payment_reference/);
});
