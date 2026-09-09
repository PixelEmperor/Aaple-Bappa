-- Explicit privilege posture for the Data API roles.
--
-- Everything up to 0008 relied on Supabase's *implicit* grants: not one
-- `grant` or `revoke` statement existed in this directory, so what `anon`
-- could actually reach depended entirely on when the project was created
-- (legacy auto-expose vs. the current always-revoked default, see
-- supabase/config.toml's `auto_expose_new_tables` note). Two consequences,
-- both fixed here:
--
--  1. Under legacy auto-expose, the three `security definer` functions from
--     0005/0006/0008 were reachable by `anon` over PostgREST as
--     /rest/v1/rpc/<name>. Because `security definer` runs as the owner,
--     a caller holding only the (deliberately public) anon key could call
--     approve_edit_mandal_submission with any p_mandal_id/p_patch and
--     rewrite any mandals row — bypassing login, the `moderators` check in
--     src/server/trpc.ts, and RLS all at once. The design intent that these
--     are "only ever called by the service-role connection" was enforced
--     nowhere; now it is.
--
--  2. Under the current default, the RLS policies in 0003 had no grants
--     behind them at all, so the schema wasn't reproducible from these
--     migrations alone. The grants the app genuinely needs are now spelled
--     out below.
--
-- Also adds `set search_path` to every `security definer` function. Without
-- it the function resolves unqualified names through the caller's
-- search_path, which is the standard privilege-escalation route for
-- definer-rights functions (and what Supabase's own linter flags as
-- `function_search_path_mutable`).

-- ---------------------------------------------------------------------------
-- Table privileges: exactly what the public app touches, nothing more.
-- ---------------------------------------------------------------------------

-- Reads are further narrowed by the RLS policies in 0003 (public/non-flagged
-- mandals only); these grants are the outer bound, RLS the inner one.
grant select on mandals to anon, authenticated;
grant select on helplines to anon, authenticated;

-- submissions: no grant at all. Public writes now go through
-- submissions.create with the service-role client, *after* rate limiting and
-- Zod validation (src/server/routers/submissions.ts). Direct anon inserts
-- used to be allowed by the submissions_public_insert policy in 0003, which
-- let a caller with the anon key skip the rate limiter, the image
-- validation, and the duplicate check, and write arbitrary
-- type/mandal_id/payload rows straight into the moderation queue.
drop policy if exists submissions_public_insert on submissions;
revoke all on submissions from anon, authenticated;

-- moderators / rate_limits hold no user-facing content: service-role only.
revoke all on moderators from anon, authenticated;
revoke all on rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges. `revoke from public` is the one that actually matters:
-- Postgres grants EXECUTE to PUBLIC on every new function by default, so
-- revoking from anon/authenticated alone would leave the grant in place.
-- ---------------------------------------------------------------------------

-- Revoked *before* the `create or replace` further down, deliberately:
-- CREATE OR REPLACE preserves a function's existing privileges, so revoking
-- first is what makes the replacement land already locked down.
--
-- rate_limit_check's old 3-argument signature isn't listed here — it's
-- dropped outright below, which takes its grants with it.
revoke all on function approve_new_mandal_submission(uuid, jsonb, text)
  from public, anon, authenticated;
revoke all on function approve_edit_mandal_submission(uuid, uuid, jsonb, text)
  from public, anon, authenticated;

grant execute on function approve_new_mandal_submission(uuid, jsonb, text) to service_role;
grant execute on function approve_edit_mandal_submission(uuid, uuid, jsonb, text) to service_role;

-- ---------------------------------------------------------------------------
-- Re-create all three with a pinned search_path. Bodies are unchanged from
-- 0005/0006/0008 except for `rate_limit_check`, which no longer takes its
-- window length from the caller (see below).
-- ---------------------------------------------------------------------------

-- The window and cap are now fixed here rather than passed in as
-- p_window_seconds/p_max_requests. As caller-supplied arguments they were a
-- rate limiter that told you how to disable it: p_window_seconds => 0 makes
-- the "window expired" branch always true, resetting any key's counter to 1
-- on every call. Only reachable together with the RPC exposure above, but
-- the parameters bought nothing — both values were compile-time constants in
-- src/server/rate-limit.ts — so they're gone rather than merely protected.
drop function if exists rate_limit_check(text, int, int);

create or replace function rate_limit_check(p_key text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row rate_limits%rowtype;
  v_window_seconds constant int := 15 * 60;
  v_max_requests   constant int := 5;
begin
  select * into v_row from rate_limits where key = p_key for update;

  if not found then
    insert into rate_limits (key, count, window_start) values (p_key, 1, now());
    return true;
  end if;

  if now() - v_row.window_start > (v_window_seconds || ' seconds')::interval then
    update rate_limits set count = 1, window_start = now() where key = p_key;
    return true;
  end if;

  if v_row.count >= v_max_requests then
    return false;
  end if;

  update rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;

revoke all on function rate_limit_check(text) from public, anon, authenticated;
grant execute on function rate_limit_check(text) to service_role;

create or replace function approve_new_mandal_submission(
  p_submission_id uuid,
  p_mandal jsonb,
  p_moderator_notes text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  insert into mandals (
    name, slug, area, zone, lat, lng, established_year, description,
    nearest_station, tags, timings, official_contact, photo_url,
    is_public, source, verification_status
  )
  select
    p_mandal->>'name',
    p_mandal->>'slug',
    p_mandal->>'area',
    p_mandal->>'zone',
    (p_mandal->>'lat')::double precision,
    (p_mandal->>'lng')::double precision,
    (p_mandal->>'established_year')::int,
    p_mandal->>'description',
    p_mandal->>'nearest_station',
    case when p_mandal->'tags' is null then null
      else array(select jsonb_array_elements_text(p_mandal->'tags')) end,
    p_mandal->>'timings',
    p_mandal->>'official_contact',
    p_mandal->>'photo_url',
    (p_mandal->>'is_public')::boolean,
    'crowdsourced',
    'unverified'
  returning slug into v_slug;

  update submissions
  set status = 'approved', moderator_notes = p_moderator_notes, reviewed_at = now()
  where id = p_submission_id;

  return v_slug;
end;
$$;

create or replace function approve_edit_mandal_submission(
  p_submission_id uuid,
  p_mandal_id uuid,
  p_patch jsonb,
  p_moderator_notes text
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_slug text;
begin
  update mandals set
    name = coalesce(p_patch->>'name', name),
    area = coalesce(p_patch->>'area', area),
    zone = coalesce(p_patch->>'zone', zone),
    lat = coalesce((p_patch->>'lat')::double precision, lat),
    lng = coalesce((p_patch->>'lng')::double precision, lng),
    established_year = coalesce((p_patch->>'established_year')::int, established_year),
    description = coalesce(p_patch->>'description', description),
    history = coalesce(p_patch->>'history', history),
    nearest_station = coalesce(p_patch->>'nearest_station', nearest_station),
    tags = case when p_patch ? 'tags'
      then array(select jsonb_array_elements_text(p_patch->'tags')) else tags end,
    timings = coalesce(p_patch->>'timings', timings),
    official_contact = coalesce(p_patch->>'official_contact', official_contact),
    photo_url = coalesce(p_patch->>'photo_url', photo_url),
    is_public = coalesce((p_patch->>'is_public')::boolean, is_public)
  where id = p_mandal_id
  returning slug into v_slug;

  if v_slug is null then
    raise exception 'mandal % not found', p_mandal_id;
  end if;

  update submissions
  set status = 'approved', moderator_notes = p_moderator_notes, reviewed_at = now()
  where id = p_submission_id;

  return v_slug;
end;
$$;

-- set_updated_at (0001) is a trigger function, not reachable over PostgREST
-- and `security invoker`, so it needs no revoke — but it does execute under
-- whichever search_path the writing session has, so pin it too.
create or replace function set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Default privileges for anything added later, so a future migration can't
-- silently re-open this by relying on the implicit grants again.
-- ---------------------------------------------------------------------------

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
