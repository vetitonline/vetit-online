-- Additive Test-only proposal; not part of automatic migrations. No job or live
-- payment provider is activated. Requires reviewed atomic checkout/inventory.
begin;
do $$ begin
  if to_regprocedure('public.confirm_checkout_order(uuid)') is null then raise exception 'Atomic checkout prerequisite required.'; end if;
end $$;
create table vetit_checkout.lifecycle (
  order_id uuid primary key references public.orders(id),
  ttl_seconds integer not null check(ttl_seconds between 60 and 86400),
  expires_at timestamptz not null,
  expired_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default clock_timestamp()
);
create index checkout_lifecycle_due_idx on vetit_checkout.lifecycle(expires_at,order_id) where expired_at is null;
create table vetit_checkout.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references vetit_checkout.lifecycle(order_id),
  provider text not null check(provider ~ '^[a-z][a-z0-9_-]{1,31}$'),
  environment text not null default 'sandbox' check(environment='sandbox'),
  provider_reference text check(provider_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'),
  payment_id uuid not null unique default gen_random_uuid(),
  provider_status text not null default 'starting' check(provider_status in ('starting','pending','authorized','captured','failed','cancelled')),
  needs_review boolean not null default false,
  observed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  unique(provider,environment,provider_reference)
);
create table vetit_checkout.payment_observations (
  provider text not null,
  event_id text not null,
  attempt_id uuid not null references vetit_checkout.payment_attempts(id),
  observation jsonb not null,
  outcome text not null check(outcome in ('applied','stale','review_required')),
  created_at timestamptz not null default clock_timestamp(),
  primary key(provider,event_id)
);
create index checkout_payment_observations_attempt_idx on vetit_checkout.payment_observations(attempt_id,created_at desc);
alter table vetit_checkout.lifecycle enable row level security;
alter table vetit_checkout.payment_attempts enable row level security;
alter table vetit_checkout.payment_observations enable row level security;
revoke all on vetit_checkout.lifecycle,vetit_checkout.payment_attempts,vetit_checkout.payment_observations from public,anon,authenticated,service_role;

