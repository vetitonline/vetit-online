-- Separate approval required. Stop product writes; never restore unsafe edits.
begin;
create or replace function vetit_catalogue.paused_product_writes()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (case when tg_op='DELETE' then old.kind else new.kind end)='product' then
  raise exception 'Catalogue writes paused for review' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function vetit_catalogue.paused_product_writes() from public,anon,authenticated,service_role;
create or replace trigger vetit_catalogue_paused before insert or update or delete on public.listings
 for each row execute function vetit_catalogue.paused_product_writes();
revoke all on function public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.submit_seller_product_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
-- Retain revision/child guards, hardened private core, RLS, data and ledger.
-- Product moderation/image changes also roll back on the paused parent. Reads
-- and service listings remain available. Resumption needs a new reviewed forward
-- migration; regranting RPC access alone does not remove this trigger.
commit;
