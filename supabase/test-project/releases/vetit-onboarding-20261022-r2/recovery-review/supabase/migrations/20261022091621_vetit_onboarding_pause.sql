-- Security-preserving pause, not a legacy downgrade. Separate explicit approval required.
begin;
set local lock_timeout='5s';set local statement_timeout='120s';
do $pause$begin
 if not exists(select 1 from pg_proc where oid=to_regprocedure('vetit_onboarding.validate_business(text,text,text,text,text,text)') and md5(prosrc)='54b0d3cac0e172b2599349422069880c' and prosecdef=false and proconfig=array['search_path=""']) then raise exception 'Onboarding schema drift';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('vetit_onboarding.guard_business_input()') and md5(prosrc)='e222634b6ec53a364791aaef56606794' and prosecdef=true and proconfig=array['search_path=""']) then raise exception 'Onboarding schema drift';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.onboard_seller_business_v2(text,text,text,text,text,text)') and md5(prosrc)='f242c81717128c5542d44d29767bbf48' and prosecdef=true and proconfig=array['search_path=""']) then raise exception 'Onboarding schema drift';end if;
if not exists(select 1 from pg_proc where oid=to_regprocedure('public.create_seller_business(text,text,text,text,text,text)') and md5(prosrc)='5b5f76496f112159963f6d26a864c5b9' and prosecdef=true and proconfig=array['search_path=""']) then raise exception 'Onboarding schema drift';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.businesses'::regclass and tgname='vetit_onboarding_validate_input' and tgenabled='O') then raise exception 'Validation trigger missing';end if;
end;$pause$;
revoke all on function public.create_seller_business(text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.onboard_seller_business_v2(text,text,text,text,text,text) from public,anon,authenticated,service_role;
-- Keep functions, private helpers, validation trigger, RLS, data and ledger intact.
commit;
