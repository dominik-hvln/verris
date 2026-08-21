// k6 — realistyczny mix zalogowanego użytkownika (dashboard/portfel/subskrypcje).
// Wymaga TOKEN (Bearer) konta testowego. Odwzorowuje typowe odczyty panelu.
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:3000';
const TOKEN = __ENV.TOKEN || '';
const errors = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '2m', target: 40 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<900'],
    errors: ['rate<0.02'],
  },
};

const H = { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } };

export default function () {
  if (!TOKEN) {
    throw new Error('Ustaw TOKEN (Bearer konta testowego).');
  }
  // Typowe odczyty panelu klienta — dostosuj ścieżki do realnych endpointów.
  group('dashboard reads', () => {
    const endpoints = ['/subscriptions', '/billing/wallet', '/domains', '/tickets'];
    for (const ep of endpoints) {
      const res = http.get(`${BASE}${ep}`, H);
      const ok = check(res, { [`${ep} 2xx/4xx`]: (r) => r.status < 500 });
      errors.add(!ok);
      sleep(0.5);
    }
  });
  sleep(Math.random() * 2);
}
