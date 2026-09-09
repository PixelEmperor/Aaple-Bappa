-- Bounded candidate lookup for the submissions.create duplicate check.
--
-- That check used to `select id, name, slug, area, lat, lng from mandals`
-- with no filter and no limit, on every submission, then score every row in
-- JS. Two problems, both silent:
--
--  * supabase/config.toml sets `max_rows = 1000`, so past 1000 mandals
--    PostgREST truncates the result and duplicate detection quietly starts
--    missing real duplicates — no error, just a wrong answer.
--  * it ran through the anon client, so RLS hid private and flagged mandals
--    from the check entirely (the "known v1 limit" noted in
--    src/server/duplicate-check.ts) — exactly the rows a duplicate
--    submission is most likely to shadow.
--
-- This narrows the candidate set in SQL and hands the survivors to the
-- existing Fuse.js + haversine scoring in src/server/duplicate-check.ts,
-- which is unchanged. Being `security definer` it also sees every mandal,
-- private ones included, while staying service-role-only like the rest.

create extension if not exists pg_trgm with schema extensions;

-- The `%` operator (not `similarity() > x`) is what a GIN trigram index can
-- actually answer, so the name branch below is written with `%` and this
-- index does real work.
create index if not exists mandals_name_trgm_idx
  on mandals using gin (name extensions.gin_trgm_ops);

-- Supports the bounding-box branch; the pre-existing indexes cover only
-- area/zone/slug.
create index if not exists mandals_lat_lng_idx on mandals(lat, lng);

/*
 * Two independent branches, unioned, each with its own cap — deliberately
 * NOT one query with a shared `order by similarity desc limit n`. The
 * precise check in duplicate-check.ts flags a duplicate on *either* a close
 * name (>= 0.82) or physical proximity (<= 250m with a loosely similar
 * name), and those are different populations: ranking a combined result set
 * by name similarity alone lets a few hundred name matches push a
 * next-door mandal off the end of the limit, silently losing the proximity
 * half of the check. Separate caps mean neither branch can starve the other.
 *
 * Both thresholds are looser than duplicate-check.ts's, since this stage
 * only has to avoid discarding anything the precise scoring would have
 * matched: a Fuse score of 0.82 implies near-identical strings, far above a
 * 0.25 trigram floor, and 0.006 degrees is ~650m at Mumbai's latitude,
 * comfortably outside the 250m ring.
 */
create or replace function mandal_duplicate_candidates(
  p_name text,
  p_lat double precision,
  p_lng double precision
)
returns table (
  id uuid,
  name text,
  slug text,
  area text,
  lat double precision,
  lng double precision
)
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  -- Trigram floor for the name branch. Set per-call rather than relying on
  -- the session default (0.3), because Supabase pools connections: a
  -- session-level set_limit() from one request would leak into the next.
  -- set_config(..., is_local => true) scopes it to this transaction.
  v_name_threshold constant text := '0.25';
  v_box constant double precision := 0.006;
  v_branch_limit constant int := 200;
begin
  perform set_config('pg_trgm.similarity_threshold', v_name_threshold, true);

  return query
    (
      select m.id, m.name, m.slug, m.area, m.lat, m.lng
      from mandals m
      where m.name operator(extensions.%) p_name
      order by extensions.similarity(m.name, p_name) desc
      limit v_branch_limit
    )
    union
    (
      select m.id, m.name, m.slug, m.area, m.lat, m.lng
      from mandals m
      where m.lat between p_lat - v_box and p_lat + v_box
        and m.lng between p_lng - v_box and p_lng + v_box
      limit v_branch_limit
    );
end;
$$;

revoke all on function mandal_duplicate_candidates(text, double precision, double precision)
  from public, anon, authenticated;
grant execute on function mandal_duplicate_candidates(text, double precision, double precision)
  to service_role;
