alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.enforce_submission_rate_limit(text) set search_path = public, pg_temp;
alter function public.create_quote_request_with_event(jsonb, text, text) set search_path = public, pg_temp;
alter function public.create_catalogue_download_with_event(jsonb, text, text) set search_path = public, pg_temp;
alter function public.claim_automation_events(integer) set search_path = public, pg_temp;
alter function public.mark_automation_event_succeeded(uuid) set search_path = public, pg_temp;
alter function public.reschedule_automation_event(uuid, text) set search_path = public, pg_temp;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
