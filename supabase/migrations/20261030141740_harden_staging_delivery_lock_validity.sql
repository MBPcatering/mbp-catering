-- PROPOSITION LOCALE UNIQUEMENT — NE PAS APPLIQUER SANS AUTORISATION.
--
-- Aligne les trois transitions STAGING sur la validation temporelle déjà
-- appliquée aux transitions ALERTES. Les signatures, retours, transitions,
-- propriétaire, droits existants et search_path restent inchangés.

create or replace function public.begin_quote_request_automation_delivery(
  p_event_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_started boolean;
begin
  update public.automation_events
  set delivery_started_at = coalesce(delivery_started_at, timezone('utc', now()))
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
  returning true into v_started;

  return coalesce(v_started, false);
end;
$$;

create or replace function public.mark_quote_request_automation_event_succeeded(
  p_event_id uuid,
  p_lock_token uuid
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_succeeded boolean;
begin
  update public.automation_events
  set
    status = 'succeeded',
    delivered_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    last_error = null
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and delivery_started_at is not null
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
  returning true into v_succeeded;

  return coalesce(v_succeeded, false);
end;
$$;

create or replace function public.mark_quote_request_automation_delivery_unknown(
  p_event_id uuid,
  p_lock_token uuid,
  p_error text
)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_attempts integer;
begin
  update public.automation_events
  set
    status = 'delivery_unknown',
    delivery_unknown_at = timezone('utc', now()),
    locked_at = null,
    lock_token = null,
    next_attempt_at = null,
    last_error = left(coalesce(nullif(p_error, ''), 'Delivery outcome unknown'), 1000)
  where id = p_event_id
    and event_type = 'quote_request.created'
    and status = 'processing'
    and delivery_started_at is not null
    and lock_token = p_lock_token
    and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes'
    and locked_at <= timezone('utc', now())
  returning attempts into v_attempts;

  if not found then
    return false;
  end if;

  perform public.enqueue_quote_delivery_alert(
    p_event_id,
    'delivery_unknown',
    v_attempts
  );

  return true;
end;
$$;
