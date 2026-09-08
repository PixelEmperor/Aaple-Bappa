-- approve_new_mandal_submission never inserted `zone` — the column existed
-- on `mandals` since 0001, but the submit form never collected it and this
-- function's INSERT column list simply omitted it. A moderator can now
-- edit a pending submission's payload before approving (including zone),
-- so it needs to actually land on the row. approve_edit_mandal_submission
-- already handles zone correctly; only the new-mandal path needed this fix.

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
