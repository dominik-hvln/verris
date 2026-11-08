import { BadRequestException } from '@nestjs/common';
import { InvoicesService } from '../billing/invoices.service.js';
import { PlansService } from '../plans/plans.service.js';
import { NodeSelectorService } from './node-selector.service.js';
import { produktAplikacyjny } from './produkt-aplikacyjny.js';
import { opisOdnowienia, zmianaOkresu } from './renewal.scheduler.js';
import { Prisma } from '@verris/database';
import { kreatorProBezHostinguTemplate, subscriptionCancelledTemplate, subscriptionSuspendedTemplate } from '../mail/templates/billing-lifecycle-notifications.js';

/**
 * Paczka 121 — Kreator Pro idzie torem subskrypcji jak e-mail marketing. Te testy pilnują rozgałęzień, które
 * produkt dostał w istniejącym torze (bez drugiego systemu odnowień): rozpoznanie produktu aplikacyjnego,
 * odmowa konta na węźle, nazwa pozycji na fakturze (portfel i karta), blokada zmiany rodzaju planu.
 */
describe('Kreator Pro w torze subskrypcji', () => {
  it('produkt aplikacyjny: e-mail marketing i Kreator Pro; hosting i poczta – nie', () => {
    expect(['EMAIL_MARKETING', 'KREATOR_PRO', 'HOSTING', 'EMAIL', null].map(produktAplikacyjny)).toEqual([true, true, false, false, false]);
  });

  it('wybór węzła odmawia planowi Kreator Pro (bez konta na serwerze)', async () => {
    const sel = new NodeSelectorService({} as never);
    await expect(sel.pickServerForPlan({ slug: 'kreator-pro', productKind: 'KREATOR_PRO' } as never)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('odnowienie z portfela: opis obciążenia = pozycja faktury „abonament”, inne produkty bez zmian', () => {
    const koniec = new Date('2026-12-08T10:00:00Z');
    expect(opisOdnowienia({ interval: 'MONTH', plan: { slug: 'kreator-pro', name: 'Verris Kreator Pro', productKind: 'KREATOR_PRO' } }, koniec)).toBe(
      'Verris Kreator Pro – abonament miesięczny, okres 08.12.2026–08.01.2027',
    );
    expect(opisOdnowienia({ interval: 'YEAR', plan: { slug: 'verris-hosting', name: 'Verris Hosting', productKind: 'HOSTING' } }, koniec)).toBe(
      'Auto-renewal verris-hosting (YEAR)',
    );
  });

  it('faktura za płatność kartą (Stripe): pozycja „Verris Kreator Pro – abonament roczny”', async () => {
    const prisma = {
      subscription: {
        findUnique: vi.fn(async () => ({ interval: 'YEAR', plan: { name: 'Verris Kreator Pro', productKind: 'KREATOR_PRO' }, account: null })),
      },
    };
    const svc = new InvoicesService(prisma as never, null as never, null as never, null as never, null as never, null as never, null as never, null as never, null as never);
    const etykieta = (svc as unknown as { buildLineItemLabel: (i: unknown) => Promise<string> }).buildLineItemLabel;
    expect(await etykieta.call(svc, { subscriptionId: 's1' })).toBe('Verris Kreator Pro – abonament roczny');
    prisma.subscription.findUnique.mockResolvedValueOnce({ interval: 'MONTH', plan: { name: 'Verris Hosting', productKind: 'HOSTING' }, account: { domain: 'a.pl' } } as never);
    expect(await etykieta.call(svc, { subscriptionId: 's1' })).toBe('Verris Hosting – subskrypcja miesięczna (a.pl)');
  });

  it('mail o końcu abonamentu Kreator Pro: strony zostają, bez „usuwania danych” konta hostingowego', () => {
    const wspolne = { to: 'a@b.pl', firstName: null, serviceName: 'Verris Kreator Pro', dataDeletedAt: new Date('2026-12-22T00:00:00Z'), panelUrl: 'https://panel.verris.pl' };
    const koniec = subscriptionCancelledTemplate({
      ...wspolne, cancelledAt: new Date('2026-12-08T00:00:00Z'), effectiveUntil: new Date('2026-12-08T00:00:00Z'), userInitiated: false, kreatorPro: true,
    });
    expect(koniec.text).toContain('Opublikowane strony działają dalej; elementy Pro znikną przy następnej publikacji');
    expect(koniec.text).not.toContain('usuwane trwale');
    const zawieszenie = subscriptionSuspendedTemplate({ ...wspolne, suspendedAt: new Date(), paymentUpdateUrl: 'x', kreatorPro: true });
    expect(zawieszenie.text).not.toContain('trwale usunięte');
    expect(zawieszenie.subject).not.toContain('dane do');
    // Hosting – bez zmian.
    expect(subscriptionCancelledTemplate({ ...wspolne, serviceName: 'Hosting', cancelledAt: new Date(), effectiveUntil: new Date(), userInitiated: true }).text).toContain(
      'usuwane trwale',
    );
  });

  it('admin nie zmieni rodzaju planu aplikacyjnego (Kreator Pro → hosting dostałby pakiet DA)', async () => {
    const prisma = { plan: { findUnique: vi.fn(async () => ({ id: 'p', productKind: 'KREATOR_PRO', priceMonthly: 9.9, priceYearly: 99 })), update: vi.fn() } };
    const svc = new PlansService(prisma as never, null as never, null as never, null as never);
    await expect(svc.update('p', { productKind: 'HOSTING' } as never, 'admin')).rejects.toThrow('usługa aplikacyjna');
    expect(prisma.plan.update).not.toHaveBeenCalled();
  });

  it('paczka 123 – zmiana okresu przy odnowieniu: nowy okres i cena z planu; bez planu zmiany albo ten sam okres – nic', () => {
    const plan = { priceMonthly: new Prisma.Decimal('9.90'), priceYearly: new Prisma.Decimal('99.00') };
    expect(zmianaOkresu({ interval: 'MONTH', nastepnyInterwal: 'YEAR', plan })).toEqual({ interval: 'YEAR', cena: new Prisma.Decimal('99.00') });
    expect(zmianaOkresu({ interval: 'YEAR', nastepnyInterwal: 'MONTH', plan })?.cena.toFixed(2)).toBe('9.90');
    expect(zmianaOkresu({ interval: 'YEAR', nastepnyInterwal: 'YEAR', plan })).toBeNull();
    expect(zmianaOkresu({ interval: 'YEAR', nastepnyInterwal: null, plan })).toBeNull();
    expect(opisOdnowienia({ interval: 'YEAR', plan: { slug: 'kreator-pro', name: 'Verris Kreator Pro', productKind: 'KREATOR_PRO' } }, new Date('2026-12-08T10:00:00Z'))).toBe(
      'Verris Kreator Pro – abonament roczny, okres 08.12.2026–08.12.2027',
    );
  });

  it('paczka 123 – mail „Kreator Pro nie odnowi się – brak hostingu”: data końca, strony zostają, link do kreatora', () => {
    const m = kreatorProBezHostinguTemplate({ to: 'a@b.pl', firstName: null, aktywnyDo: new Date('2026-12-08T10:00:00Z'), panelUrl: 'https://panel.verris.pl' });
    expect(m.subject).toBe('[Verris] Kreator Pro nie odnowi się – brak hostingu');
    expect(m.text).toContain('wyłączyliśmy automatyczne odnowienie');
    expect(m.text).toContain('Opłacony okres kończy się 8 grudnia 2026');
    expect(m.text).toContain('https://panel.verris.pl/dashboard/kreator');
    expect(kreatorProBezHostinguTemplate({ to: 'a@b.pl', firstName: 'Ola', aktywnyDo: null, panelUrl: 'https://panel.verris.pl' }).text).toContain('Abonament zakończyliśmy');
  });
});
