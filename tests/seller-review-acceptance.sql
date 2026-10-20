-- LOCAL ONLY, synthetic fixtures, rollback only. Never a hosted test/seed script.
-- The runner composes the versioned guard inside this same outer transaction.
\set ON_ERROR_STOP on
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
do $review_acceptance$
declare
  owner_id uuid := '10000000-0000-4000-8000-000000000001';
  business_admin uuid := '10000000-0000-4000-8000-000000000002';
  suspended_id uuid := '10000000-0000-4000-8000-000000000005';
  outsider_id uuid := '10000000-0000-4000-8000-000000000006';
  platform_admin uuid := '10000000-0000-4000-8000-000000000007';
  business uuid := '20000000-0000-4000-8000-000000000001';
  category uuid := '30000000-0000-4000-8000-000000000001';
  species uuid := '70000000-0000-4000-8000-000000000001';
  listing uuid;
begin
  if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Dedicated local fixture target required.';end if;
  if exists(select 1 from public.listings where slug='synthetic-review-lifecycle-20261019') then raise exception 'Fixture already exists; refusing reuse.';end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{}',true);
  set local role authenticated;
  listing:=public.save_seller_product(null,business,'Synthetic review lifecycle','synthetic-review-lifecycle-20261019','Synthetic only',category,array[species],12000,'[]');
  if not exists(select 1 from public.listings where id=listing and moderation_status='draft') then raise exception 'Draft creation failed.';end if;
  raise notice 'PASS authenticated owner creates private draft';

  begin perform public.review_seller_listing(listing,'publish');raise exception 'Seller self-approval accepted.';exception when insufficient_privilege then null;end;
  begin update public.listings set moderation_status='published' where id=listing;raise exception 'Direct status write accepted.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',business_admin::text,true);
  begin perform public.review_seller_listing(listing,'reject');raise exception 'Business admin became platform moderator.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',platform_admin::text,true);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  begin perform public.review_seller_listing(listing,'publish');raise exception 'Draft approved before submission.';exception when invalid_parameter_value then null;end;
  raise notice 'PASS self-approval, direct writes, business-admin elevation and early approval denied';

  perform set_config('request.jwt.claims','{}',true);
  perform set_config('request.jwt.claim.sub',outsider_id::text,true);
  if exists(select 1 from public.listings where id=listing) then raise exception 'Outsider can read private draft.';end if;
  begin perform public.submit_seller_product(business,listing);raise exception 'Outsider submitted listing.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',suspended_id::text,true);
  begin perform public.submit_seller_product(business,listing);raise exception 'Suspended membership submitted listing.';exception when insufficient_privilege then null;end;
  raise notice 'PASS outsider privacy and outsider/suspended submission denied';

  -- One transaction has one now(); backdate only this newly-created fixture price.
  reset role;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('vetit.seller_action','save',true);
  update public.listing_prices set valid_from=now()-interval '1 day' where listing_id=listing;
  set local role authenticated;
  perform public.submit_seller_product(business,listing);
  if not exists(select 1 from public.listings where id=listing and moderation_status='submitted') then raise exception 'Submission failed.';end if;
  begin perform public.save_seller_product(listing,business,'Forbidden submitted edit','synthetic-review-lifecycle-20261019','Synthetic only',category,array[species],12000,'[]');raise exception 'Submitted listing editable.';exception when insufficient_privilege then null;end;
  raise notice 'PASS draft submission and submitted-content lock';

  perform set_config('request.jwt.claim.sub',platform_admin::text,true);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  perform public.review_seller_listing(listing,'reject');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{}',true);
  if not exists(select 1 from public.listings where id=listing and moderation_status='rejected' and moderated_by=platform_admin and moderated_at is not null) then raise exception 'Rejection metadata missing.';end if;
  perform public.save_seller_product(listing,business,'Synthetic corrected listing','synthetic-review-lifecycle-20261019','Corrected synthetic details',category,array[species],14000,'[]');
  perform public.submit_seller_product(business,listing);
  if not exists(select 1 from public.listings where id=listing and moderation_status='submitted' and title='Synthetic corrected listing' and moderated_by is null and moderated_at is null) then raise exception 'Resubmission did not clear only old review metadata.';end if;
  raise notice 'PASS trusted rejection, seller correction and clean resubmission';

  perform set_config('request.jwt.claims','{"user_metadata":{"vetit_admin":true}}',true);
  begin perform public.review_seller_listing(listing,'publish');raise exception 'Editable metadata granted moderation.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',platform_admin::text,true);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  perform public.review_seller_listing(listing,'publish');
  if not exists(select 1 from public.listings where id=listing and moderation_status='published' and moderated_by=platform_admin and moderated_at is not null) then raise exception 'Trusted approval failed.';end if;
  raise notice 'PASS editable admin claim rejected and trusted approval succeeds';

  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.save_seller_product(listing,business,'Forbidden published edit','synthetic-review-lifecycle-20261019','Synthetic only',category,array[species],14000,'[]');raise exception 'Published seller edit accepted.';exception when insufficient_privilege then null;end;
  begin perform public.submit_seller_product(business,listing);raise exception 'Published listing resubmitted.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claim.sub',platform_admin::text,true);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  begin perform public.review_seller_listing(listing,'reject');raise exception 'Published listing remoderated by submitted-only RPC.';exception when invalid_parameter_value then null;end;
  if not exists(select 1 from public.listings where id=listing and title='Synthetic corrected listing' and moderation_status='published') then raise exception 'Denied action changed published listing.';end if;
  reset role;
  raise notice 'PASS published locks and invalid post-approval transitions denied';
end;
$review_acceptance$;
rollback;
