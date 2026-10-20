-- PREPARED ONLY: synthetic local regression, not a migration or hosted script.
-- Requires the retained corrections fixture database and its existing owner role.
-- No schema installation, reset, deletion or persistent data changes; always rollback.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
do $acceptance$
declare
  business uuid := '20000000-0000-4000-8000-000000000001';
  category uuid := '30000000-0000-4000-8000-000000000001';
  species uuid := '70000000-0000-4000-8000-000000000001';
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  signup_id uuid := '80000000-0000-4000-8000-000000000901';
  first_id uuid; second_id uuid; variant_listing uuid; option_value jsonb; child_table text;
begin
  if current_database() <> 'vetit_disposable_corrections_20261018_1302' or inet_server_addr() <> '127.0.0.1'::inet or inet_server_port() <> 55432 then raise exception 'Dedicated loopback synthetic fixture database required.'; end if;
  if current_user <> 'vetit_test_admin' then raise exception 'Dedicated local fixture owner required.'; end if;
  if exists(select 1 from auth.users where id=signup_id) then raise exception 'Synthetic signup ID already exists; do not overwrite.'; end if;
  insert into auth.users(id,raw_user_meta_data) values(signup_id,'{"full_name":"Synthetic signup","role":"admin","vetit_admin":true}');
  if not exists(select 1 from public.profiles where id=signup_id and role='customer' and full_name='Synthetic signup') then raise exception 'Signup profile/default-role regression.'; end if;
  if has_column_privilege('authenticated','public.profiles','role','UPDATE') then raise exception 'Profile role is client editable.'; end if;
  raise notice 'PASS signup profile and metadata role isolation';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{}',true);
  first_id := public.save_seller_product(null,business,'Synthetic acceptance A','synthetic-acceptance-a','Synthetic only',category,array[species],12000,'[]');
  second_id := public.save_seller_product(null,business,'Synthetic acceptance B','synthetic-acceptance-b','Synthetic only',category,array[species],12000,'[]');
  for option_value in select value from jsonb_array_elements('[null,7,true,{"nested":"value"},["value"]]'::jsonb) loop
    begin
      perform public.save_seller_product(null,business,'Synthetic invalid','synthetic-invalid-options','Synthetic only',category,array[species],null,jsonb_build_array(jsonb_build_object('seller_sku','SYNTHETIC','option_attributes',jsonb_build_object('size',option_value),'amount_minor',12000)));
      raise exception 'Non-text option value was accepted.';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  variant_listing := public.save_seller_product(null,business,'Synthetic acceptance variant','synthetic-acceptance-variant','Synthetic only',category,array[species],null,'[{"seller_sku":"SYNTHETIC-VARIANT","option_attributes":{"size":"M"},"amount_minor":12000}]');
  -- All assertions share one rollback-only transaction, so now() is constant.
  -- Make only these new fixture prices historical before testing a later edit;
  -- closing a price created at this same now() would violate validity ordering.
  perform set_config('vetit.seller_action','save',true);
  update public.listing_prices set valid_from=now()-interval '1 day' where listing_id in (first_id,second_id,variant_listing);
  raise notice 'PASS typed variant JSON values';
  perform set_config('vetit.seller_action','save',true);
  update public.listing_prices set status='inactive' where listing_id=second_id;
  begin
    perform public.submit_seller_product(business,second_id);
    raise exception 'Submission accepted without an active price.';
  exception when invalid_parameter_value then null;
  end;
  if not exists(select 1 from public.listings where id=second_id and moderation_status='draft') then raise exception 'Failed submission changed review state.'; end if;
  perform public.submit_seller_product(business,first_id);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  perform public.review_seller_listing(first_id,'publish');
  perform public.submit_seller_product(business,variant_listing);
  perform public.review_seller_listing(variant_listing,'reject');
  perform set_config('request.jwt.claims','{}',true);
  perform public.save_seller_product(variant_listing,business,'Synthetic revised variant','synthetic-acceptance-variant','Synthetic only',category,array[species],null,'[{"seller_sku":"SYNTHETIC-VARIANT","option_attributes":{"size":"M"},"amount_minor":12000}]');
  -- Expected to fail under the old guard; succeeds only after the separately
  -- reviewed supplemental resubmission definition has been installed locally.
  perform public.submit_seller_product(business,variant_listing);
  if not exists(select 1 from public.listings where id=variant_listing and moderation_status='submitted' and moderated_by is null and moderated_at is null) then raise exception 'Rejected listing resubmission regression.'; end if;
  raise notice 'PASS rejected listing resubmission';
  perform set_config('vetit.seller_action','save',true);
  begin update public.listings set title='Forbidden published edit' where id=first_id; raise exception 'Published title edit accepted.'; exception when insufficient_privilege then null; end;
  begin update public.listings set description='Forbidden published edit' where id=first_id; raise exception 'Published description edit accepted.'; exception when insufficient_privilege then null; end;
  begin update public.listings set slug='forbidden-published-edit' where id=first_id; raise exception 'Published slug edit accepted.'; exception when insufficient_privilege then null; end;
  begin update public.listings set category_id='30000000-0000-4000-8000-000000000999' where id=first_id; raise exception 'Published category edit accepted.'; exception when insufficient_privilege then null; end;
  raise notice 'PASS submission validation and published field protection';
  foreach child_table in array array['listing_markets','listing_species','listing_prices'] loop
    begin execute format('update public.%I set listing_id=$1 where listing_id=$2',child_table) using second_id,first_id; raise exception 'OLD published parent reparent accepted.'; exception when insufficient_privilege then null; end;
    begin execute format('update public.%I set listing_id=$1 where listing_id=$2',child_table) using first_id,second_id; raise exception 'NEW published parent reparent accepted.'; exception when insufficient_privilege then null; end;
  end loop;
  begin update public.product_variants set listing_id=first_id where listing_id=variant_listing; raise exception 'Variant reparent accepted.'; exception when insufficient_privilege then null; end;
  insert into public.listing_images(listing_id,storage_object_path,visibility_status) values(second_id,business::text||'/'||second_id::text||'/80000000-0000-4000-8000-000000000902.jpg','visible');
  begin update public.listing_images set listing_id=first_id where listing_id=second_id; raise exception 'Image reparent accepted.'; exception when insufficient_privilege then null; end;
  raise notice 'PASS immutable child parent boundaries';
  if has_table_privilege('authenticated','public.listings','INSERT') or has_table_privilege('authenticated','public.listings','UPDATE') or has_table_privilege('authenticated','public.listing_prices','UPDATE') then raise exception 'Direct listing DML is granted.'; end if;
  raise notice 'PASS direct client write revocation';
end;
$acceptance$;
rollback;
