-- Explicit local acceptance fixture; retained, not deleted or hosted.
do $setup$
declare b uuid:='20000000-0000-4000-8000-000000000029'; c vetit_moderation.cases%rowtype; result jsonb; code text;
begin
 if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong local target.';end if;
 if exists(select 1 from public.businesses where id=b) then raise exception 'Concurrency fixture already exists; refusing reuse.';end if;
 insert into vetit_moderation.reviewers(profile_id,enabled) values('10000000-0000-4000-8000-000000000007',true);
 insert into vetit_moderation.policies(version,subject_kind,market,business_type,classification,automatic_eligible) values('synthetic-concurrency-local-20261019','seller','IN','other','ordinary',false);
 insert into public.businesses(id,display_name,business_type,public_email) values(b,'Synthetic concurrent moderation applicant 20261019','other','synthetic@example.invalid');
 insert into public.business_memberships(business_id,profile_id,member_role) values(b,'10000000-0000-4000-8000-000000000001','owner');
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);set local role authenticated;
 result:=public.moderation_open('seller',b);reset role;
 select * into c from vetit_moderation.cases where id=(result->>'caseId')::uuid;
 foreach code in array array['content','legal'] loop set local role service_role;perform public.moderation_attest(c.id,c.revision,c.policy_id,code,'passed','synthetic_only',now()+interval '1 hour',gen_random_uuid());reset role;end loop;
 select * into c from vetit_moderation.cases where id=c.id;
 set local role authenticated;result:=public.moderation_decide(c.id,c.version,'screen',gen_random_uuid());reset role;
 if result->>'state'<>'screened' then raise exception 'Synthetic manual-review fixture not ready.';end if;
end;
$setup$;
