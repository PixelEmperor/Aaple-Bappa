# Security hardening — deploy runbook

Companion to the code changes in the security pass. Everything here is a step that
**cannot be verified from the repo** — it needs the live Supabase project or the Vercel
environment. Work through it before the production deploy.

## 1. Verify the RPC exposure on the live project (do this first)

The most serious issue this pass fixed was that `approve_new_mandal_submission`,
`approve_edit_mandal_submission` and `rate_limit_check` were `security definer` with no
`revoke` anywhere in the migrations. Postgres grants `EXECUTE` to `PUBLIC` on new
functions by default, and PostgREST publishes public-schema functions at
`/rest/v1/rpc/<name>`. Whether that was actually reachable depends on when the project was
created (see the `auto_expose_new_tables` note in `supabase/config.toml`), so **check
rather than assume** — the answer determines whether this is a "harden it" or an
"assume compromise" situation.

Against the **live** project, with the anon key (the one already public in the client
bundle):

```bash
PROJECT_URL="https://<ref>.supabase.co"
ANON_KEY="<the anon key from Vercel env>"

curl -i -X POST "$PROJECT_URL/rest/v1/rpc/approve_edit_mandal_submission" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"p_submission_id":"00000000-0000-0000-0000-000000000000",
       "p_mandal_id":"00000000-0000-0000-0000-000000000000",
       "p_patch":{},"p_moderator_notes":null}'
```

- **`401`/`404` (function not found / no access)** — the functions were never exposed.
  Apply migration `0009` anyway; it makes that guarantee explicit instead of incidental.
- **`200`, or a `4xx`/`5xx` that reports a *Postgres* error** (e.g. `mandal ... not found`)
  — the function executed. It was publicly callable. Apply `0009` immediately, then treat
  the `mandals` table as having been writable by anyone: continue to step 2.

Repeat for `rate_limit_check` (`{"p_key":"probe","p_window_seconds":0,"p_max_requests":5}`)
and `approve_new_mandal_submission`.

## 2. If step 1 showed the functions were reachable

Nothing in the schema records who called an RPC, so there's no audit trail to consult —
reconstruct from what is observable:

- Diff `mandals` against the seed import for rows or edits with no corresponding
  `submissions` row (an approve via RPC leaves the queue untouched unless the caller
  supplied a real submission id):

  ```sql
  select m.id, m.slug, m.name, m.source, m.verification_status, m.created_at, m.updated_at
  from mandals m
  where m.source = 'crowdsourced'
    and not exists (
      select 1 from submissions s
      where s.status = 'approved'
        and (s.mandal_id = m.id or s.payload->>'name' = m.name)
    )
  order by m.updated_at desc;
  ```

- Look for rows whose `updated_at` moved without an approved edit submission behind it.
- Check the Supabase dashboard's API logs for `/rest/v1/rpc/approve_*` requests, and for
  `rate_limit_check` calls with a `p_window_seconds` other than 900.

Correct any tampered rows by hand. There is no credential to rotate for this one — the
anon key is public by design and was never the weakness; the missing `revoke` was.

## 3. Apply the migrations

```bash
supabase db push        # applies 0009 and 0010
```

`0010` creates the `pg_trgm` extension in the `extensions` schema and two indexes on
`mandals`. On a large table the index builds take a lock — at this table's size (low
thousands of rows) it's sub-second, but run it outside peak traffic anyway.

Then confirm the lockdown took, as `anon`:

```sql
-- Expect: false for every row.
select p.proname,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'execute') as authed_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('approve_new_mandal_submission', 'approve_edit_mandal_submission',
                    'rate_limit_check', 'mandal_duplicate_candidates');

-- Expect: every security-definer function has a search_path set.
select p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef;
```

Also re-run the Supabase linter (Dashboard → Advisors) and confirm
`function_search_path_mutable` is clear.

## 4. Set `NEXT_PUBLIC_SITE_URL` in Vercel

