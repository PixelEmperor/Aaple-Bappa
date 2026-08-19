import http from 'k6/http'
import { check, sleep } from 'k6'

/**
 * Festival-week spike simulation (design-plan.md Milestone 10, scope.md §13
 * & §11's <3s directory/map load target). Run against a real staging
 * deployment, never localhost — the point is to confirm Cloudflare's CDN
 * cache absorbs the spike and Supabase isn't a single point of overload,
 * neither of which a dev server exercises.
 *
 * Usage:
 *   k6 run -e BASE_URL=https://staging.aaplebappa.in load-test/festival-week-spike.js
 */

const BASE_URL = __ENV.BASE_URL
if (!BASE_URL) {
  throw new Error('Set -e BASE_URL=<staging url> — see the usage comment above.')
}

// Ramp shape: a quiet baseline, a sharp visarjan-day-style spike, then a
// cooldown — not a flat load, since scope §13's actual failure mode is a
// sudden crowd surge, not sustained steady traffic.
export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '2m', target: 20 },
    { duration: '1m', target: 200 },
    { duration: '3m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    // 3s target is for a throttled 3G client render, not raw TTFB from a
    // load-testing VM — p95 well under that leaves headroom for real
    // mobile network latency on top.
    http_req_duration: ['p(95)<1000'],
  },
}

export default function () {
  const directory = http.get(`${BASE_URL}/`)
  check(directory, { 'directory loads': (r) => r.status === 200 })

  sleep(1)

  const map = http.get(`${BASE_URL}/map`)
  check(map, { 'map loads': (r) => r.status === 200 })

  sleep(1)
}
