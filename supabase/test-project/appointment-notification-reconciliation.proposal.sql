-- REVIEW PROPOSAL ONLY. Adds a read-only service lookup; no queue activation.
begin;
create function public.get_sandbox_appointment_delivery(p_outbox_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare item vetit_appointments.notification_outbox%rowtype;
begin
  select * into item from vetit_appointments.notification_outbox where id=p_outbox_id and sandbox_target_reference is not null and sandbox_claim_token is not null and status in ('processing','sent','failed');
  if not found then raise exception 'Sandbox delivery not found' using errcode='P0002'; end if;
  return jsonb_build_object('id',item.id,'notificationId',item.notification_id,'channel',item.channel,'targetReference',item.sandbox_target_reference,'claimToken',item.sandbox_claim_token,'status',item.status);
end;$$;
revoke all on function public.get_sandbox_appointment_delivery(uuid) from public,anon,authenticated;
grant execute on function public.get_sandbox_appointment_delivery(uuid) to service_role;
commit;
