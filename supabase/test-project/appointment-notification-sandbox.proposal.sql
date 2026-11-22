-- REVIEW PROPOSAL ONLY. Disposable database tests; no delivery activation.
begin;
alter table vetit_appointments.notification_outbox
  add column sandbox_target_reference text check (sandbox_target_reference is null or sandbox_target_reference ~ '^synthetic:[A-Za-z0-9_-]{1,80}$'),
  add column sandbox_claim_token uuid,
  add column sandbox_claimed_at timestamptz,
  add column sandbox_receipt text;

create table vetit_appointments.sandbox_notification_receipts (
  outbox_id uuid not null references vetit_appointments.notification_outbox(id),
  claim_token uuid not null,
  target_reference text not null,
  channel text not null,
  state text not null check (state in ('sent','failed')),
  receipt text not null,
  recorded_at timestamptz not null default now(),
  primary key(outbox_id,claim_token)
);
alter table vetit_appointments.sandbox_notification_receipts enable row level security;
revoke all on vetit_appointments.sandbox_notification_receipts from public,anon,authenticated;

create function public.queue_sandbox_appointment_notification(p_outbox_id uuid,p_target_reference text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if p_target_reference is null or p_target_reference !~ '^synthetic:[A-Za-z0-9_-]{1,80}$' then raise exception 'Synthetic target required' using errcode='22023'; end if;
  update vetit_appointments.notification_outbox set sandbox_target_reference=p_target_reference,status='pending',available_at=now(),sandbox_claim_token=null,sandbox_claimed_at=null,sandbox_receipt=null
  where id=p_outbox_id and (status='disabled' or (status='failed' and sandbox_target_reference=p_target_reference));
  if not found then raise exception 'Delivery cannot be queued' using errcode='40001'; end if;
  return p_outbox_id;
end;$$;

create function public.claim_sandbox_appointment_notifications(p_run_id uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_run_id is null or p_limit is null or p_limit<1 or p_limit>100 then raise exception 'Invalid sandbox batch' using errcode='22023'; end if;
  with candidates as (
    select id from vetit_appointments.notification_outbox where status='pending' and sandbox_target_reference is not null and available_at<=now()
    order by available_at,id limit p_limit for update skip locked
  ), claimed as (
    update vetit_appointments.notification_outbox o set status='processing',attempts=o.attempts+1,sandbox_claim_token=p_run_id,sandbox_claimed_at=now()
    from candidates c where o.id=c.id returning o.id,o.notification_id,o.channel,o.sandbox_target_reference,o.sandbox_claim_token
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'notificationId',notification_id,'channel',channel,'targetReference',sandbox_target_reference,'claimToken',sandbox_claim_token) order by id),'[]'::jsonb) into result from claimed;
  return result;
end;$$;

create function public.finish_sandbox_appointment_notification(p_outbox_id uuid,p_claim_token uuid,p_state text,p_receipt text)
returns text language plpgsql security definer set search_path = '' as $$
declare item vetit_appointments.notification_outbox%rowtype;
begin
  if p_state is null or p_state not in ('sent','failed') or p_receipt is null or p_receipt !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$' then raise exception 'Invalid sandbox receipt' using errcode='22023'; end if;
  select * into item from vetit_appointments.notification_outbox where id=p_outbox_id for update;
  if not found or item.sandbox_target_reference is null or p_claim_token is null or item.sandbox_claim_token is distinct from p_claim_token then raise exception 'Claim not found' using errcode='42501'; end if;
  if item.status=p_state and item.sandbox_receipt=p_receipt then return item.status; end if;
  if item.status<>'processing' then raise exception 'Claim state changed' using errcode='40001'; end if;
  insert into vetit_appointments.sandbox_notification_receipts(outbox_id,claim_token,target_reference,channel,state,receipt) values(p_outbox_id,p_claim_token,item.sandbox_target_reference,item.channel,p_state,p_receipt);
  update vetit_appointments.notification_outbox set status=p_state,sandbox_receipt=p_receipt where id=p_outbox_id;
  return p_state;
end;$$;
revoke all on function public.queue_sandbox_appointment_notification(uuid,text),public.claim_sandbox_appointment_notifications(uuid,integer),public.finish_sandbox_appointment_notification(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.queue_sandbox_appointment_notification(uuid,text),public.claim_sandbox_appointment_notifications(uuid,integer),public.finish_sandbox_appointment_notification(uuid,uuid,text,text) to service_role;
commit;
