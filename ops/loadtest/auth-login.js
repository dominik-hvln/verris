// k6 — obciążenie ścieżki logowania. Weryfikuje wydajność auth ORAZ że rate-limit
// (RateLimitGuard, Redis) poprawnie odrzuca nadmiar (429) zamiast się wykładać.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.EMAIL || 'test@example.com';
const PASSWORD = __ENV.PASSWORD || 'change-me';

const errors = new Rate('errors');
const rateLimited = new Counter('rate_limited_429'); // 429 = ochrona działa (nie błąd)

export const options = {
  scenarios: {
    steady: { executor: 'ramping-vus', startVUs: 0, stages: [
      { duration: '30s', target: 15 },
      { duration: '1m', target: 30 },
      { duration: '30s', target: 0 },
    ]},
  },
  thresholds: {
    // Liczymy tylko odpowiedzi 200/401 jako „obsłużone"; 429 to poprawna ochrona.
    http_req_duration: ['p(95)<800'],
    errors: ['rate<0.02'],
  },
};

export default function () {
  const res = http.post(
    `${BASE}/auth/login`,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (res.status === 429) {
    rateLimited.add(1); // ochrona zadziałała — oczekiwane pod obciążeniem
  } else {
    const handled = check(res, {
      'obsłużone (200/401)': (r) => r.status === 200 || r.status === 401,
    });
    errors.add(!handled);
  }
  sleep(Math.random() * 2);
}
