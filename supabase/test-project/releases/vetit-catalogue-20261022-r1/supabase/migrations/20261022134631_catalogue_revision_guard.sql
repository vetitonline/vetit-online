-- Forward-only coordinated Test candidate. NOT hosted-applied.
-- Requires the reviewed seller/price/moderation/onboarding corrections first.
-- Retains their bodies and RLS; never replay an older save routine after this.
begin;
create schema if not exists vetit_catalogue;
revoke all on schema vetit_catalogue from public, anon, authenticated, service_role;

-- Capture the installed hardened body once, without changing its authorization,
-- JSONB validation, price history, blocked-owner or moderation protections.
do $capture$
declare definition text;
begin
 if to_regprocedure('vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)') is null then
  definition:=pg_get_functiondef('public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb)'::regprocedure);
  if position('jsonb_object_length' in definition)>0 or position('jsonb_object_keys' in definition)=0
     or position('for share' in lower(definition))=0 or position('for update' in lower(definition))=0
     or position('price_effective_at' in definition)=0 then
   raise exception 'Reviewed hardened seller/price prerequisites required';
  end if;
  execute replace(definition,'FUNCTION public.save_seller_product(', 'FUNCTION vetit_catalogue.save_core(');
 end if;
end;$capture$;
revoke all on function vetit_catalogue.save_core(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) from public,anon,authenticated,service_role;

alter table public.listings add column if not exists catalogue_revision bigint not null default 1;
grant select(catalogue_revision) on public.listings to authenticated;
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='public.listings'::regclass and conname='listings_catalogue_revision_positive') then
  alter table public.listings add constraint listings_catalogue_revision_positive check(catalogue_revision>0);
 end if;
end;$$;

-- INVOKER deliberately observes the writer, not a privileged trigger owner.
-- PostgREST table writes cannot bypass the versioned RPC via old column grants.
create or replace function vetit_catalogue.parent_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (case when tg_op='DELETE' then old.kind else new.kind end)='product'
    and current_user in ('authenticated','anon') then
  raise exception 'Versioned catalogue RPC required' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;
 if tg_op='INSERT' then
  if new.catalogue_revision<>1 then raise exception 'Server revision required' using errcode='22023';end if;
 else
  if new.catalogue_revision is distinct from old.catalogue_revision then
   raise exception 'Server revision required' using errcode='42501';
  end if;
  if old.catalogue_revision=9223372036854775807 then raise exception 'Revision exhausted' using errcode='22003';end if;
  new.catalogue_revision:=old.catalogue_revision+1;
 end if;
 return new;
end;$$;
revoke all on function vetit_catalogue.parent_revision() from public,anon,authenticated,service_role;
create or replace trigger vetit_catalogue_revision before insert or update or delete on public.listings
 for each row execute function vetit_catalogue.parent_revision();

create or replace function vetit_catalogue.child_revision()
returns trigger language plpgsql security invoker set search_path='' as $$
declare parent_id uuid; parent_kind text;
begin
 parent_id:=case when tg_op='DELETE' then old.listing_id else new.listing_id end;
 -- Existing guard_seller_catalog_mutations is definer and already locks and
 -- validates this direct reservation. Do not demand parent UPDATE privileges
 -- from a caller authorized only for guarded image insertion.
 if tg_table_name='listing_images' and tg_op='INSERT' and current_user='authenticated' then return new;end if;
 if tg_op='UPDATE' and new.listing_id is distinct from old.listing_id then
  raise exception 'Listing parent cannot change' using errcode='42501';
 end if;
 select l.kind into parent_kind from public.listings l where l.id=parent_id for update;
 if parent_kind='product' and current_user in ('authenticated','anon')
    and not (tg_table_name='listing_images' and tg_op='INSERT') then
  raise exception 'Catalogue child RPC required' using errcode='42501';
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function vetit_catalogue.child_revision() from public,anon,authenticated,service_role;
-- Existing guarded image reservations use direct INSERT. Preserve that interface;
-- only their invalidation uses definer rights. Existing RLS/path/count guards run.
create or replace function vetit_catalogue.bump_child_revision()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent_id uuid;
begin
 parent_id:=case when tg_op='DELETE' then old.listing_id else new.listing_id end;
 update public.listings set updated_at=updated_at where id=parent_id and kind='product';
 if tg_op='DELETE' then return old;end if;return new;
end;$$;
revoke all on function vetit_catalogue.bump_child_revision() from public,anon,authenticated,service_role;
do $triggers$
declare t text;
begin
 foreach t in array array['listing_species','product_variants','listing_prices','listing_images'] loop
  execute format('create or replace trigger vetit_catalogue_child_lock before insert or update or delete on public.%I for each row execute function vetit_catalogue.child_revision()',t);
  execute format('create or replace trigger vetit_catalogue_child_revision after insert or update or delete on public.%I for each row execute function vetit_catalogue.bump_child_revision()',t);
 end loop;
