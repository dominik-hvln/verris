import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 13.10 — kontener API dostaje tylko zmienne wypisane w `environment:` serwisu api w `docker-compose.prod.yml`
 * (bez env_file). Zmienna czytana przez API, a nieprzekazana w compose, po wpisaniu do `.env.prod` nic nie robi:
 * tak było z ALERT_PUSH_URL (push alarmów strażnika węzła) — alarmy szłyby tylko do panelu i e-mailem.
 */
const KORZEN = resolve(import.meta.dirname, '../../../..');
const compose = readFileSync(resolve(KORZEN, 'docker-compose.prod.yml'), 'utf-8');
const srodowiskoApi = (() => {
  const start = compose.indexOf('\n  api:\n');
  const reszta = compose.slice(start + 1);
  const nastepny = reszta.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
  return nastepny < 0 ? reszta : reszta.slice(0, nastepny + 1);
})();

describe('compose produkcji przekazuje do API zmienne, które API czyta', () => {
  it.each(['ALERT_PUSH_URL', 'ALERT_PUSH_TOKEN'])('%s jest w environment serwisu api', (nazwa) => {
    expect(srodowiskoApi).toMatch(/^\n? {2}api:\n/);
    expect(srodowiskoApi).toContain('CONTROL_PLANE_MAIL_HOST'); // to blok api, nie cały plik
    expect(srodowiskoApi).not.toContain('GF_SMTP_FROM_ADDRESS');
    expect(srodowiskoApi).toContain(`${nazwa}: \${${nazwa}:-}`);
  });
});
