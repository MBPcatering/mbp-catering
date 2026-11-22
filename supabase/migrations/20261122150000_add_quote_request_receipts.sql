-- A receipt is a distinct delivery from the internal quote notification.
-- It therefore receives its own event, lock, and terminal-delivery state.

alter table public.automation_events
  drop constraint automation_events_event_type_check,
  add constraint automation_events_event_type_check check (
    event_type in (
      'quote_request.created',
      'quote_request.receipt.created',
      'catalogue_download.created'
    )
  );

create index automation_events_quote_receipt_ready_idx
  on public.automation_events (next_attempt_at, created_at)
  where event_type = 'quote_request.receipt.created'
    and status in ('pending', 'failed');

-- Keep the public RPC signature intact. The server-only receiptEnabled flag
-- determines whether a new quote atomically receives its receipt event.
create or replace function public.create_quote_request_with_event(
  p_request jsonb,
  p_source_fingerprint text,
  p_idempotency_key text
)
returns table(reference text, automation_event_id uuid, duplicate boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_quote public.quote_requests;
  v_event public.automation_events;
  v_is_urgent boolean := coalesce(
    p_request ->> 'isUrgent' = 'true'
    and p_request ->> 'urgentReason' = 'notice_period',
    false
  );
  v_receipt_enabled boolean := p_request ->> 'receiptEnabled' = 'true';
  v_locale text := coalesce(nullif(p_request ->> 'locale', ''), 'fr');
begin
  select * into v_event
  from public.automation_events
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_quote from public.quote_requests where id = v_event.quote_request_id;
    return query select v_quote.reference, v_event.id, true;
    return;
  end if;

  perform public.enforce_submission_rate_limit(p_source_fingerprint);

  insert into public.quote_requests (
    request_type, event_date, event_time, event_type, guest_count, address,
    services, additional_services, delivery, notes, first_name, last_name,
    company, phone, email, is_urgent, urgent_reason, source_fingerprint
  ) values (
    p_request ->> 'requestType', (p_request ->> 'eventDate')::date,
    nullif(p_request ->> 'eventTime', ''), nullif(p_request ->> 'eventType', ''),
    (p_request ->> 'guestCount')::integer, p_request ->> 'address',
    array(select jsonb_array_elements_text(p_request -> 'services')),
    coalesce(array(select jsonb_array_elements_text(coalesce(p_request -> 'additionalServices', '[]'::jsonb))), '{}'::text[]),
    p_request ->> 'delivery', nullif(p_request ->> 'notes', ''),
    p_request ->> 'firstName', p_request ->> 'lastName', nullif(p_request ->> 'company', ''),
    p_request ->> 'phone', p_request ->> 'email', v_is_urgent,
    case when v_is_urgent then 'notice_period' else null end, p_source_fingerprint
  ) returning * into v_quote;

  insert into public.automation_events (
    quote_request_id, event_type, idempotency_key, source_fingerprint, payload
  ) values (
    v_quote.id, 'quote_request.created', p_idempotency_key, p_source_fingerprint,
    jsonb_build_object('reference', v_quote.reference, 'request', p_request)
  ) returning * into v_event;

  if v_receipt_enabled then
    insert into public.automation_events (
      quote_request_id, event_type, idempotency_key, source_fingerprint, payload
    ) values (
      v_quote.id,
      'quote_request.receipt.created',
      v_quote.id::text || ':quote_request.receipt.created',
      p_source_fingerprint,
      jsonb_build_object(
        'reference', v_quote.reference,
        'recipientEmail', v_quote.email,
        'locale', case when v_locale in ('fr', 'nl', 'en') then v_locale else 'fr' end
      )
    );
  end if;

  return query select v_quote.reference, v_event.id, false;
end;
$$;

create or replace function public.claim_quote_request_receipt_events(p_limit integer default 25)
returns table(id uuid, idempotency_key text, payload jsonb, attempts integer, lock_token uuid)
language plpgsql security invoker set search_path = public, pg_temp
as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'p_limit must be between 1 and 100' using errcode = '22023';
  end if;

  with expired_delivery as (
    select event.id, event.attempts
    from public.automation_events event
    where event.event_type = 'quote_request.receipt.created'
      and event.status = 'processing'
      and event.delivery_started_at is not null
      and event.locked_at <= timezone('utc', now()) - interval '10 minutes'
    for update skip locked
  ), quarantined as (
    update public.automation_events event
    set status = 'delivery_unknown', delivery_unknown_at = timezone('utc', now()),
        locked_at = null, lock_token = null, next_attempt_at = null,
        last_error = coalesce(event.last_error, 'Receipt delivery outcome unknown after lock expiry')
    from expired_delivery expired where event.id = expired.id
    returning event.id, event.attempts
  )
  insert into public.automation_alerts (automation_event_id, alert_type, idempotency_key, payload)
  select quarantined.id, 'delivery_unknown', quarantined.id::text || ':delivery_unknown',
         jsonb_build_object('automationEventId', quarantined.id, 'alertType', 'delivery_unknown', 'attempts', quarantined.attempts)
  from quarantined on conflict (automation_event_id, alert_type) do nothing;

  return query
  with candidates as (
    select event.id
    from public.automation_events event
    where event.event_type = 'quote_request.receipt.created'
      and ((event.status in ('pending', 'failed') and event.attempts < 8 and event.next_attempt_at <= timezone('utc', now()))
        or (event.status = 'processing' and event.delivery_started_at is null
          and event.locked_at <= timezone('utc', now()) - interval '10 minutes'))
    order by case when event.status = 'processing' then event.locked_at else event.next_attempt_at end, event.created_at
    for update skip locked limit p_limit
  ), claimed as (
    update public.automation_events event
    set status = 'processing', attempts = event.attempts + 1, locked_at = timezone('utc', now()),
        lock_token = gen_random_uuid(),
        last_error = case when event.status = 'processing' then 'Receipt lock expired before delivery started' else event.last_error end
    from candidates where event.id = candidates.id
    returning event.id, event.idempotency_key, event.payload, event.attempts, event.lock_token
  ) select * from claimed;
end;
$$;

create or replace function public.begin_quote_request_receipt_delivery(p_event_id uuid, p_lock_token uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp
as $$ declare v_started boolean; begin
  update public.automation_events set delivery_started_at = coalesce(delivery_started_at, timezone('utc', now()))
  where id = p_event_id and event_type = 'quote_request.receipt.created' and status = 'processing'
    and lock_token = p_lock_token and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes' and locked_at <= timezone('utc', now())
  returning true into v_started;
  return coalesce(v_started, false);
end; $$;

create or replace function public.mark_quote_request_receipt_event_succeeded(p_event_id uuid, p_lock_token uuid)
returns boolean language plpgsql security invoker set search_path = public, pg_temp
as $$ declare v_succeeded boolean; begin
  update public.automation_events
  set status = 'succeeded', delivered_at = timezone('utc', now()), locked_at = null, lock_token = null, last_error = null
  where id = p_event_id and event_type = 'quote_request.receipt.created' and status = 'processing'
    and delivery_started_at is not null and lock_token = p_lock_token and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes' and locked_at <= timezone('utc', now())
  returning true into v_succeeded;
  return coalesce(v_succeeded, false);
end; $$;

create or replace function public.mark_quote_request_receipt_delivery_unknown(p_event_id uuid, p_lock_token uuid, p_error text)
returns boolean language plpgsql security invoker set search_path = public, pg_temp
as $$ declare v_attempts integer; begin
  update public.automation_events
  set status = 'delivery_unknown', delivery_unknown_at = timezone('utc', now()), locked_at = null, lock_token = null,
      next_attempt_at = null, last_error = left(coalesce(nullif(p_error, ''), 'Receipt delivery outcome unknown'), 1000)
  where id = p_event_id and event_type = 'quote_request.receipt.created' and status = 'processing'
    and delivery_started_at is not null and lock_token = p_lock_token and locked_at is not null
    and locked_at > timezone('utc', now()) - interval '10 minutes' and locked_at <= timezone('utc', now())
  returning attempts into v_attempts;
  if not found then return false; end if;
  perform public.enqueue_quote_delivery_alert(p_event_id, 'delivery_unknown', v_attempts);
  return true;
end; $$;

create or replace function public.reschedule_quote_request_receipt_event(p_event_id uuid, p_lock_token uuid, p_error text)
returns text language plpgsql security invoker set search_path = public, pg_temp
as $$ declare v_attempts integer; v_status text; begin
  update public.automation_events
  set status = case when delivery_started_at is not null then 'delivery_unknown' when attempts >= 8 then 'dead_letter' else 'failed' end,
      delivery_unknown_at = case when delivery_started_at is not null then timezone('utc', now()) else delivery_unknown_at end,
      dead_lettered_at = case when delivery_started_at is null and attempts >= 8 then timezone('utc', now()) else dead_lettered_at end,
      locked_at = null, lock_token = null, last_error = left(coalesce(nullif(p_error, ''), 'Receipt delivery error'), 1000),
      next_attempt_at = case when delivery_started_at is not null or attempts >= 8 then null else timezone('utc', now()) + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer)) end
  where id = p_event_id and event_type = 'quote_request.receipt.created' and status = 'processing' and lock_token = p_lock_token
  returning attempts, status into v_attempts, v_status;
  if not found then return 'stale'; end if;
  if v_status in ('delivery_unknown', 'dead_letter') then perform public.enqueue_quote_delivery_alert(p_event_id, v_status, v_attempts); end if;
  return case when v_status = 'failed' then 'retry_scheduled' else v_status end;
end; $$;

revoke all on function public.create_quote_request_with_event(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.claim_quote_request_receipt_events(integer) from public, anon, authenticated;
revoke all on function public.begin_quote_request_receipt_delivery(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_quote_request_receipt_event_succeeded(uuid, uuid) from public, anon, authenticated;
revoke all on function public.mark_quote_request_receipt_delivery_unknown(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.reschedule_quote_request_receipt_event(uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.create_quote_request_with_event(jsonb, text, text) to service_role;
grant execute on function public.claim_quote_request_receipt_events(integer) to service_role;
grant execute on function public.begin_quote_request_receipt_delivery(uuid, uuid) to service_role;
grant execute on function public.mark_quote_request_receipt_event_succeeded(uuid, uuid) to service_role;
grant execute on function public.mark_quote_request_receipt_delivery_unknown(uuid, uuid, text) to service_role;
grant execute on function public.reschedule_quote_request_receipt_event(uuid, uuid, text) to service_role;
