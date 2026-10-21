create sequence public.quote_request_reference_sequence;
create sequence public.catalogue_download_reference_sequence;

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'MBP-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.quote_request_reference_sequence')::text, 8, '0')
  ),
  request_type text not null check (request_type in ('b2b', 'private', 'other')),
  event_date date not null,
  event_time text,
  guest_count integer not null check (guest_count >= 10),
  address text not null,
  services text[] not null check (cardinality(services) > 0),
  delivery text not null check (delivery = 'delivery'),
  notes text,
  first_name text not null,
  last_name text not null,
  company text,
  phone text not null,
  email text not null,
  consented_at timestamptz not null default timezone('utc', now()),
  source_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.catalogue_downloads (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default (
    'CAT-' || to_char(current_date, 'YYYY') || '-' ||
    lpad(nextval('public.catalogue_download_reference_sequence')::text, 8, '0')
  ),
  first_name text not null,
  last_name text not null,
  company text,
  phone text not null,
  email text not null,
  consented_at timestamptz not null default timezone('utc', now()),
  source_fingerprint text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.automation_events (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references public.quote_requests(id) on delete cascade,
  catalogue_download_id uuid references public.catalogue_downloads(id) on delete cascade,
  event_type text not null check (event_type in ('quote_request.created', 'catalogue_download.created')),
  idempotency_key text not null unique,
  source_fingerprint text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default timezone('utc', now()),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint automation_events_has_one_source check (
    (quote_request_id is not null)::integer + (catalogue_download_id is not null)::integer = 1
  )
);

create index quote_requests_created_at_idx on public.quote_requests (created_at desc);
create index catalogue_downloads_created_at_idx on public.catalogue_downloads (created_at desc);
create index automation_events_retry_idx on public.automation_events (next_attempt_at, created_at)
  where status in ('pending', 'failed');
create index automation_events_source_fingerprint_idx on public.automation_events (source_fingerprint, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger quote_requests_set_updated_at
before update on public.quote_requests
for each row execute function public.set_updated_at();

create trigger catalogue_downloads_set_updated_at
before update on public.catalogue_downloads
for each row execute function public.set_updated_at();

create trigger automation_events_set_updated_at
before update on public.automation_events
for each row execute function public.set_updated_at();

create or replace function public.enforce_submission_rate_limit(p_source_fingerprint text)
returns void
language plpgsql
set search_path = public
as $$
declare
  submission_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_source_fingerprint, 0));

  select count(*)
  into submission_count
  from public.automation_events
  where source_fingerprint = p_source_fingerprint
    and created_at > timezone('utc', now()) - interval '10 minutes';

  if submission_count >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.create_quote_request_with_event(
  p_request jsonb,
  p_source_fingerprint text,
  p_idempotency_key text
)
returns table(reference text, automation_event_id uuid, duplicate boolean)
language plpgsql
set search_path = public
as $$
declare
  v_quote public.quote_requests;
  v_event public.automation_events;
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
    request_type, event_date, event_time, guest_count, address, services, delivery,
    notes, first_name, last_name, company, phone, email, source_fingerprint
  ) values (
    p_request ->> 'requestType',
    (p_request ->> 'eventDate')::date,
    nullif(p_request ->> 'eventTime', ''),
    (p_request ->> 'guestCount')::integer,
    p_request ->> 'address',
    array(select jsonb_array_elements_text(p_request -> 'services')),
    p_request ->> 'delivery',
    nullif(p_request ->> 'notes', ''),
    p_request ->> 'firstName',
    p_request ->> 'lastName',
    nullif(p_request ->> 'company', ''),
    p_request ->> 'phone',
    p_request ->> 'email',
    p_source_fingerprint
  ) returning * into v_quote;

  insert into public.automation_events (
    quote_request_id, event_type, idempotency_key, source_fingerprint, payload
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

create or replace function public.create_catalogue_download_with_event(
  p_request jsonb,
  p_source_fingerprint text,
  p_idempotency_key text
)
returns table(reference text, automation_event_id uuid, duplicate boolean)
language plpgsql
set search_path = public
as $$
declare
  v_download public.catalogue_downloads;
  v_event public.automation_events;
begin
  select * into v_event
  from public.automation_events
  where idempotency_key = p_idempotency_key;

  if found then
    select * into v_download from public.catalogue_downloads where id = v_event.catalogue_download_id;
    return query select v_download.reference, v_event.id, true;
    return;
  end if;

  perform public.enforce_submission_rate_limit(p_source_fingerprint);

  insert into public.catalogue_downloads (
    first_name, last_name, company, phone, email, source_fingerprint
  ) values (
    p_request ->> 'firstName',
    p_request ->> 'lastName',
    nullif(p_request ->> 'company', ''),
    p_request ->> 'phone',
    p_request ->> 'email',
    p_source_fingerprint
  ) returning * into v_download;

  insert into public.automation_events (
    catalogue_download_id, event_type, idempotency_key, source_fingerprint, payload
  ) values (
    v_download.id,
    'catalogue_download.created',
    p_idempotency_key,
    p_source_fingerprint,
    jsonb_build_object('reference', v_download.reference, 'request', p_request)
  ) returning * into v_event;

  return query select v_download.reference, v_event.id, false;
end;
$$;

create or replace function public.claim_automation_events(p_limit integer default 25)
returns table(id uuid, event_type text, idempotency_key text, payload jsonb, attempts integer)
language sql
set search_path = public
as $$
  with candidates as (
    select id
    from public.automation_events
    where status in ('pending', 'failed')
      and next_attempt_at <= timezone('utc', now())
    order by next_attempt_at, created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.automation_events event
    set status = 'processing', attempts = event.attempts + 1, locked_at = timezone('utc', now())
    from candidates
    where event.id = candidates.id
    returning event.id, event.event_type, event.idempotency_key, event.payload, event.attempts
  )
  select * from claimed;
$$;

create or replace function public.mark_automation_event_succeeded(p_event_id uuid)
returns void
language sql
set search_path = public
as $$
  update public.automation_events
  set status = 'succeeded', delivered_at = timezone('utc', now()), locked_at = null, last_error = null
  where id = p_event_id and status = 'processing';
$$;

create or replace function public.reschedule_automation_event(p_event_id uuid, p_error text)
returns void
language sql
set search_path = public
as $$
  update public.automation_events
  set
    status = 'failed',
    locked_at = null,
    last_error = left(p_error, 1000),
    next_attempt_at = timezone('utc', now()) + make_interval(secs => least(3600, 30 * (2 ^ least(attempts, 10))::integer))
  where id = p_event_id and status = 'processing';
$$;

alter table public.quote_requests enable row level security;
alter table public.catalogue_downloads enable row level security;
alter table public.automation_events enable row level security;

revoke all on table public.quote_requests, public.catalogue_downloads, public.automation_events from anon, authenticated;
revoke all on sequence public.quote_request_reference_sequence, public.catalogue_download_reference_sequence from anon, authenticated;
revoke all on function public.enforce_submission_rate_limit(text) from public, anon, authenticated;
revoke all on function public.create_quote_request_with_event(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.create_catalogue_download_with_event(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.claim_automation_events(integer) from public, anon, authenticated;
revoke all on function public.mark_automation_event_succeeded(uuid) from public, anon, authenticated;
revoke all on function public.reschedule_automation_event(uuid, text) from public, anon, authenticated;

grant execute on function public.create_quote_request_with_event(jsonb, text, text) to service_role;
grant execute on function public.create_catalogue_download_with_event(jsonb, text, text) to service_role;
grant execute on function public.claim_automation_events(integer) to service_role;
grant execute on function public.mark_automation_event_succeeded(uuid) to service_role;
grant execute on function public.reschedule_automation_event(uuid, text) to service_role;
