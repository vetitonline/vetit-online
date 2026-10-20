-- Extra acceptance against installed local candidate; rollback-only new fixture.
begin;
set local statement_timeout='15s';set local lock_timeout='3s';
do $worker$
declare b uuid:='20000000-0000-4000-8000-000000000030'; c vetit_moderation.cases%rowtype; result jsonb;
begin
 if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong disposable target.';end if;
 insert into public.businesses(id,display_name,business_type,public_email) values(b,'Synthetic worker context applicant','other','synthetic@example.invalid');
 insert into public.business_memberships(business_id,profile_id,member_role) values(b,'10000000-0000-4000-8000-000000000001','owner');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);set local role authenticated;
 result:=public.moderation_open('seller',b);
 begin perform public.moderation_screening_context((result->>'caseId')::uuid);raise exception 'Seller accessed worker context.';exception when insufficient_privilege then null;end;
 reset role;select * into c from vetit_moderation.cases where id=(result->>'caseId')::uuid;
 set local role service_role;result:=public.moderation_screening_context(c.id);
 if result->>'revision'<>c.revision or result->>'policyId'<>c.policy_id::text or result ? 'public_email' or result ? 'private_document_reference' or result->>'kind'<>'seller' then raise exception 'Worker context invalid or excessive.';end if;
 perform public.moderation_attest(c.id,c.revision,c.policy_id,'content','unavailable','synthetic_only',now()+interval '1 hour',gen_random_uuid());
 reset role;select * into c from vetit_moderation.cases where id=c.id;
 set local role authenticated;result:=public.moderation_decide(c.id,c.version,'screen',gen_random_uuid());
 if result->>'state'<>'screened' or not(result->'reasons' ? 'CONTENT_NOT_PASSED') then raise exception 'Unavailable provider did not close approval.';end if;
 reset role;
 raise notice 'PASS installed worker context ACL, revision binding and recorded unavailable evidence';
end;
$worker$;
rollback;
select not exists(select 1 from public.businesses where id='20000000-0000-4000-8000-000000000030') as worker_fixture_rolled_back;
