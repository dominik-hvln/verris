import { NotFoundException } from '@nestjs/common';
import { EmailLogService } from './email-log.service.js';
import { MASKA, maskujTekst, maskujWartosc } from './maskowanie.js';

/**
 * Fala 1B — podgląd maila na karcie klienta: linki jednorazowe i tokeny nigdy w całości. Na starym kodzie
 * `detail()` oddawał wpis 1:1 (metadata.listUnsubscribeUrl z tokenem wypisu szedł do panelu).
 */
const TOKEN = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

describe('maskowanie linków jednorazowych w dzienniku poczty', () => {
  it.each([
    [`https://panel.verris.pl/reset-password?token=${TOKEN}`, 'https://panel.verris.pl/reset-password?token=•••'],
    [`https://panel.verris.pl/verify-email?token=${TOKEN}`, 'https://panel.verris.pl/verify-email?token=•••'],
    [`https://panel.verris.pl/confirm-email-change?token=abc`, 'https://panel.verris.pl/confirm-email-change?token=•••'],
    [`https://api.verris.pl/unsubscribe?token=${encodeURIComponent('x/y+z=')}`, 'https://api.verris.pl/unsubscribe?token=•••'],
    [`https://api.verris.pl/me/data-export/download/${TOKEN}`, 'https://api.verris.pl/me/data-export/download/•••'],
    [`https://panel.verris.pl/magic#${TOKEN}`, 'https://panel.verris.pl/magic#•••'],
    [`https://panel.verris.pl/login?code=123456&next=/dashboard`, 'https://panel.verris.pl/login?code=•••&next=/dashboard'],
  ])('%s', (wej, wyj) => {
    expect(maskujTekst(wej)).toBe(wyj);
  });

  it('zwykłe linki i tekst zostają czytelne', () => {
    expect(maskujTekst('Faktura VFV/2026/10/0001 — https://verris.pl/pomoc/a/poczta')).toBe(
      'Faktura VFV/2026/10/0001 — https://verris.pl/pomoc/a/poczta',
    );
  });

  it('token bez linku i JWT w treści błędu też są maskowane', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const wynik = maskujTekst(`kod ${TOKEN}; nagłówek ${jwt}`);
    expect(wynik).not.toContain(TOKEN);
    expect(wynik).not.toContain('dozjgNryP4J3jVmNHl0w5N');
    expect(wynik).toContain(MASKA);
  });

  it('maskuje napisy w zagnieżdżonym JSON', () => {
    const m = maskujWartosc({ replyTo: 'bok@verris.pl', listUnsubscribeUrl: `https://api.verris.pl/unsubscribe?token=${TOKEN}`, n: 3, l: [`token ${TOKEN}`] });
    expect(JSON.stringify(m)).not.toContain(TOKEN);
    expect(m.replyTo).toBe('bok@verris.pl');
    expect(m.n).toBe(3);
  });
});

describe('EmailLogService.detail', () => {
  const wpis = {
    id: 'e1',
    subject: `Twój link: https://panel.verris.pl/reset-password?token=${TOKEN}`,
    errorMessage: null,
    metadata: { listUnsubscribeUrl: `https://api.verris.pl/unsubscribe?token=${TOKEN}` },
  };
  const svc = (row: unknown) => new EmailLogService({ emailLog: { findUnique: vi.fn().mockResolvedValue(row) } } as never);

  it('oddaje wpis bez tokenów (temat i metadata)', async () => {
    const d = await svc(wpis).detail('e1');
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(d.subject).toBe('Twój link: https://panel.verris.pl/reset-password?token=•••');
  });

  it('brak wpisu → 404', async () => {
    await expect(svc(null).detail('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});
