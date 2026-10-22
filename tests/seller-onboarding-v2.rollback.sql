-- Runner wraps this entire file in BEGIN/ROLLBACK on a new local clone only.
do $test$
declare actor uuid:='81000000-0000-4000-8000-000000002201'; other_actor uuid:='81000000-0000-4000-8000-000000002202';
 receipt jsonb; replay jsonb; business uuid; field text; bad text; changed integer; state text; extra_business uuid;
begin
 if inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 or session_user<>'vetit_test_admin'
 or current_database() !~ '^vetit_disposable_onboarding_[0-9_]+$' then raise exception 'Dedicated local clone required';end if;
 if exists(select 1 from auth.users where id in (actor,other_actor)) then raise exception 'Synthetic identifiers already exist; preserve them';end if;
 insert into auth.users(id,raw_user_meta_data) values(actor,'{"role":"admin"}'),(other_actor,'{}');
 -- Model an existing account predating signup provisioning, inside rollback.
 delete from public.profiles where id=actor;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claims','{}',true);
 set local role authenticated;
 receipt:=public.onboard_seller_business_v2('पशु Farm',null,'farm','owner@example.in','+91 98765 43210','https://example.in/shop');
 business:=(receipt->>'businessId')::uuid;
 if receipt->>'outcome'<>'created' or receipt->>'apiVersion'<>'2' then raise exception 'Creation receipt invalid';end if;
 replay:=public.onboard_seller_business_v2('Different retry name',null,'company',null,null,null);
 if replay->>'outcome'<>'reused' or (replay->>'businessId')::uuid<>business then raise exception 'Retry did not reuse business';end if;
 if public.create_seller_business('Legacy caller',null,'farm',null,null,null)<>business then raise exception 'Legacy RPC bypassed reuse';end if;
 reset role;
 if not exists(select 1 from public.profiles where id=actor and role='customer') then raise exception 'Profile missing or elevated';end if;
 if not exists(select 1 from public.businesses where id=business and display_name='पशु Farm' and verification_status='pending' and country_code='IN') then raise exception 'Retry overwrote business or bypassed pending state';end if;
 if (select count(*) from public.business_memberships where profile_id=actor and member_role='owner')<>1 then raise exception 'Duplicate owner business';end if;
 update public.profiles set full_name='Preserved profile' where id=actor;
 set local role authenticated;
 perform public.onboard_seller_business_v2('Replay',null,'farm',null,null,null);
 reset role;
 if not exists(select 1 from public.profiles where id=actor and full_name='Preserved profile') then raise exception 'Profile overwritten';end if;
 raise notice 'PASS new/missing profile, safe defaults, created/reused, changed-payload replay, legacy compatibility';

 -- All restricted ownership states block BOTH entry points, without creating replacements.
 foreach state in array array['inactive','archived','rejected','suspended','membership_removed','membership_suspended'] loop
  perform set_config('vetit.seller_action','business_moderation',true);
  -- Temporarily disable only this clone's known existing guard for fixture setup.
  -- The test is admin-only and all changes including trigger state roll back.
  alter table public.businesses disable trigger guard_seller_business_verification;
  alter table public.businesses disable trigger moderation_verification_gate;
  update public.businesses set is_active=state<>'inactive',archived_at=case when state='archived' then now() else null end,
   verification_status=case when state in ('rejected','suspended') then state else 'pending' end where id=business;
  alter table public.businesses enable trigger guard_seller_business_verification;
  alter table public.businesses enable trigger moderation_verification_gate;
  update public.business_memberships set membership_status=case state when 'membership_removed' then 'removed' when 'membership_suspended' then 'suspended' else 'active' end where business_id=business and profile_id=actor;
  set local role authenticated;
  begin perform public.onboard_seller_business_v2('Replacement',null,'farm',null,null,null);raise exception 'Blocked ownership accepted';exception when insufficient_privilege then null;end;
  begin perform public.create_seller_business('Replacement',null,'farm',null,null,null);raise exception 'Legacy bypass';exception when insufficient_privilege then null;end;
  reset role;
 end loop;
 if (select count(*) from public.business_memberships where profile_id=actor and member_role='owner')<>1 then raise exception 'Blocked owner obtained replacement';end if;
 raise notice 'PASS blocked business/membership retries deny both RPCs';

 perform set_config('request.jwt.claim.sub',other_actor::text,true);
 set local role authenticated;
 foreach field in array array['email','phone','url','type'] loop
  foreach bad in array case field
   when 'email' then array['bad','x@'||repeat('a',250)||'.in']
   when 'phone' then array['abcdefg','123456','1234567890123456']
   when 'url' then array['https://user:pass@example.in','https://example.in/has space','javascript:alert(1)','https://example.in:70000','https://[:::]/','https://example.in/'||repeat('a',2048)]
   else array['clinic','service_provider','admin'] end loop
   begin
    perform public.onboard_seller_business_v2('Valid farm',null,case when field='type' then bad else 'farm' end,
     case when field='email' then bad end,case when field='phone' then bad end,case when field='url' then bad end);
    raise exception 'Invalid direct RPC input accepted: %',field;
   exception when invalid_parameter_value then null;end;
  end loop;
 end loop;
 -- Invalid submissions must not provision business/profile side effects.
 reset role;
 if exists(select 1 from public.business_memberships where profile_id=other_actor) then raise exception 'Invalid request created ownership';end if;
 raise notice 'PASS direct RPC email/phone/website/type validation';

 -- Direct allowed-column updates use the same validator, independent of browser code.
 perform set_config('request.jwt.claim.sub',actor::text,true);
 update public.business_memberships set membership_status='active' where business_id=business and profile_id=actor;
 set local role authenticated;
 begin update public.businesses set public_phone='abcdefg' where id=business;raise exception 'Direct invalid phone accepted';exception when invalid_parameter_value then null;end;
 begin update public.businesses set website_url='https://user:pass@example.in' where id=business;raise exception 'Direct credential URL accepted';exception when invalid_parameter_value then null;end;
 begin update public.businesses set verification_status='verified' where id=business;raise exception 'Verification privilege widened';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.onboard_seller_business_v2('Anonymous',null,'farm',null,null,null);raise exception 'Missing identity accepted';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','81000000-0000-4000-8000-000000002299',true);
 begin perform public.onboard_seller_business_v2('Absent account',null,'farm',null,null,null);raise exception 'Unknown account accepted';exception when insufficient_privilege then null;end;
 reset role;
 if has_function_privilege('anon','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE')
 or has_function_privilege('service_role','public.onboard_seller_business_v2(text,text,text,text,text,text)','EXECUTE')
 or has_schema_privilege('authenticated','vetit_onboarding','USAGE') then raise exception 'Private/anonymous privilege widened';end if;
 raise notice 'PASS direct update validation, role isolation, absent identity/account and private ACLs';

 perform set_config('request.jwt.claim.sub',other_actor::text,true);
 set local role authenticated;
 update public.businesses set display_name='Cross-account hijack' where id=business;
 get diagnostics changed=row_count;
 if changed<>0 then raise exception 'Cross-account update succeeded';end if;
 receipt:=public.onboard_seller_business_v2('Separate farm',null,'farm',null,null,null);
 if (receipt->>'businessId')::uuid=business or receipt->>'outcome'<>'created' then raise exception 'Another account reused victim ownership';end if;
 reset role;
 insert into public.businesses(display_name,business_type) values('Synthetic second owner business','farm') returning id into extra_business;
 insert into public.business_memberships(business_id,profile_id,member_role,membership_status) values(extra_business,actor,'owner','active');
 perform set_config('request.jwt.claim.sub',actor::text,true);
 set local role authenticated;
 begin perform public.onboard_seller_business_v2('Ambiguous retry',null,'farm',null,null,null);raise exception 'Ambiguous ownership accepted';exception when cardinality_violation then null;end;
 reset role;
 raise notice 'PASS cross-account isolation and ambiguous owner businesses fail closed';
end;$test$;