Required for the CSRF origin check once the custom domain is live: behind Cloudflare the
browser's `Origin` is the custom domain, which neither `VERCEL_URL` nor
`VERCEL_PROJECT_PRODUCTION_URL` knows about. Set it to the canonical public origin, e.g.
`https://aaplebappa.in`, with no trailing slash, for the Production environment.

Preview deploys need nothing — they fall back to `VERCEL_URL`. Leave it unset locally.

**Verify after deploy** (a missing value here means every mutation 403s):

```bash
# Expect a 400 (Zod rejects the empty body) — NOT a 403.
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<domain>/api/trpc/submissions.create" \
  -H "Origin: https://<domain>" -H 'content-type: application/json' --data '{"json":{}}'

# Expect 403.
curl -s -o /dev/null -w '%{http_code}\n' -X POST "https://<domain>/api/trpc/submissions.create" \
  -H "Origin: https://evil.example" -H 'content-type: text/plain' --data '{"json":{}}'
```

## 5. Confirm the rate limiter sees real client IPs

`src/server/client-ip.ts` prefers `cf-connecting-ip`, then `x-real-ip`, then the *last*
hop of the forwarded chain. Cloudflare-in-front-of-Vercel is the configuration it was
written for, but header behaviour is worth confirming once rather than assuming:

```sql
-- After a few real submissions. Keys should be distinct plausible client IPs,
-- not one shared proxy address and not attacker-supplied junk.
select key, count, window_start from rate_limits where key like 'ip:%' order by window_start desc;
```

If every row shows the same address, the edge isn't passing a per-client header and the IP
half of the limiter is doing nothing — revisit before launch, since `session_id` alone is
trivially rotated.

## 6. Headers and HSTS