create function vetit_checkout.lifecycle_snapshot(p_order_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('orderId',o.id,'customerId',o.customer_profile_id,'orderStatus',o.order_status,
  'amountMinor',o.total_minor,'currencyCode',o.currency_code,'expiresAt',l.expires_at,'expiredAt',l.expired_at,
  'attempt',case when a.id is null then null else jsonb_build_object('id',a.id,'provider',a.provider,'reference',a.provider_reference,
   'status',a.provider_status,'needsReview',a.needs_review,'paymentId',a.payment_id) end)
 from public.orders o join vetit_checkout.lifecycle l on l.order_id=o.id left join vetit_checkout.payment_attempts a on a.order_id=o.id where o.id=p_order_id;
$$;
create function public.enroll_checkout_lifecycle(p_order_id uuid,p_ttl_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; saved vetit_checkout.lifecycle%rowtype; reserved_at timestamptz;
begin
 if p_ttl_seconds is null or p_ttl_seconds not between 60 and 86400 then raise exception 'Explicit reservation policy required.' using errcode='22023'; end if;
 select o.* into target from public.orders o join vetit_checkout.checkouts c on c.order_id=o.id where o.id=p_order_id for update of o;
 if not found then raise exception 'Checkout order not found.' using errcode='22023'; end if;
 select * into saved from vetit_checkout.lifecycle where order_id=p_order_id;
 if found then
  if saved.ttl_seconds<>p_ttl_seconds then raise exception 'Reservation policy is immutable.' using errcode='22023'; end if;
  return vetit_checkout.lifecycle_snapshot(p_order_id);
 end if;
 if target.order_status<>'pending' or exists(select 1 from public.payments where order_id=p_order_id) then raise exception 'Only a fresh unpaid pending checkout may be enrolled.' using errcode='22023'; end if;
 select min(created_at) into reserved_at from vetit_checkout.order_events where order_id=p_order_id and new_status='pending';
 if reserved_at is null then raise exception 'Reservation creation evidence required.' using errcode='23514'; end if;
 insert into vetit_checkout.lifecycle(order_id,ttl_seconds,expires_at) values(p_order_id,p_ttl_seconds,reserved_at+make_interval(secs=>p_ttl_seconds));
 return vetit_checkout.lifecycle_snapshot(p_order_id);
end $$;
create function public.get_checkout_lifecycle(p_order_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$ select vetit_checkout.lifecycle_snapshot(p_order_id); $$;

-- All public payment writes for enrolled orders serialize against cancellation,
-- expiry and confirmation. Only the registered immutable attempt can back them.
create function vetit_checkout.guard_lifecycle_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; attempt vetit_checkout.payment_attempts%rowtype; target_id uuid;
begin
 if tg_op='UPDATE' and old.order_id is distinct from new.order_id and
  (exists(select 1 from vetit_checkout.lifecycle where order_id=old.order_id) or exists(select 1 from vetit_checkout.lifecycle where order_id=new.order_id)) then
  raise exception 'Lifecycle payment parent is immutable.' using errcode='42501';
 end if;
 target_id:=case when tg_op='DELETE' then old.order_id else new.order_id end;
 select * into target from public.orders where id=target_id for update;
 if not exists(select 1 from vetit_checkout.lifecycle where order_id=target_id) then
  if tg_op='DELETE' then return old; else return new; end if;
 end if;
 if tg_op='DELETE' then raise exception 'Lifecycle payment evidence is immutable.' using errcode='42501'; end if;
 select * into attempt from vetit_checkout.payment_attempts where order_id=target_id;
 if not found or new.id<>attempt.payment_id or new.provider<>attempt.provider or new.provider_payment_reference is distinct from attempt.provider_reference
  or new.customer_profile_id<>target.customer_profile_id or new.booking_id is not null or new.amount_minor<>target.total_minor or new.currency_code<>target.currency_code then
  raise exception 'Registered payment binding required.' using errcode='42501';
 end if;
 if new.status in ('authorized','captured') and target.order_status not in ('pending','confirmed','processing','fulfilled') then raise exception 'Closed checkout requires manual payment reconciliation.' using errcode='42501'; end if;
 if tg_op='UPDATE' and old.status<>new.status and
   not ((old.status='pending' and new.status in ('authorized','captured','failed','cancelled')) or (old.status='authorized' and new.status in ('captured','failed','cancelled'))) then
  raise exception 'Payment status regression denied.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger checkout_lifecycle_payment_guard before insert or update or delete on public.payments for each row execute function vetit_checkout.guard_lifecycle_payment();

create function vetit_checkout.guard_lifecycle_order()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from vetit_checkout.lifecycle where order_id=old.id) then return new; end if;
 if old.order_status='pending' and new.order_status='cancelled' and
  (exists(select 1 from vetit_checkout.payment_attempts where order_id=old.id and (needs_review or provider_status not in ('failed','cancelled')))
   or exists(select 1 from public.payments where order_id=old.id and status in ('pending','authorized','captured'))) then
  raise exception 'Verified terminal payment state required before releasing stock.' using errcode='42501';
 end if;
 if new.order_status in ('confirmed','processing') and new.order_status<>old.order_status and exists(select 1 from vetit_checkout.payment_attempts where order_id=old.id and needs_review) then
  raise exception 'Payment requires manual reconciliation.' using errcode='42501';
 end if;
 return new;
end $$;
create trigger checkout_lifecycle_order_guard before update on public.orders for each row execute function vetit_checkout.guard_lifecycle_order();
create function vetit_checkout.guard_lifecycle_dispatch()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('packed','shipped') and new.status<>old.status then
  perform 1 from public.orders where id=new.order_id for share;
  if exists(select 1 from vetit_checkout.payment_attempts where order_id=new.order_id and needs_review) then raise exception 'Payment requires manual reconciliation before dispatch.' using errcode='42501'; end if;
 end if;
 return new;
end $$;
create trigger checkout_lifecycle_dispatch_guard before update on public.fulfilments for each row execute function vetit_checkout.guard_lifecycle_dispatch();

create function public.begin_checkout_payment_attempt(p_order_id uuid,p_provider text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; lifecycle vetit_checkout.lifecycle%rowtype; attempt vetit_checkout.payment_attempts%rowtype;
begin
 if p_provider is null or p_provider!~'^[a-z][a-z0-9_-]{1,31}$' then raise exception 'Invalid sandbox provider.' using errcode='22023'; end if;
 select * into target from public.orders where id=p_order_id for update;
 select * into lifecycle from vetit_checkout.lifecycle where order_id=p_order_id;
 if target.id is null or lifecycle.order_id is null or target.order_status<>'pending' then raise exception 'Pending enrolled checkout required.' using errcode='22023'; end if;
 select * into attempt from vetit_checkout.payment_attempts where order_id=p_order_id;
 if found then
  if attempt.provider<>p_provider or attempt.needs_review or attempt.provider_status not in ('starting','pending') then raise exception 'Payment attempt cannot be restarted.' using errcode='22023'; end if;
  return vetit_checkout.lifecycle_snapshot(p_order_id);
 end if;
 if lifecycle.expires_at<=clock_timestamp() then raise exception 'Reservation deadline passed.' using errcode='22023'; end if;
 insert into vetit_checkout.payment_attempts(order_id,provider) values(p_order_id,p_provider);
 return vetit_checkout.lifecycle_snapshot(p_order_id);
end $$;
create function public.bind_checkout_payment_reference(p_attempt_id uuid,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt vetit_checkout.payment_attempts%rowtype; target public.orders%rowtype;
begin
 if p_reference is null or p_reference!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then raise exception 'Invalid provider reference.' using errcode='22023'; end if;
 select * into attempt from vetit_checkout.payment_attempts where id=p_attempt_id;
 if not found then raise exception 'Attempt not found.' using errcode='22023'; end if;
 select * into target from public.orders where id=attempt.order_id for update;
 select * into attempt from vetit_checkout.payment_attempts where id=p_attempt_id for update;
 if target.order_status<>'pending' or attempt.needs_review or attempt.provider_status not in ('starting','pending') then raise exception 'Payment reference needs reconciliation.' using errcode='22023'; end if;
 if attempt.provider_reference is not null then
  if attempt.provider_reference<>p_reference then raise exception 'Payment reference conflict.' using errcode='22023'; end if;
  return vetit_checkout.lifecycle_snapshot(target.id);
 end if;
 update vetit_checkout.payment_attempts set provider_reference=p_reference,provider_status='pending' where id=attempt.id;
 insert into public.payments(id,order_id,customer_profile_id,provider,provider_payment_reference,status,amount_minor,currency_code)
 values(attempt.payment_id,target.id,target.customer_profile_id,attempt.provider,p_reference,'pending',target.total_minor,target.currency_code);
 return vetit_checkout.lifecycle_snapshot(target.id);
end $$;

-- Only a trusted worker may submit an independently verified sandbox observation.
-- Event IDs are provider-wide, immutable and replay-safe; capture evidence is
-- retained even when a checkout has already closed or the amount mismatches.
create function public.reconcile_checkout_payment(p_attempt_id uuid,p_event_id text,p_reference text,p_status text,p_amount_minor bigint,p_currency_code text,p_observed_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare attempt vetit_checkout.payment_attempts%rowtype; target public.orders%rowtype; payload jsonb; previous vetit_checkout.payment_observations%rowtype; outcome text:='applied';
begin
 if p_event_id is null or p_event_id!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' or p_status is null or p_status not in ('pending','authorized','captured','failed','cancelled')
  or p_observed_at is null or p_observed_at>clock_timestamp()+interval '1 minute' or p_amount_minor is null or p_amount_minor<0 or p_amount_minor>9007199254740991
  or p_currency_code is null or p_currency_code!~'^[A-Z]{3}$' then raise exception 'Invalid payment observation.' using errcode='22023'; end if;
 select * into attempt from vetit_checkout.payment_attempts where id=p_attempt_id;
 if not found then raise exception 'Attempt not found.' using errcode='22023'; end if;
 select * into target from public.orders where id=attempt.order_id for update;
 select * into attempt from vetit_checkout.payment_attempts where id=p_attempt_id for update;
 if attempt.provider_reference is null or p_reference is distinct from attempt.provider_reference then raise exception 'Payment reference conflict.' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payment-event:'||attempt.provider||':'||p_event_id,0));
 payload:=jsonb_build_object('attemptId',p_attempt_id,'reference',p_reference,'status',p_status,'amountMinor',p_amount_minor,'currencyCode',p_currency_code,'observedAt',p_observed_at);
 select * into previous from vetit_checkout.payment_observations where provider=attempt.provider and event_id=p_event_id;
 if found then
  if previous.attempt_id<>attempt.id or previous.observation<>payload then raise exception 'Payment event conflicts with recorded evidence.' using errcode='22023'; end if;
  return jsonb_build_object('orderId',target.id,'outcome',previous.outcome,'replayed',true);
 end if;
 if attempt.needs_review or p_amount_minor<>target.total_minor or p_currency_code<>target.currency_code then outcome:='review_required';
 elsif p_status='captured' and (target.order_status='cancelled' or attempt.provider_status in ('failed','cancelled')) then outcome:='review_required';
 elsif attempt.provider_status='captured' and p_status in ('failed','cancelled') then outcome:='review_required';
 elsif p_status='captured' then outcome:='applied';
 elsif attempt.observed_at is not null and p_observed_at<attempt.observed_at then outcome:='stale';
 elsif attempt.provider_status in ('failed','cancelled') and p_status='authorized' then outcome:='review_required';
 elsif attempt.provider_status='captured' or attempt.provider_status in ('failed','cancelled') or (attempt.provider_status='authorized' and p_status='pending') then outcome:='stale';
 end if;
 if outcome='review_required' then
  update vetit_checkout.payment_attempts set needs_review=true where id=attempt.id;
 elsif outcome='applied' then
  update public.payments set status=p_status,updated_at=clock_timestamp() where id=attempt.payment_id;
  if not found then raise exception 'Registered payment row missing.' using errcode='23514'; end if;
  update vetit_checkout.payment_attempts set provider_status=p_status,observed_at=greatest(coalesce(observed_at,p_observed_at),p_observed_at) where id=attempt.id;
  if p_status='captured' then perform public.confirm_checkout_order(target.id); end if;
 end if;
 insert into vetit_checkout.payment_observations(provider,event_id,attempt_id,observation,outcome) values(attempt.provider,p_event_id,attempt.id,payload,outcome);
 return jsonb_build_object('orderId',target.id,'outcome',outcome,'replayed',false);
end $$;
create function public.expire_checkout_reservation(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare target public.orders%rowtype; lifecycle vetit_checkout.lifecycle%rowtype;
begin
 select * into target from public.orders where id=p_order_id for update;
 select * into lifecycle from vetit_checkout.lifecycle where order_id=p_order_id;
 if lifecycle.order_id is null then raise exception 'Enrolled checkout required.' using errcode='22023'; end if;
 if target.order_status<>'pending' then return jsonb_build_object('orderId',p_order_id,'outcome','not_pending'); end if;
 if lifecycle.expires_at>clock_timestamp() then return jsonb_build_object('orderId',p_order_id,'outcome','not_due'); end if;
 update vetit_checkout.lifecycle set last_checked_at=clock_timestamp() where order_id=p_order_id;
 if exists(select 1 from vetit_checkout.payment_attempts where order_id=p_order_id and (needs_review or provider_status not in ('failed','cancelled')))
  or exists(select 1 from public.payments where order_id=p_order_id and status in ('pending','authorized','captured')) then
  return jsonb_build_object('orderId',p_order_id,'outcome','blocked_payment');
 end if;
 update public.orders set order_status='cancelled',updated_at=clock_timestamp() where id=p_order_id;
 update vetit_checkout.lifecycle set expired_at=clock_timestamp() where order_id=p_order_id;
 return jsonb_build_object('orderId',p_order_id,'outcome','expired');
end $$;
create function public.list_due_checkout_reservations(p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid batch limit.' using errcode='22023'; end if;
 select coalesce(jsonb_agg(v.order_id order by v.last_checked_at nulls first,v.expires_at,v.order_id),'[]') into result from
  (select l.order_id,l.expires_at,l.last_checked_at from vetit_checkout.lifecycle l join public.orders o on o.id=l.order_id where l.expires_at<=statement_timestamp() and o.order_status='pending' order by l.last_checked_at nulls first,l.expires_at,l.order_id limit p_limit) v;
 return result;
end $$;
-- Bounded service-only triage includes closed orders with late capture evidence.
create function public.list_checkout_payment_reviews(p_limit integer,p_after uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid review limit.' using errcode='22023'; end if;
 with candidates as (
  select a.id,a.order_id,a.provider,a.provider_reference,o.order_status,o.total_minor,o.currency_code,
   (select observation from vetit_checkout.payment_observations e where e.attempt_id=a.id and e.outcome='review_required' order by (e.observation->>'status'='captured') desc,e.created_at desc,e.event_id desc limit 1) evidence
  from vetit_checkout.payment_attempts a join public.orders o on o.id=a.order_id where a.needs_review and (p_after is null or a.id>p_after) order by a.id limit p_limit+1
 ), page as (select * from candidates order by id limit p_limit)
 select jsonb_build_object('reviews',(select coalesce(jsonb_agg(jsonb_build_object('attemptId',id,'orderId',order_id,'provider',provider,'reference',provider_reference,'orderStatus',order_status,'expectedAmountMinor',total_minor,'currencyCode',currency_code,'evidence',evidence) order by id),'[]') from page),
  'nextAfter',case when (select count(*) from candidates)>p_limit then (select id from page order by id desc limit 1) else null end) into result;
 return result;
end $$;
revoke all on function public.list_checkout_payment_reviews(integer,uuid) from public,anon,authenticated,service_role;
grant execute on function public.list_checkout_payment_reviews(integer,uuid) to service_role;
-- Shipping/tax sandbox bridge: provider calls use a server-resolved basis.
-- Finalization independently resolves again and rejects ANY changed item/owner/
-- price snapshot. Absolute provider expiry caps the DB quote even across waits.
create table vetit_checkout.rate_snapshots (
 quote_id uuid primary key references vetit_checkout.quotes(id),
 shipping_reference text not null,
 tax_reference text not null,
 valid_until timestamptz not null,
 reservation_ttl_seconds integer not null check(reservation_ttl_seconds between 60 and 86400),
 environment text not null default 'sandbox' check(environment='sandbox')
);
alter table vetit_checkout.rate_snapshots enable row level security;
revoke all on vetit_checkout.rate_snapshots from public,anon,authenticated,service_role;
create function public.get_checkout_rate_basis(p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare canonical jsonb;
begin
 canonical:=vetit_checkout.canonical_request(p_request);
 return jsonb_build_object('request',canonical,'items',vetit_checkout.resolve_items(canonical));
end $$;
create function public.issue_checkout_rated_quote(p_customer_id uuid,p_request jsonb,p_expected_items jsonb,p_delivery_minor bigint,p_tax_minor bigint,p_shipping_reference text,p_tax_reference text,p_valid_until timestamptz,p_ttl_seconds integer,p_reservation_ttl_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; saved vetit_checkout.quotes%rowtype;
begin
 if p_reservation_ttl_seconds is null or p_reservation_ttl_seconds not between 60 and 86400 or p_valid_until is null or p_valid_until<=clock_timestamp()+interval '30 seconds'
  or p_shipping_reference is null or p_shipping_reference!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
  or p_tax_reference is null or p_tax_reference!~'^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$'
  or jsonb_typeof(p_expected_items) is distinct from 'array' then raise exception 'Fresh trusted sandbox charge quotes required.' using errcode='22023'; end if;
 result:=public.issue_checkout_quote(p_customer_id,p_request,p_delivery_minor,p_tax_minor,'sandbox-rated:'||md5(jsonb_build_array(p_shipping_reference,p_tax_reference)::text),p_ttl_seconds);
 select * into saved from vetit_checkout.quotes where id=(result->>'id')::uuid for update;
 if saved.items<>p_expected_items then raise exception 'Rate basis changed. Requote shipping and tax.' using errcode='22023'; end if;
 update vetit_checkout.quotes set expires_at=least(expires_at,p_valid_until) where id=saved.id returning * into saved;
 if saved.expires_at<=clock_timestamp() then raise exception 'Charge quotes expired while finalizing.' using errcode='22023'; end if;
 insert into vetit_checkout.rate_snapshots(quote_id,shipping_reference,tax_reference,valid_until,reservation_ttl_seconds) values(saved.id,p_shipping_reference,p_tax_reference,p_valid_until,p_reservation_ttl_seconds);
 return jsonb_set(result,'{expiresAt}',to_jsonb(saved.expires_at));
end $$;
-- New rated orders enroll inside the SAME reservation transaction. A worker
-- crash before payment preparation cannot leave these reservations unmanaged.
-- Legacy quotes/orders keep their existing behavior; no policy is invented.
create function vetit_checkout.enroll_rated_checkout()
returns trigger language plpgsql security definer set search_path='' as $$
declare ttl integer;
begin
 if new.new_status<>'pending' then return null; end if;
 select r.reservation_ttl_seconds into ttl from vetit_checkout.checkouts c join vetit_checkout.rate_snapshots r on r.quote_id=c.quote_id where c.order_id=new.order_id;
 if found then perform public.enroll_checkout_lifecycle(new.order_id,ttl); end if;
 return null;
end $$;
create trigger checkout_lifecycle_enroll_rated after insert on vetit_checkout.order_events for each row execute function vetit_checkout.enroll_rated_checkout();
revoke all on function vetit_checkout.enroll_rated_checkout() from public,anon,authenticated,service_role;
revoke all on function public.get_checkout_rate_basis(jsonb),public.issue_checkout_rated_quote(uuid,jsonb,jsonb,bigint,bigint,text,text,timestamptz,integer,integer) from public,anon,authenticated,service_role;
grant execute on function public.get_checkout_rate_basis(jsonb),public.issue_checkout_rated_quote(uuid,jsonb,jsonb,bigint,bigint,text,text,timestamptz,integer,integer) to service_role;
revoke all on function vetit_checkout.lifecycle_snapshot(uuid),vetit_checkout.guard_lifecycle_payment(),vetit_checkout.guard_lifecycle_order(),vetit_checkout.guard_lifecycle_dispatch() from public,anon,authenticated,service_role;
revoke all on function public.enroll_checkout_lifecycle(uuid,integer),public.get_checkout_lifecycle(uuid),public.begin_checkout_payment_attempt(uuid,text),public.bind_checkout_payment_reference(uuid,text),public.reconcile_checkout_payment(uuid,text,text,text,bigint,text,timestamptz),public.expire_checkout_reservation(uuid),public.list_due_checkout_reservations(integer) from public,anon,authenticated,service_role;
grant execute on function public.enroll_checkout_lifecycle(uuid,integer),public.get_checkout_lifecycle(uuid),public.begin_checkout_payment_attempt(uuid,text),public.bind_checkout_payment_reference(uuid,text),public.reconcile_checkout_payment(uuid,text,text,text,bigint,text,timestamptz),public.expire_checkout_reservation(uuid),public.list_due_checkout_reservations(integer) to service_role;
commit;
