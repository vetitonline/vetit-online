begin;
set local statement_timeout='15s';set local lock_timeout='3s';
do $history$
declare b uuid:='20000000-0000-4000-8000-000000000032'; old_case uuid; result jsonb;
begin
 if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong local target.';end if;
 insert into public.businesses(id,display_name,business_type,public_email) values(b,'Synthetic moderation history applicant','other','synthetic@example.invalid');
 insert into public.business_memberships(business_id,profile_id,member_role) values(b,'10000000-0000-4000-8000-000000000001','owner');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);set local role authenticated;
 result:=public.moderation_open('seller',b);old_case:=(result->>'caseId')::uuid;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
 perform public.moderation_decide(old_case,(result->>'version')::bigint,'reject',gen_random_uuid(),array['APPLICATION_INCOMPLETE'],'Synthetic private history note');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);
 result:=public.moderation_open('seller',b);
 if (result->>'caseId')::uuid=old_case then raise exception 'Rejected case evidence reused.';end if;
 result:=public.moderation_status('seller',b);
 if not exists(select 1 from jsonb_array_elements(result->'events') e where e->>'operation'='reject') or exists(select 1 from jsonb_array_elements(result->'events') e where e->>'note' is not null or e->>'reviewer' is not null) then raise exception 'Cross-submission seller history/privacy failure.';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
 result:=public.moderation_status('seller',b);
 if not exists(select 1 from jsonb_array_elements(result->'events') e where e->>'note'='Synthetic private history note') then raise exception 'Admin lost prior submission audit.';end if;
 reset role;raise notice 'PASS cross-submission audit continuity and seller/private-note separation';
end;
$history$;
rollback;