`curl -I https://<domain>` and confirm the CSP, HSTS, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy` headers are
present, and that `X-Powered-By` is gone.

Two caveats:

- **Don't submit to the HSTS preload list** until the custom domain is final and every
  subdomain is HTTPS — `includeSubDomains; preload` is effectively irreversible on the
  timescale of browser releases.
- **CSP `script-src` keeps `'unsafe-inline'`**, deliberately, because nonces would force
  dynamic rendering and defeat ISR. `src/lib/security-headers.ts` explains the tradeoff.
  If a report-only nonce CSP later proves compatible with static rendering, tighten it.

## 7. Second pass — audit fixes (migration `0011_fix_tags_and_harden.sql`)

A full-app audit after the first pass found one outage and a set of smaller issues. Apply
`0011` in the SQL Editor the same way as `0009`/`0010`.

**The outage.** `approve_new_mandal_submission` could not approve any submission whose
payload had `"tags": null` — which is what `submissions.create` writes whenever a submitter
picks no tags, and what the mandal-dataset import wrote for all 190 of its rows. 194 of 200
pending submissions were affected. `p_mandal->'tags'` returns the jsonb *scalar* `null` for
a JSON null rather than SQL NULL, so `is null` was false and the guard fell through to
`jsonb_array_elements_text('null')`, which raises `22023 cannot extract elements from a
scalar`. Confirmed against the live project before and after the fix. The approve functions
are transactional, so every failure rolled back cleanly — nothing needed repairing.

To verify after applying, approve a previously-failing submission and expect a slug back
rather than `{"code":"22023"}`.

Also in this pass:

- **`reviewed_by`** added to `submissions` and written by `review`/`bulkReview`, so an
  approval can be attributed to a moderator and a compromised account's actions scoped.
- **Range CHECKs** on `mandals.lat`/`lng`/`established_year`, and a CHECK that an
  `edit_mandal` row has a `mandal_id`. Bounds previously lived only in Zod.
- **Write grants revoked** on `mandals`/`helplines` for `anon`/`authenticated`, re-granting
  only `select`. RLS already blocked anon writes (verified live: an anon `PATCH` returns
  zero rows and leaves data intact), so this removes the reliance on RLS as the sole gate.
- **The pre-R2 `mandal-photos` bucket is gone.** It was still `public = true` and anon could
  list it. Verified empty with no `mandals` row referencing it first. Note that it could
  *not* be dropped in SQL: Supabase's `storage.protect_delete` trigger raises
  `42501 Direct deletion from storage tables is not allowed` on any DELETE against
  `storage.buckets`, which aborts the whole migration. It was removed through the Storage
  API instead (`POST /storage/v1/bucket/<id>/empty`, then `DELETE /storage/v1/bucket/<id>`),
  already done against this project; the migration only drops the read policy.

App-side changes shipping alongside: `Sec-Fetch-Site` as the primary CSRF signal (below),
`maxDuration = 60` on the tRPC route with a smaller bulk chunk size, one-hop-at-a-time
redirect validation in `google-maps-link.ts`, `listIds` paginated past `max_rows`, LIKE
wildcards escaped in search, a `page` cap on `mandals.list`, and directory pagination.

### `NEXT_PUBLIC_SITE_URL` is no longer load-bearing for CSRF

It previously was, and that was a launch trap: behind Cloudflare on a custom domain with the
var unset, the origin allowlist matched nothing and **every mutation 403'd**, with no failure
until real traffic arrived. The check now keys off `Sec-Fetch-Site`, which the browser sets,
page script cannot forge, and no configuration can get wrong; the origin allowlist is the
fallback for clients that don't send it. Setting `NEXT_PUBLIC_SITE_URL` is still recommended,
but it is no longer the difference between a working and a broken deploy.

## 8. Still open (not addressed in either pass)

- **Public signup is enabled on the hosted project.** Verified live: `GET /auth/v1/settings`
  returns `"disable_signup": false` with email enabled, so anyone can mint an
  `authenticated` token and a row in `auth.users`. This is *not* privilege escalation — both
  moderator gates require a `moderators` row, and that table is RLS-denied and
  grant-revoked — but it's free attack surface and unbounded user rows. Turn signup off in
  Dashboard → Authentication → Sign In / Providers. Nothing in the repo pins this;
  `supabase/config.toml` governs only the local stack.
- **No MFA on moderator accounts.** Supabase Auth supports TOTP enrollment; the moderator
  set is tiny and holds full write access to public content, so this is worth doing before
  launch. It needs UI work (enroll + challenge), so it wasn't in scope here.
- **No login attempt throttling of our own.** Supabase Auth applies its own limits; if the
  moderator surface needs more, it has to be added around `signInWithPassword`.
- **Rate-limit keys are still partly client-controlled.** `client-ip.ts` now prefers
  `x-real-ip` (which Vercel overwrites, so it can't be forged) over `cf-connecting-ip`,
  closing the trivial bypass of POSTing straight to the `*.vercel.app` origin with a chosen
  `cf-connecting-ip`. `session_id` stays client-minted by design, so the IP key is the real
  limit. Enabling Vercel deployment protection, so the origin is only reachable through
  Cloudflare, would close the remainder.
- ~~**Seed photos vs. R2.**~~ Resolved: `data-pipeline/import_to_supabase.py` now uploads
  to Cloudflare R2 (via `boto3`, mirroring `apps/web/src/lib/r2.ts`'s client config) under a
  `seed/` key prefix, instead of the Supabase Storage `mandal-photos` bucket that `0011`
  dropped. Requires the `CLOUDFLARE_R2_*` vars (see `data-pipeline/.env.example`) — only if
  `--photos-dir` actually contains photos to upload; a photo-less run needs no R2 config.
- **The raw form export** (`Untitled form (Responses).xlsx`) held real submitter names and
  phone numbers in the repo root. It was gitignored and never committed, and has been moved
  out of the working tree to `../aaple-bappa-private/`; it still wants somewhere with real
  access control.
