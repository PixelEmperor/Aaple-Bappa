-- Core directory + moderation schema (scope.md §4).
-- crowd_reports is intentionally omitted — deferred to a Phase 2 migration
-- per design-plan.md Milestone 1.

create table mandals (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  slug                text not null,
  area                text not null,
  zone                text,
  lat                 double precision not null,
  lng                 double precision not null,
  established_year    int,
  description         text,
  history             text,
  nearest_station     text,
  tags                text[],
  timings             text,
  official_contact    text,
  photo_url           text,
  is_public           boolean not null default true,
  source              text not null check (source in ('seed', 'crowdsourced', 'official')),
  verification_status text not null default 'unverified'
                        check (verification_status in ('unverified', 'verified', 'flagged')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on table mandals is 'The core public directory of Ganpati mandals.';
comment on column mandals.zone is
  'MMR-wide zone, e.g. South Mumbai / Central Mumbai / Western Suburbs / Navi Mumbai / Thane / ... / Other (MMR). Validated in the app layer (Zod), not a DB enum, to keep the list easy to extend.';
comment on column mandals.tags is
  'Predefined tag list (eco-friendly, tallest, oldest, richest, family-friendly). Validated in the app layer (Zod).';

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger mandals_set_updated_at
  before update on mandals
  for each row
  execute function set_updated_at();

-- submissions: moderation queue. Nothing here is public until a moderator
-- approves it and its fields get copied/merged into `mandals`.
create table submissions (
  id                  uuid primary key default gen_random_uuid(),
  type                text not null check (type in ('new_mandal', 'edit_mandal')),
  payload             jsonb not null,
  mandal_id           uuid references mandals(id) on delete set null,
  submitter_contact   text,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected')),
  moderator_notes     text,
  submitted_at        timestamptz not null default now(),
  reviewed_at         timestamptz
);

comment on table submissions is
  'New-mandal and edit proposals awaiting moderator review. mandal_id is set only for edit_mandal submissions.';
comment on column submissions.submitter_contact is
  'Not shown publicly — for moderator follow-up only.';

-- helplines: static reference content, not user-submitted.
create table helplines (
  id       uuid primary key default gen_random_uuid(),
  category text not null check (category in ('police', 'medical', 'traffic', 'bmc_control_room')),
  area     text,
  phone    text not null,
  notes    text
);

comment on column helplines.area is 'NULL means citywide.';

-- moderators: role flag. Membership is managed by a superuser/service-role
-- connection (e.g. the Supabase SQL editor), never through the public API.
create table moderators (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table moderators is
  'Membership grants access to the moderation admin panel (design-plan.md Milestone 8). Seeded manually after the founder''s first login — see supabase/seed.sql.';
