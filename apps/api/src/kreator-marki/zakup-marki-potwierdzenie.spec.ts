import { Prisma } from '@verris/database';
import { ZakupMarkiService } from './zakup-marki.js';
import { DOMYSLNA_KONFIGURACJA_MARKI } from './konfiguracja-marki.js';
import { chwilaPl, kreatorMarkiZakupTemplate } from '../mail/templates/kreator-marki-notifications.js';

/**
 * Dokumenty 1.4.0 (Regulamin §13b ust. 13) – prawo odstąpienia od Pakietu marki i kolejnej marki wygasa dopiero, gdy
 * konsument dostanie potwierdzenie zgody na dostarczenie treści cyfrowej na trwałym nośniku (art. 21 ust. 1 i art. 38
 * ust. 1 pkt 13 ustawy o prawach konsumenta). Paczka 131 zapisywała zgodę tylko w bazie i dzienniku – maila nie było.
 * Na starym kodzie czerwone: ZakupMarkiService nie wysyłał żadnej wiadomości po udostępnieniu zakupu.
 */

const ZGODA = new Date('2026-11-20T13:05:00Z');

function stanowisko(zmienionych = 1) {
  const zakup = {
    id: 'z1',
    userId: 'u1',
    rodzaj: 'PAKIET' as const,
    status: 'OCZEKUJE' as const,
    metoda: 'karta',
    kwotaBrutto: new Prisma.Decimal('149.00'),
    walletTxId: null,
    zgodaTresciCyfrowejAt: ZGODA,
    serie: 0,
    zmianyAi: 0,
    serieUzyte: 0,
    zmianyAiUzyte: 0,
    aktualizacjeDo: null,
    oplaconoAt: null,
    createdAt: ZGODA,
  };
  const prisma = {
    kreatorMarkaZakup: {
      findFirst: vi.fn(async () => zakup),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async () => ({ count: zmienionych })),
    },
    user: { findUnique: vi.fn(async () => ({ email: 'anna@firma.pl', firstName: 'Anna', walletBalance: 500 })) },
  };
  const ledger = { debit: vi.fn(async () => ({ id: 'wtx1' })) };
  const audit = { record: vi.fn(async () => undefined) };
  const konfiguracja = { konfiguracja: vi.fn(async () => DOMYSLNA_KONFIGURACJA_MARKI) };
  const mailer = { send: vi.fn(async () => ({ ok: true })) };
  const config = { get: vi.fn(() => 'https://panel.verris.test/') };
  const svc = new ZakupMarkiService(prisma as never, ledger as never, audit as never, undefined, konfiguracja as never, mailer as never, config as never);
  return { svc, mailer, prisma };
}

describe('Kreator marki – potwierdzenie zakupu i zgody na treść cyfrową (Regulamin §13b ust. 13)', () => {
  it('po udostępnieniu Pakietu wysyła jeden e-mail z datą zgody, udostępnienia i utratą prawa odstąpienia', async () => {
    const { svc, mailer } = stanowisko();
    await svc.realizujPoWplacie('u1', 'z1');
    expect(mailer.send).toHaveBeenCalledTimes(1);
    const m = (mailer.send.mock.calls[0] as unknown as [{ to: string; subject: string; text: string; userId: string; category: string; tag: string }])[0];
    expect(m.to).toBe('anna@firma.pl');
    expect(m.userId).toBe('u1');
    expect(m.category).toBe('TRANSACTIONAL');
    expect(m.tag).toBe('kreator-marki.zakup');
    expect(m.subject).toBe('[Verris] Potwierdzenie zakupu – Pakiet marki');
    expect(m.text).toContain(`Przy zakupie (${chwilaPl(ZGODA)}) zaznaczono zgodę na rozpoczęcie dostarczania tej treści cyfrowej przed upływem 14-dniowego terminu odstąpienia`);
    expect(m.text).toContain('prawo odstąpienia od umowy w zakresie tego zakupu wygasło (Regulamin §13b ust. 13 i §21 ust. 5)');
    expect(m.text).toContain('potwierdzeniem tej zgody na trwałym nośniku');
    expect(m.text).toContain('149,00 zł brutto');
    expect(m.text).toContain(`Dodatkowe serie propozycji: ${DOMYSLNA_KONFIGURACJA_MARKI.pakiet.serie}`);
    expect(m.text).toContain('https://panel.verris.test/legal/terms');
  });

  it('powtórna realizacja tej samej wpłaty (zakup już opłacony) nie wysyła drugiego e-maila', async () => {
    const { svc, mailer } = stanowisko(0);
    await svc.realizujPoWplacie('u1', 'z1');
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('błąd poczty nie cofa zakupu (treść jest już udostępniona)', async () => {
    const { svc, mailer, prisma } = stanowisko();
    mailer.send.mockRejectedValueOnce(new Error('SMTP'));
    await expect(svc.realizujPoWplacie('u1', 'z1')).resolves.toBeUndefined();
    expect(prisma.kreatorMarkaZakup.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'OPLACONY' }) }));
  });

  it('szablon: kolejna marka, dane sprzedawcy, czas polski, bez pauzy „—”', () => {
    const m = kreatorMarkiZakupTemplate({
      to: 'a@b.pl',
      firstName: null,
      rodzaj: 'DRUGA_MARKA',
      kwotaBrutto: '49.00',
      metoda: 'portfel',
      zgodaAt: ZGODA,
      udostepnionoAt: ZGODA,
      panelUrl: 'https://panel.verris.pl',
    });
    expect(m.subject).toBe('[Verris] Potwierdzenie zakupu – Kolejna marka w Kreatorze marki');
    expect(chwilaPl(ZGODA)).toBe('20 listopada 2026 r., godz. 14:05');
    expect(m.text).toContain('HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, NIP 9292069367');
    expect(m.text).toContain('jedna marka więcej na koncie');
    expect(m.text).toContain('Regulamin §13b ust. 4–6');
    expect(`${m.text}${m.html}`).not.toContain('—');
  });
});
