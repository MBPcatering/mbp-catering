-- Preserve legacy requests while storing server-derived urgency metadata and
-- optional form fields needed by the five-step quote-request flow.
alter table public.quote_requests
  add column if not exists is_urgent boolean not null default false,
  add column if not exists urgent_reason text,
  add column if not exists event_type text,
  add column if not exists additional_services text[] not null default '{}'::text[];

alter table public.quote_requests
  drop constraint if exists quote_requests_urgent_reason_check,
  add constraint quote_requests_urgent_reason_check
    check (urgent_reason is null or urgent_reason = 'notice_period'),
  drop constraint if exists quote_requests_urgency_consistency_check,
  add constraint quote_requests_urgency_consistency_check
    check (
      (is_urgent and urgent_reason = 'notice_period')
      or (not is_urgent and urgent_reason is null)
    );

-- This replaces the existing function in place: its name, argument types and
-- return type stay unchanged, preventing an ambiguous PostgreSQL overload.
create or replace function public.create_quote_request_with_event(
  p_request jsonb,
  p_source_fingerprint text,
  p_idempotency_key text
)
returns table(reference text, automation_event_id uuid, duplicate boolean)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_quote public.quote_requests;
  v_event public.automation_events;
  v_is_urgent boolean :=
    p_request ->> 'isUrgent' = 'true'
    and p_request ->> 'urgentReason' = 'notice_period';
begin
  select * into v_event
  from public.automation_events
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_quote
    from public.quote_requests
    where id = v_event.quote_request_id;

    return query select v_quote.reference, v_event.id, true;
    return;
  end if;

  perform public.enforce_submission_rate_limit(p_source_fingerprint);

  insert into public.quote_requests (
    request_type,
    event_date,
    event_time,
    event_type,
    guest_count,
    address,
    services,
    additional_services,
    delivery,
    notes,
    first_name,
    last_name,
    company,
    phone,
    email,
    is_urgent,
    urgent_reason,
    source_fingerprint
  ) values (
    p_request ->> 'requestType',
    (p_request ->> 'eventDate')::date,
    nullif(p_request ->> 'eventTime', ''),
    nullif(p_request ->> 'eventType', ''),
    (p_request ->> 'guestCount')::integer,
    p_request ->> 'address',
    array(select jsonb_array_elements_text(p_request -> 'services')),
    coalesce(
      array(
        select jsonb_array_elements_text(
          coalesce(p_request -> 'additionalServices', '[]'::jsonb)
        )
      ),
      '{}'::text[]
    ),
    p_request ->> 'delivery',
    nullif(p_request ->> 'notes', ''),
    p_request ->> 'firstName',
    p_request ->> 'lastName',
    nullif(p_request ->> 'company', ''),
    p_request ->> 'phone',
    p_request ->> 'email',
    v_is_urgent,
    case when v_is_urgent then 'notice_period' else null end,
    p_source_fingerprint
  ) returning * into v_quote;

  insert into public.automation_events (
    quote_request_id,
    event_type,
    idempotency_key,
    source_fingerprint,
    payload
  ) values (
    v_quote.id,
    'quote_request.created',
    p_idempotency_key,
    p_source_fingerprint,
    jsonb_build_object('reference', v_quote.reference, 'request', p_request)
  ) returning * into v_event;

  return query select v_quote.reference, v_event.id, false;
end;
$$;

revoke all on function public.create_quote_request_with_event(jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.create_quote_request_with_event(jsonb, text, text)
  to service_role;
