-- Security advisor fixes: role helpers live in a schema not exposed by the REST API,
-- and trigger functions get a fixed search_path. Policies keep working (bound by OID).
create schema if not exists private;
grant usage on schema private to anon, authenticated;
alter function public.current_role_is(variadic app_role[]) set schema private;
alter function public.is_staff() set schema private;
alter function public.set_updated_at() set search_path = '';
alter function public.forbid_change() set search_path = '';
