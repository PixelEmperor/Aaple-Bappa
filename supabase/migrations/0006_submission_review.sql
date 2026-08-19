-- Atomic submission approval (design-plan.md Milestone 8): each function
-- performs its mandals write and the submissions status update in one
-- transaction (a single plpgsql call runs atomically), so a failure partway
-- through can't leave a mandal written while its submission stays `pending`
-- (or vice versa). Slug generation itself stays in the app layer (slug.ts's
-- comment: "never at read time") — these functions take the already-decided
-- slug as input rather than computing it in SQL.

create or replace function approve_new_mandal_submission(
  p_submission_id uuid,
  p_mandal jsonb,
  p_moderator_notes text
) returns text
language plpgsql
security definer
as $$
declare
  v_slug text;
begin
  insert into mandals (
    name, slug, area, lat, lng, established_year, description,
    nearest_station, tags, timings, official_contact, photo_url,
    is_public, source, verification_status
  )
  select
    p_mandal->>'name',
    p_mandal->>'slug',
    p_mandal->>'area',
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

-- Reject is a single UPDATE statement (already atomic) — moderatorProcedure
-- calls .update() on submissions directly, no function needed.
