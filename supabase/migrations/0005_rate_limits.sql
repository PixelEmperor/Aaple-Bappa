-- Fixed-window rate limiting for public writes (scope.md §10, design-plan.md
-- Milestone 7). Simpler than a token bucket while meeting the same goal:
-- bound how often a given key (session id or IP) can call submissions.create.

create table rate_limits (
  key          text primary key,
  count        int not null default 1,
  window_start timestamptz not null default now()
);

-- No policies: only the service-role connection touches this table. The
-- rate limiter runs server-side inside submissions.create, never exposed
-- directly to anon/authenticated.
alter table rate_limits enable row level security;

-- `for update` locks the row for the duration of the function call, so
-- concurrent requests for the SAME key serialize instead of racing on a
-- read-then-write (requests for different keys don't contend at all).
create or replace function rate_limit_check(p_key text, p_window_seconds int, p_max_requests int)
returns boolean
language plpgsql
security definer
as $$
declare
  v_row rate_limits%rowtype;
begin
  select * into v_row from rate_limits where key = p_key for update;

  if not found then
    insert into rate_limits (key, count, window_start) values (p_key, 1, now());
    return true;
  end if;

  if now() - v_row.window_start > (p_window_seconds || ' seconds')::interval then
    update rate_limits set count = 1, window_start = now() where key = p_key;
    return true;
  end if;

  if v_row.count >= p_max_requests then
    return false;
  end if;

  update rate_limits set count = count + 1 where key = p_key;
  return true;
end;
$$;
