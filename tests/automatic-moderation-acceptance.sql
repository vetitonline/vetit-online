-- Runner applies step 10 inside this rollback-only transaction; synthetic only.
create function vetit_moderation.synthetic_auto_fixture(k text,cat uuid,suffix text,permit boolean,classification text) returns uuid language plpgsql set search_path='' as $$
declare s uuid; c vetit_moderation.cases%rowtype; result jsonb; path text; code text; b uuid:='20000000-0000-4000-8000-000000000001';
begin
 insert into vetit_moderation.policies(version,subject_kind,market,category_id,classification,automatic_eligible) values('synthetic-auto-'||suffix,k,'IN',cat,classification,permit);
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);set local role authenticated;
 if k='product' then s:=public.save_seller_product(null,b,'Synthetic auto '||suffix,'synthetic-auto-'||replace(suffix,'_','-'),'Synthetic only',cat,array['70000000-0000-4000-8000-000000000001'::uuid],12000,'[]');
 else s:=public.save_seller_service(null,b,'Synthetic auto '||suffix,'synthetic-auto-'||replace(suffix,'_','-'),'Synthetic only',cat,array['70000000-0000-4000-8000-000000000001'::uuid],12000,30,null,'remote');end if;
 reset role;
 path:=b::text||'/'||s::text||'/'||gen_random_uuid()::text||'.jpg';perform set_config('vetit.seller_action','save',true);
 insert into public.listing_images(listing_id,storage_object_path) values(s,path);insert into storage.objects(bucket_id,name) values('listing-images',path);
 set local role authenticated;result:=public.moderation_open(k,s);reset role;
 select * into c from vetit_moderation.cases where id=(result->>'caseId')::uuid;
 foreach code in array array['content','images','legal','credentials'] loop set local role service_role;perform public.moderation_attest(c.id,c.revision,c.policy_id,code,'passed','synthetic_only',now()+interval '1 hour',gen_random_uuid());reset role;end loop;
 return c.id;
