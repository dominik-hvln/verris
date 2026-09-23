import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HOSTING_MAIL_DAILY_SEND_LIMIT } from '@verris/contracts';

/**
 * E-20 — limit wysyłki pokazany klientowi jest tym, który egzekwuje węzeł.
 *
 * Panel (zakładka Poczta) czyta liczbę z @verris/contracts, a exim na węźle z
 * /etc/virtual/limit zapisywanego przez node-hosting-profile.sh. Dwie kopie jednej
 * liczby rozjadą się przy pierwszej zmianie, jeśli nic tego nie pilnuje — a limit inny
 * niż pokazany to limit ukryty przed klientem.
 */
describe('E-20 — limit wysyłki: panel = węzeł', () => {
  const skrypt = readFileSync(
    resolve(__dirname, '../../../../ops/scripts/node-hosting-profile.sh'),
    'utf-8',
  );

  it('skrypt węzła ustawia tę samą liczbę, którą pokazuje panel', () => {
    const m = skrypt.match(/^\s*MAIL_DAILY_SEND_LIMIT=(\d+)\s*$/m);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(HOSTING_MAIL_DAILY_SEND_LIMIT);
  });

  it('wartość nie jest nadpisywana ze zmiennej środowiskowej', () => {
    expect(skrypt).not.toMatch(/MAIL_DAILY_SEND_LIMIT:-/);
    expect(skrypt).toMatch(/>\s*\/etc\/virtual\/limit/);
  });
});
