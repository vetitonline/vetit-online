-- Forward-only, idempotent proposal. No hosted execution authorized.
-- Optional exposure assertion for future/recreated normalized fulfilment tables.
-- Existing candidate already grants this access; never grant every public table.
begin;
do $$begin
 if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname='fulfilment_events' and c.relkind in ('r','p') and c.relrowsecurity)
 or not exists(select 1 from pg_policies where schemaname='public' and tablename='fulfilment_events'
   and policyname='fulfilment_events_read_participant' and cmd='SELECT'
   and roles=array['authenticated']::name[] and qual is not null)
 or exists(select 1 from pg_policies where schemaname='public' and tablename='fulfilment_events'
   and cmd in ('SELECT','ALL') and policyname<>'fulfilment_events_read_participant') then
   raise exception 'Verified participant RLS prerequisites required before Data API grant';
 end if;
end;$$;
grant select on table public.fulfilment_events to authenticated;
-- No anon grant, service-role table grant, default-privilege or policy change.
commit;
