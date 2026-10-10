import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
    [`(https://api.verris.pl/me/data-export/download/${TOKEN}).`, '(https://api.verris.pl/me/data-export/download/•••).'],
    // Przegląd 1B: token jako samo zapytanie i dane logowania w adresie przechodziły bez maski.
    [`https://panel.verris.pl/magic?${TOKEN}`, 'https://panel.verris.pl/magic?•••'],
    [`https://login:${TOKEN}@mail.verris.pl/`, 'https://•••@mail.verris.pl/'],
    ['https://panel.verris.pl/pomoc?kategoria', 'https://panel.verris.pl/pomoc?kategoria'],
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
  const svc = (row: unknown) => new EmailLogService({ emailLog: { findUnique: vi.fn().mockResolvedValue(row) } } as never, {} as never);

  it('oddaje wpis bez tokenów (temat i metadata)', async () => {
    const d = await svc(wpis).detail('e1');
    expect(JSON.stringify(d)).not.toContain(TOKEN);
    expect(d.subject).toBe('Twój link: https://panel.verris.pl/reset-password?token=•••');
  });

  it('lista maili klienta też bez tokenów w temacie i błędzie', async () => {
    const s = new EmailLogService({ emailLog: { findMany: vi.fn().mockResolvedValue([{ id: 'e1', subject: wpis.subject, errorMessage: `550 ${TOKEN}` }]) } } as never, {} as never);
    const [w] = await s.listForUser('u1');
    expect(JSON.stringify(w)).not.toContain(TOKEN);
  });

  it('brak wpisu → 404', async () => {
    await expect(svc(null).detail('x')).rejects.toBeInstanceOf(NotFoundException);
  });
});

/** D9 (10.10) — maile klienta dla STAFF z CUSTOMERS_VIEW: tylko konta klientów, każdy odczyt w dzienniku. */
describe('D9 — odczyt korespondencji klienta przez operatora', () => {
  const zrob = (rolaKonta: string | null, wpisUserId: string | null = 'u1') => {
    const audit = { record: vi.fn(async () => undefined) };
    const prisma = {
      user: { findUnique: vi.fn(async () => (rolaKonta ? { role: rolaKonta } : null)) },
      emailLog: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => ({ id: 'e1', userId: wpisUserId, subject: 'Faktura', errorMessage: null, metadata: null })),
      },
    };
    return { svc: new EmailLogService(prisma as never, audit as never), audit };
  };
  const STAFF = { userId: 'op1', role: 'STAFF' as never };
  const ADMIN = { userId: 'adm', role: 'ADMIN' as never };

  it('STAFF: lista maili klienta → wpis w dzienniku (zakładka komunikacja)', async () => {
    const { svc, audit } = zrob('USER');
    await svc.listForUser('u1', 50, STAFF);
    expect(audit.record).toHaveBeenCalledWith({ action: 'OPERATOR_CUSTOMER_CARD_VIEWED', userId: 'u1', actorUserId: 'op1', details: { sekcja: 'komunikacja' } });
  });

  it('STAFF: maile operatora albo nieistniejącego konta — 403 i bez wpisu', async () => {
    for (const rola of ['STAFF', 'ADMIN', null]) {
      const { svc, audit } = zrob(rola);
      await expect(svc.listForUser('x', 50, STAFF)).rejects.toBeInstanceOf(ForbiddenException);
      expect(audit.record).not.toHaveBeenCalled();
    }
  });

  it('STAFF: podgląd wpisu klienta → dziennik z id maila; wpis bez konta (np. do zespołu) — 403', async () => {
    const { svc, audit } = zrob('USER');
    await svc.detail('e1', STAFF);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', actorUserId: 'op1', details: { sekcja: 'mail', emailLogId: 'e1' } }));
    await expect(zrob('USER', null).svc.detail('e1', STAFF)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ADMIN: każde konto, odczyt też w dzienniku', async () => {
    const { svc, audit } = zrob('STAFF');
    await svc.listForUser('op2', 50, ADMIN);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ userId: 'op2', actorUserId: 'adm' }));
  });
});
