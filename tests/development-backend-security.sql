-- Local synthetic fixture regression AFTER the frozen thirteen-step package.
-- Install the two development proposals inside the SAME outer rollback transaction.
do $security$
declare customer uuid:='80000000-0000-4000-8000-000000002101'; result uuid;
 b uuid:='20000000-0000-4000-8000-000000000001'; a uuid; target uuid; child text; photo uuid:=gen_random_uuid();
begin
 if current_database()<>'vetit_disposable_corrections_20261020_1902' or session_user<>'vetit_test_admin'
 or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Retained local synthetic fixture required';end if;
 if exists(select 1 from auth.users where id=customer) then raise exception 'Synthetic ID exists; preserve it';end if;
 insert into auth.users(id,raw_user_meta_data) values(customer,'{"role":"admin","vetit_admin":true,"full_name":{"untrusted":"shape"}}');
 if not exists(select 1 from public.profiles where id=customer and role='customer') then raise exception 'Signup elevated role or omitted profile';end if;
 -- Delete only this just-created fixture profile to simulate a pre-trigger account.
 delete from public.profiles where id=customer;
 perform set_config('request.jwt.claim.sub',customer::text,true);perform set_config('request.jwt.claims','{}',true);
 set local role authenticated;
 result:=public.ensure_my_profile();
 if result<>customer or public.ensure_my_profile()<>customer then raise exception 'Profile repair/replay failed';end if;
 reset role;
 if not exists(select 1 from public.profiles where id=customer and role='customer' and full_name is null) then raise exception 'Profile repair trusts metadata permissions/shape';end if;
 if has_function_privilege('anon','public.ensure_my_profile()','EXECUTE') or has_table_privilege('authenticated','public.profiles','INSERT') then raise exception 'Profile escalation surface';end if;
 raise notice 'PASS signup role isolation, authenticated missing-profile repair and idempotent replay';
 perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
 set local role authenticated;
 begin perform public.save_seller_product(null,b,'Bad shape','dev-bad-variant','Synthetic only','30000000-0000-4000-8000-000000000001',array['70000000-0000-4000-8000-000000000001'::uuid],null,
 '[{"seller_sku":"BAD","option_attributes":{"size":7},"amount_minor":12000}]');raise exception 'Non-text option accepted';exception when invalid_parameter_value then null;end;
 a:=public.save_seller_product(null,b,'Security product','dev-security-product','Synthetic only','30000000-0000-4000-8000-000000000001',array['70000000-0000-4000-8000-000000000001'::uuid],null,
 '[{"seller_sku":"GOOD","option_attributes":{"size":"M"},"amount_minor":12000}]');
 target:=public.save_seller_product(null,b,'Target product','dev-security-target','Synthetic only','30000000-0000-4000-8000-000000000001',array['70000000-0000-4000-8000-000000000001'::uuid],12000,'[]');
 -- Even caller-supplied action settings do not grant direct table DML.
 perform set_config('vetit.seller_action','submit',true);
 begin update public.listings set moderation_status='submitted' where id=a;raise exception 'Direct submit bypass';exception when insufficient_privilege then null;end;
 perform public.moderation_open('product',a);
 reset role;
 perform set_config('vetit.seller_action','save',true);
 insert into public.listing_images(listing_id,storage_object_path) values(target,b::text||'/'||target::text||'/'||photo::text||'.jpg');
 -- Trigger guards, independent of client ACLs, reject parent movement.
 foreach child in array array['listing_prices','listing_species','listing_markets','product_variants'] loop
  begin execute format('update public.%I set listing_id=$1 where listing_id=$2',child) using target,a;raise exception 'Child movement accepted: %',child;exception when insufficient_privilege then null;end;
  if child<>'product_variants' then
   begin execute format('update public.%I set listing_id=$1 where listing_id=$2',child) using a,target;raise exception 'Child movement into review accepted: %',child;exception when insufficient_privilege then null;end;
  end if;
 end loop;
 begin update public.listing_images set listing_id=a where listing_id=target;raise exception 'Image movement into review accepted';exception when insufficient_privilege then null;end;
 if not exists(select 1 from public.listings where id=a and moderation_status='submitted') then raise exception 'Audited submission missing';end if;
 raise notice 'PASS typed variants, direct submission denial and immutable child parent boundaries';
 if not has_table_privilege('authenticated','public.fulfilment_events','SELECT')
 or has_table_privilege('anon','public.fulfilment_events','SELECT') then raise exception 'Data API exposure mismatch';end if;
 raise notice 'PASS explicit participant-read grant with no anonymous grant';
end;$security$;
