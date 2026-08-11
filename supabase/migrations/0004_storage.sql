-- Storage bucket for mandal photos (scope.md §8, design-plan.md Milestone 1).
-- Public read; all writes go through the server (service-role key, which
-- bypasses RLS) after the submission API validates the upload — no direct
-- client-to-bucket writes, so no insert/update/delete policy is defined
-- here for anon/authenticated.

insert into storage.buckets (id, name, public)
values ('mandal-photos', 'mandal-photos', true)
on conflict (id) do nothing;

create policy mandal_photos_public_read on storage.objects
  for select using (bucket_id = 'mandal-photos');
