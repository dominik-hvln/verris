import { BadRequestException } from '@nestjs/common';
import { ConsentsController } from './consents.controller.js';
import { MarketingPreferencesService } from './marketing-preferences.service.js';

/**
 * A1-06 (paczka 109) — link „Wypisz się”: GET bez skutków (skaner poczty nie wypisze klienta), POST wypisuje,
 * brak tokenu → 400. Na starym kodzie GET od razu wypisywał i zwracał JSON z adresem, a brak tokenu dawał 500.
 */
function stanowisko(istnieje = true) {
  const prefs = {
    tokenWypisuIstnieje: vi.fn(async () => istnieje),
    oneClickUnsubscribe: vi.fn(async () => ({ userEmail: 'jan@firma.pl' })),
  };
  return { c: new ConsentsController({} as never, prefs as never), prefs };
}
const req = { headers: {}, ip: '1.2.3.4' } as never;

describe('Wypis z wiadomości (A1-06)', () => {
  it('GET z ważnym tokenem: strona z przyciskiem POST, bez wypisu i bez adresu e-mail', async () => {
    const { c, prefs } = stanowisko();
    const html = await c.unsubscribe('tok');
    expect(prefs.oneClickUnsubscribe).not.toHaveBeenCalled();
    expect(html).toContain('<form method="post" action="/unsubscribe">');
    expect(html).toContain('Wypisz mnie');
    expect(html).not.toContain('jan@firma.pl');
  });

  it('GET bez tokenu → 400; z nieznanym tokenem → strona „Link nieaktualny”', async () => {
    await expect(stanowisko().c.unsubscribe(undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(await stanowisko(false).c.unsubscribe('zly')).toContain('Link nieaktualny');
  });

  it('POST: token z formularza albo z adresu (one-click RFC 8058) wypisuje', async () => {
    const a = stanowisko();
    expect(await a.c.unsubscribePost(undefined, { token: 'z-formularza' }, req)).toContain('Wypisano');
    expect(a.prefs.oneClickUnsubscribe).toHaveBeenCalledWith('z-formularza', expect.anything());
    const b = stanowisko();
    await b.c.unsubscribePost('z-adresu', { 'List-Unsubscribe': 'One-Click' }, req);
    expect(b.prefs.oneClickUnsubscribe).toHaveBeenCalledWith('z-adresu', expect.anything());
    await expect(stanowisko().c.unsubscribePost(undefined, {}, req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('serwis: pusty token → 400 zamiast wyjątku bazy (500)', async () => {
    const prisma = { marketingPreferences: { findUnique: vi.fn(async () => { throw new Error('Prisma: unsubscribeToken undefined'); }) } };
    const svc = new MarketingPreferencesService(prisma as never, {} as never);
    await expect(svc.oneClickUnsubscribe(undefined as never, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.marketingPreferences.findUnique).not.toHaveBeenCalled();
  });
});
