-- Composed with the proposed queue function in one transaction; synthetic only.
do $acceptance$
declare b uuid := '20000000-0000-4000-8000-000000000001'; l uuid; result jsonb; cursor_row jsonb;
begin
  if current_database()<>'vetit_disposable_corrections_20261018_1302' or current_user<>'vetit_test_admin' or inet_server_addr()<>'127.0.0.1'::inet or inet_server_port()<>55432 then raise exception 'Local disposable target required.';end if;
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
  perform set_config('request.jwt.claims','{}',true);
  set local role authenticated;
  l:=public.save_seller_product(null,b,'Synthetic queue fixture','synthetic-queue-20261019','Synthetic only','30000000-0000-4000-8000-000000000001',array['70000000-0000-4000-8000-000000000001'::uuid],100,'[]');
  begin perform public.admin_listing_queue('draft');raise exception 'Seller queue bypass.';exception when insufficient_privilege then null;end;
  perform set_config('request.jwt.claims','{"user_metadata":{"vetit_admin":true}}',true);
  begin perform public.admin_listing_queue('draft');raise exception 'Editable metadata bypass.';exception when insufficient_privilege then null;end;
  raise notice 'PASS seller and editable claim queue access denied';
  perform set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
  perform set_config('request.jwt.claims','{"app_metadata":{"vetit_admin":true}}',true);
  result:=public.admin_listing_queue('draft','product','IN',null,null,null,1);
  if jsonb_array_length(result->'items')<>1 or result->'items'->0->>'risk'<>'not_assessed' then raise exception 'Queue result invalid.';end if;
  if exists(select 1 from jsonb_array_elements(result->'items') r where r ? 'public_email' or r ? 'public_phone' or r ? 'legal_name') then raise exception 'Unnecessary personal fields returned.';end if;
  cursor_row:=result->'items'->0;
  result:=public.admin_listing_queue('draft','product','IN',null,(cursor_row->>'created_at')::timestamptz,(cursor_row->>'id')::uuid,1);
  if exists(select 1 from jsonb_array_elements(result->'items') r where r->>'id'=cursor_row->>'id') then raise exception 'Cursor repeated row.';end if;
  raise notice 'PASS trusted admin bounded cursor queue without contact data';
  begin perform public.admin_listing_queue('draft',null,null,null,null,null,51);raise exception 'Unbounded query accepted.';exception when invalid_parameter_value then null;end;
  begin perform public.admin_listing_queue('appealed');raise exception 'Unsupported status accepted.';exception when invalid_parameter_value then null;end;
  begin perform public.admin_listing_queue('draft',null,null,null,now(),null,1);raise exception 'Partial cursor accepted.';exception when invalid_parameter_value then null;end;
  raise notice 'PASS invalid filters and bounds denied';
  reset role;
  if not exists(select 1 from public.listings where id=l and moderation_status='draft') then raise exception 'Read queue mutated listing.';end if;
  if has_function_privilege('anon','public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer)','execute') then raise exception 'Anonymous execution granted.';end if;
  if not exists(select 1 from pg_proc where oid='public.admin_listing_queue(text,text,text,uuid,timestamptz,uuid,integer)'::regprocedure and prosecdef and provolatile='s' and proconfig=array['search_path=""']) then raise exception 'Function security attributes changed.';end if;
  raise notice 'PASS read-only state and definer execution hardening';
end;
$acceptance$;
