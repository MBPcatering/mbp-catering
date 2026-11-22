-- Administrative closure for explicitly confirmed test quote events.
-- This is terminal: it never represents a delivery, failure, or unknown result.

alter table public.automation_events
  drop constraint automation_events_status_check,
  add constraint automation_events_status_check check (
    status in (
      'pending',
      'processing',
      'succeeded',
      'failed',
      'delivery_unknown',
      'dead_letter',
      'cancelled'
    )
  );

create or replace function public.cancel_quote_request_automation_event(
  p_event_id uuid,
  p_resolution_note text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_cancelled boolean;
  v_resolution_note text := nullif(btrim(p_resolution_note), '');
begin
  if v_resolution_note is null then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

  update public.automation_events event
  set
    status = 'cancelled',
    next_attempt_at = null,
    locked_at = null,
    lock_token = null,
    resolved_at = timezone('utc', now()),
    resolution_note = left(v_resolution_note, 1000)
  where event.id = p_event_id
    and event.event_type = 'quote_request.created'
    and event.status = 'pending'
    and event.attempts = 0
    and event.delivery_started_at is null
    and event.delivered_at is null
    and event.delivery_unknown_at is null
    and event.dead_lettered_at is null
    and event.locked_at is null
    and event.lock_token is null
    and not exists (
      select 1
      from public.automation_alerts alert
      where alert.automation_event_id = event.id
    )
  returning true into v_cancelled;

  return coalesce(v_cancelled, false);
end;
$$;

revoke all on function public.cancel_quote_request_automation_event(uuid, text)
  from public, anon, authenticated;
grant execute on function public.cancel_quote_request_automation_event(uuid, text)
  to service_role;
