// k6 — baseline zdrowia API (bez auth). Weryfikuje /healthz i /readyz pod ruchem.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errors = new Rate('errors');
const BASE = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // rozgrzewka
    { duration: '1m', target: 50 }, // obciążenie
    { duration: '30s', target: 0 }, // wygaszanie
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // p95 < 500 ms
    errors: ['rate<0.01'], // < 1% błędów
  },
};

export default function () {
  const res = http.get(`${BASE}/healthz`);
  const ok = check(res, {
    'status 200': (r) => r.status === 200,
  });
  errors.add(!ok);
  sleep(1);
}