end;$$;
do $accept$
declare cid uuid; cat uuid; c vetit_moderation.cases%rowtype; result jsonb; expected bigint; req uuid; initial_result jsonb; category uuid:='30000000-0000-4000-8000-000000000001'; classification text; path text;
begin
 if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Wrong disposable target.';end if;
 if (select approval_enabled or publication_enabled from vetit_moderation.automation_controls where singleton) then raise exception 'Automation is not disabled by default.';end if;
 cid:=vetit_moderation.synthetic_auto_fixture('product',category,'ordinary',true,'ordinary');select * into c from vetit_moderation.cases where id=cid;
 set local role service_role;result:=public.moderation_auto_approve(cid,c.version,gen_random_uuid());reset role;
 if result->>'outcome'<>'disabled' or exists(select 1 from vetit_moderation.automatic_approvals where case_id=cid) then raise exception 'Default automation activated.';end if;
 set local role authenticated;
 begin perform public.moderation_auto_approve(cid,c.version,gen_random_uuid());raise exception 'Seller invoked automatic approver.';exception when insufficient_privilege then null;end;
 reset role;
 update vetit_moderation.automation_controls set approval_enabled=true where singleton;
 begin update vetit_moderation.automation_controls set publication_enabled=true where singleton;raise exception 'Automatic publication activated.';exception when check_violation then null;end;
 expected:=c.version;req:=gen_random_uuid();set local role service_role;
 result:=public.moderation_auto_approve(cid,expected,req);initial_result:=result;
 if result->>'outcome'<>'approved' or result->>'published'<>'false' or result is distinct from public.moderation_auto_approve(cid,expected,req) then raise exception 'Automatic decision/replay failure.';end if;
 begin perform public.moderation_auto_approve(cid,expected,gen_random_uuid());raise exception 'Competing stale automatic decision accepted.';exception when serialization_failure then null;end;
 reset role;
 if (select count(*) from vetit_moderation.events where request_id=req)<>1 or not exists(select 1 from public.listings where id=c.subject_id and moderation_status='submitted') then raise exception 'Duplicate audit or automatic publication.';end if;
 if vetit_moderation.automatic_status(cid)->>'status'<>'approved' then raise exception 'Approval status missing.';end if;
 begin update vetit_moderation.automatic_approvals set valid_until=now() where case_id=cid;raise exception 'Automatic history was mutable.';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);set local role authenticated;
 begin perform public.review_seller_listing(c.subject_id,'publish');raise exception 'Automatic approval bypassed human publication gate.';exception when insufficient_privilege then null;end;
 reset role;select * into c from vetit_moderation.cases where id=cid;
 set local role service_role;perform public.moderation_attest(cid,c.revision,c.policy_id,'content','uncertain','synthetic_only',now()+interval '1 hour',gen_random_uuid());reset role;
 select * into c from vetit_moderation.cases where id=cid;
 if vetit_moderation.automatic_status(cid)->>'status'<>'review_required' then raise exception 'Uncertain evidence kept approval current.';end if;
 set local role service_role;result:=public.moderation_auto_approve(cid,c.version,gen_random_uuid());reset role;
 if result->>'outcome'<>'review_required' then raise exception 'Uncertain submission approved.';end if;
 set local role service_role;perform public.moderation_attest(cid,c.revision,c.policy_id,'content','passed','synthetic_only',now()+interval '1 hour',gen_random_uuid());reset role;
 select * into c from vetit_moderation.cases where id=cid;set local role authenticated;
 result:=public.moderation_decide(cid,c.version,'approve',gen_random_uuid());reset role;
 if not exists(select 1 from public.listings where id=c.subject_id and moderation_status='published') then raise exception 'Human publication regression.';end if;
 raise notice 'PASS default-off/service-only approval, replay/conflicts, immutable audit, uncertainty and separate publication gate';

 foreach classification in array array['regulated','veterinary','live_animal','prohibited','ordinary'] loop
   cat:=gen_random_uuid();insert into public.categories(id,name,slug,kind) values(cat,'Synthetic auto category '||classification,'synthetic-auto-'||replace(classification,'_','-'),'both');
   cid:=vetit_moderation.synthetic_auto_fixture('product',cat,'category-'||classification,classification<>'ordinary',classification);select * into c from vetit_moderation.cases where id=cid;
   set local role service_role;result:=public.moderation_auto_approve(cid,c.version,gen_random_uuid());reset role;
   if result->>'outcome'<>'review_required' or exists(select 1 from vetit_moderation.automatic_approvals where case_id=cid) then raise exception 'Restricted/prohibited/policy-disabled category auto-approved.';end if;
 end loop;
 raise notice 'PASS regulated/veterinary/live-animal/prohibited and policy-disabled exclusions';

 insert into public.provider_profiles(business_id,provider_type,credential_verification_status) values('20000000-0000-4000-8000-000000000001','groomer','not_required') on conflict(business_id) do nothing;
 cat:=gen_random_uuid();insert into public.categories(id,name,slug,kind) values(cat,'Synthetic ordinary service','synthetic-auto-service','service');
 cid:=vetit_moderation.synthetic_auto_fixture('service',cat,'ordinary-service',true,'ordinary');select * into c from vetit_moderation.cases where id=cid;
 set local role service_role;result:=public.moderation_auto_approve(cid,c.version,gen_random_uuid());reset role;
 if result->>'outcome'<>'approved' then raise exception 'Ordinary verified service did not auto-approve.';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);perform set_config('request.jwt.claims','{}',true);set local role authenticated;
 result:=public.moderation_status('service',c.subject_id);
 if result->'case'->'automaticApproval'->>'status'<>'approved' then raise exception 'Seller approval status missing.';end if;
 reset role;select storage_object_path into path from public.listing_images where listing_id=c.subject_id limit 1;
 if public.can_write_service_image(path) then raise exception 'Submitted service storage write allowed.';end if;
 if public.can_read_service_image(path) is not true then raise exception 'Owner cannot read service image.';end if;
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
 if public.can_write_service_image(path) or public.can_read_service_image(path) then raise exception 'Outsider accessed private service image.';end if;
 update vetit_moderation.automation_controls set approval_enabled=false where singleton;
 if vetit_moderation.automatic_status(cid)->>'status'<>'review_required' or (select count(*) from vetit_moderation.automation_control_events)<3 then raise exception 'Kill switch or control audit failed.';end if;
 if has_function_privilege('anon','public.moderation_auto_approve(uuid,bigint,uuid)','execute') or has_table_privilege('service_role','vetit_moderation.automatic_approvals','INSERT') then raise exception 'Approval privilege leak.';end if;
 raise notice 'PASS ordinary service approval, seller metadata, storage visibility/locking and audited kill switch';
end;
$accept$;