end;$triggers$;

create or replace function vetit_catalogue.lock_edit(p_business_id uuid,p_listing_id uuid,p_expected_revision text)
returns void language plpgsql security invoker set search_path='' as $$
declare current_listing public.listings%rowtype; requester uuid:=auth.uid();
begin
 if requester is null then raise exception 'Catalogue access denied' using errcode='42501';end if;
 perform b.id from public.businesses b where b.id=p_business_id and b.is_active and b.archived_at is null
  and b.verification_status not in ('rejected','suspended') for share;
 if not found then raise exception 'Catalogue access denied' using errcode='42501';end if;
 perform m.business_id from public.business_memberships m where m.business_id=p_business_id and m.profile_id=requester
  and m.membership_status='active' and m.member_role in ('owner','admin','catalog_manager') for share;
 if not found then raise exception 'Catalogue access denied' using errcode='42501';end if;
 if p_listing_id is null then
  if p_expected_revision is not null then raise exception 'Creation cannot have a revision' using errcode='22023';end if;
  return;
 end if;
 select l.* into current_listing from public.listings l where l.id=p_listing_id and l.business_id=p_business_id for update;
 if not found or current_listing.kind<>'product' or current_listing.archived_at is not null
   or current_listing.moderation_status not in ('draft','rejected') then
  raise exception 'Catalogue access denied' using errcode='42501';
 end if;
 -- Compare opaque text after locking; never cast untrusted/overflow input.
 if p_expected_revision is null or p_expected_revision !~ '^[1-9][0-9]{0,18}$'
    or length(p_expected_revision)=19 and p_expected_revision>'9223372036854775807' then
  raise exception 'Current revision required' using errcode='PT409';
 end if;
 if current_listing.catalogue_revision::text<>p_expected_revision then
  raise exception 'Catalogue changed; refresh and review' using errcode='PT409';
 end if;
end;$$;
revoke all on function vetit_catalogue.lock_edit(uuid,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.save_seller_product_v2(
 p_listing_id uuid,p_business_id uuid,p_title text,p_slug text,p_description text,
 p_category_id uuid,p_species_ids uuid[],p_base_amount_minor bigint,p_variants jsonb,p_expected_revision text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare saved uuid; revision text;
begin
 perform vetit_catalogue.lock_edit(p_business_id,p_listing_id,p_expected_revision);
 saved:=vetit_catalogue.save_core(p_listing_id,p_business_id,p_title,p_slug,p_description,p_category_id,p_species_ids,p_base_amount_minor,p_variants);
 select l.catalogue_revision::text into revision from public.listings l where l.id=saved;
 return jsonb_build_object('apiVersion',2,'listingId',saved,'revision',revision);
end;$$;
revoke all on function public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.save_seller_product_v2(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb,text) to authenticated;

-- Legacy creation remains compatible; legacy edits fail closed, never upgrade
-- a stale timestamp to a fresh revision on behalf of an old client.
create or replace function public.save_seller_product(
 p_listing_id uuid,p_business_id uuid,p_title text,p_slug text,p_description text,
 p_category_id uuid,p_species_ids uuid[],p_base_amount_minor bigint,p_variants jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if p_listing_id is not null then raise exception 'Revision contract required' using errcode='PT409';end if;
 return (public.save_seller_product_v2(null,p_business_id,p_title,p_slug,p_description,p_category_id,p_species_ids,p_base_amount_minor,p_variants,null)->>'listingId')::uuid;
end;$$;
revoke all on function public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.save_seller_product(uuid,uuid,text,text,text,uuid,uuid[],bigint,jsonb) to authenticated;

create or replace function public.submit_seller_product_v2(p_business_id uuid,p_listing_id uuid,p_expected_revision text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare revision text;
begin
 if p_listing_id is null then raise exception 'Listing required' using errcode='22023';end if;
 perform vetit_catalogue.lock_edit(p_business_id,p_listing_id,p_expected_revision);
 perform public.moderation_open('product',p_listing_id);
 select l.catalogue_revision::text into revision from public.listings l where l.id=p_listing_id;
 return jsonb_build_object('apiVersion',2,'listingId',p_listing_id,'revision',revision);
end;$$;
revoke all on function public.submit_seller_product_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_seller_product_v2(uuid,uuid,text) to authenticated;
-- No tables/policies/default privileges or broad Data API grants are added.
commit;
