-- Secondary indexes (scope.md §4 Indexes). Slug uniqueness lives here rather
-- than as an inline column constraint so schema definition (0001) and
-- indexing strategy (0002) stay separable, per design-plan.md Milestone 1.

create unique index mandals_slug_key on mandals(slug);
create index mandals_area_idx on mandals(area);
create index mandals_zone_idx on mandals(zone);
create index submissions_status_idx on submissions(status);
