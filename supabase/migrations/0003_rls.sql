-- Row Level Security (scope.md §10, design-plan.md Milestone 1).
--
-- Moderator/service-role writes bypass RLS entirely (the service-role key
-- used by tRPC's moderatorProcedure). Authorization for those writes is
-- enforced in that middleware, not at the DB layer, so the check lives in
-- one auditable place (design-plan.md §3). RLS here is defense-in-depth for
-- the anon/authenticated roles the public app actually uses.

alter table mandals enable row level security;

create policy mandals_public_read on mandals
  for select using (is_public = true and verification_status <> 'flagged');

-- No insert/update/delete policy for anon/authenticated: RLS defaults to
-- deny once enabled, so those are already blocked without an explicit rule.

alter table submissions enable row level security;

create policy submissions_public_insert on submissions
  for insert with check (status = 'pending');

-- No select/update/delete policy: public may insert only, never read back
-- the moderation queue (matches scope.md §10's "public may INSERT only").

alter table helplines enable row level security;

create policy helplines_public_read on helplines for select using (true);

-- moderators holds role membership, not user-facing content: RLS is enabled
-- with no policies at all, so anon/authenticated get zero access by
-- default and only the service-role connection can read/write it.
alter table moderators enable row level security;
