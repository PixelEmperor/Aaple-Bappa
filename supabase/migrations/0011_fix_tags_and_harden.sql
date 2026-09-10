-- Post-audit fixes (see docs/security-hardening-runbook.md).
--
-- The headline item is a genuine approve-path outage, not a hardening nicety:
-- `approve_new_mandal_submission` could not approve ANY submission whose
-- payload carried `"tags": null`, which is what submissions.create writes
-- whenever a submitter picks no tags (`tags: input.payload.tags ?? null`,
-- src/server/routers/submissions.ts) and what the mandal-dataset import
-- wrote for all 190 of its rows. 194 of 200 pending submissions were
-- affected. Verified against the live project before writing this:
--
--   POST /rest/v1/rpc/approve_new_mandal_submission  with tags: null
--   -> 22023 "cannot extract elements from a scalar"
--
-- Cause: `p_mandal->'tags'` returns the *jsonb scalar* `null` for a JSON
-- null, not SQL NULL, so `p_mandal->'tags' is null` is false and the guard
-- fell through to `jsonb_array_elements_text('null'::jsonb)`, which raises.
-- The same confusion is why `payload->tags=is.null` matches zero rows over
-- PostgREST. Fixed below by testing `jsonb_typeof(...) = 'array'` — which is
-- true only for a real array, and correctly false for a JSON null, an absent
-- key (SQL NULL), and any wrong-typed value.
--
-- The approve functions are transactional, so every one of those failures
-- rolled back cleanly; nothing needs repairing, only unblocking.

-- ---------------------------------------------------------------------------
-- Moderator attribution. `moderator_notes`/`reviewed_at` recorded *that* a
-- decision happened but never *who* made it, so an account takeover left no
-- way to scope a rollback across the moderator set.
-- ---------------------------------------------------------------------------

alter table submissions
  add column if not exists reviewed_by uuid references auth.users(id);

comment on column submissions.reviewed_by is
  'Moderator (auth.users.id) who approved/rejected. Set from ctx.user.id in submissions.review/bulkReview.';

-- ---------------------------------------------------------------------------
-- Value constraints. Bounds existed only in Zod, so anything reaching the
-- table by another path (a direct service-role write, the data pipeline, a
-- future RPC) could store an off-map mandal. Verified no existing row
-- violates these before adding them.
-- ---------------------------------------------------------------------------

alter table mandals
  add constraint mandals_lat_range check (lat between -90 and 90),
  add constraint mandals_lng_range check (lng between -180 and 180),
  add constraint mandals_established_year_range
    check (established_year is null or established_year between 1800 and 2100);

-- An edit_mandal row with no target is unapprovable dead weight — review()
-- rejects it with 'Edit submission is missing its target mandal.' forever.
alter table submissions
  add constraint submissions_edit_requires_mandal
    check (type <> 'edit_mandal' or mandal_id is not null);

-- ---------------------------------------------------------------------------
-- Privileges: 0009 revoked all on submissions/moderators/rate_limits but only
-- *added* select on mandals/helplines, so on a project created under the
-- legacy `auto_expose_new_tables` default (supabase/config.toml) anon could
-- still hold insert/update/delete there. RLS's select-only policies are what
-- actually blocks writes today — confirmed by probing the live project, where
-- an anon PATCH returns zero rows and leaves data intact — so this is
-- defence in depth, removing the reliance on RLS being the only gate.
-- ---------------------------------------------------------------------------

revoke all on mandals from anon, authenticated;
revoke all on helplines from anon, authenticated;
grant select on mandals to anon, authenticated;
grant select on helplines to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retire the pre-R2 Supabase Storage bucket. Photo storage moved to
-- Cloudflare R2 (src/server/photo-upload.ts) and next.config.ts's image
-- allowlist only covers the R2 host, so this bucket is unreachable from the
-- app — but it was still `public = true` with a world-readable policy, and
-- anon could list its contents. Verified empty (0 objects) and no mandals
-- row references it before dropping.
-- ---------------------------------------------------------------------------

drop policy if exists mandal_photos_public_read on storage.objects;
delete from storage.buckets where id = 'mandal-photos';

-- ---------------------------------------------------------------------------
-- Approve functions, rebuilt.
--
-- Dropped rather than `create or replace`d because they gain a
-- `p_reviewed_by` parameter, and CREATE OR REPLACE cannot change a
-- signature — it would leave the old 3-arg function in place alongside the
-- new one and make a named-argument call ambiguous. `p_reviewed_by` is
-- DEFAULT null so a caller that omits it still resolves here, which keeps
-- the currently-deployed code working until the matching app change ships.
--
-- Dropping also drops the grants, so the revoke/grant pair is repeated after
-- each definition.
-- ---------------------------------------------------------------------------

drop function if exists approve_new_mandal_submission(uuid, jsonb, text);
drop function if exists approve_edit_mandal_submission(uuid, uuid, jsonb, text);

create function approve_new_mandal_submission(
  p_submission_id uuid,
  p_mandal jsonb,
  p_moderator_notes text,
  p_reviewed_by uuid default null
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
    -- The fix. `jsonb_typeof` is true only for a real array; a JSON null, an
    -- absent key, or a wrong-typed value all fall through to NULL instead of
    -- raising 22023.
    case
      when jsonb_typeof(p_mandal->'tags') = 'array'
        then array(select jsonb_array_elements_text(p_mandal->'tags'))
      else null
    end,
    p_mandal->>'timings',
    p_mandal->>'official_contact',
    p_mandal->>'photo_url',
    (p_mandal->>'is_public')::boolean,
    'crowdsourced',
    'unverified'
  returning slug into v_slug;

  update submissions
  set status = 'approved',
      moderator_notes = p_moderator_notes,
      reviewed_at = now(),
      reviewed_by = coalesce(p_reviewed_by, reviewed_by)
  where id = p_submission_id;

  return v_slug;
end;
$$;

revoke all on function approve_new_mandal_submission(uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function approve_new_mandal_submission(uuid, jsonb, text, uuid)
  to service_role;

create function approve_edit_mandal_submission(
  p_submission_id uuid,
  p_mandal_id uuid,
  p_patch jsonb,
  p_moderator_notes text,
  p_reviewed_by uuid default null
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
    -- Three-way, matching the same jsonb-null trap as above: a real array
    -- sets tags, an explicit JSON null clears them, an absent key leaves
    -- them alone. The old `p_patch ? 'tags'` form raised 22023 on an
    -- explicit null, since key-exists is true for a null-valued key.
    tags = case
      when jsonb_typeof(p_patch->'tags') = 'array'
        then array(select jsonb_array_elements_text(p_patch->'tags'))
      when jsonb_typeof(p_patch->'tags') = 'null' then null
      else tags
    end,
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
  set status = 'approved',
      moderator_notes = p_moderator_notes,
      reviewed_at = now(),
      reviewed_by = coalesce(p_reviewed_by, reviewed_by)
  where id = p_submission_id;

  return v_slug;
end;
$$;

revoke all on function approve_edit_mandal_submission(uuid, uuid, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function approve_edit_mandal_submission(uuid, uuid, jsonb, text, uuid)
  to service_role;
