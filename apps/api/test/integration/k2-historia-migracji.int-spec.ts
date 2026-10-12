/**
 * PRZEGLĄD 12.10 — K2: po zmianie właściciela nowy właściciel widzi dane starego hostingu poprzedniego właściciela.
 * Uruchom: DATABASE_URL=… npx vitest run -c vitest.integration.config.ts test/integration/k2-historia-migracji.int-spec.ts
 *
 * Był CZERWONY przed poprawką. Stary przepływ przeniesienia strony (migration-orchestrator.service.ts:216
 * requestExternalMigration) zapisuje w SubscriptionEvent MIGRATION_EXTERNAL_REQUESTED: sourceHost, sourcePort,
 * sourceUsername, sourcePath, notes i sourceSecretEnc (zaszyfrowane hasło). K2 czyści tylko MigrationRequest
 * (sourceBundleEnc), a zdarzenia zostają przy usłudze i są zwracane klientowi:
 *  - GET services/:id/migrations/timeline → listMigrationTimelineForUser (host, login, ścieżka, notatki; sekret jako „[encrypted]”),
 *  - GET services/:id → events (take 20) przez oczyscDetailsZdarzeniaKlienta, która NIE wycina sourceSecretEnc (szyfrogram).
 */
import { SubscriptionStatus } from '@verris/database';
import { MigrationOrchestratorService } from '../../src/subscriptions/migration-orchestrator.service.js';
import { oczyscDetailsZdarzeniaKlienta } from '../../src/subscriptions/services.controller.js';
import { ZmianaWlascicielaService } from '../../src/subscriptions/zmiana-wlasciciela.service.js';
import { zdarzeniaUslugiDlaKlienta } from '../../src/subscriptions/zdarzenia-klienta.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

const DNI = 86_400_000;

describe('K2 — dane starego hostingu poprzedniego właściciela po przeniesieniu (przegląd 12.10)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('nowy właściciel nie widzi hosta, loginu, ścieżki i notatek z przeniesienia strony poprzedniego właściciela', async () => {
    const p = prisma();
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    await p.user.update({ where: { id: k.user.id }, data: { emailVerifiedAt: new Date() } });
    const sub = await p.subscription.update({
      where: { id: k.subscription.id },
      data: { status: SubscriptionStatus.ACTIVE, paymentSource: 'WALLET', currentPeriodStart: new Date(Date.now() - 5 * DNI), currentPeriodEnd: new Date(Date.now() + 25 * DNI) },
    });
    // Zlecenie starego przepływu, już przyjęte (QUEUED) — K2 go nie blokuje.
    const wniosek = await p.subscriptionEvent.create({
      data: {
        subscriptionId: sub.id,
        type: 'MIGRATION_EXTERNAL_REQUESTED',
        details: { sourceType: 'FTP', sourceHost: 'ftp.stary-hosting-a.pl', sourcePort: 21, sourceUsername: 'jan.kowalski', sourcePath: '/public_html', notes: 'hasło do WP: admin/…', sourceSecretEnc: 'v1:zaszyfrowane-haslo-A' },
      },
    });
    await p.subscriptionEvent.create({ data: { subscriptionId: sub.id, type: 'MIGRATION_EXTERNAL_QUEUED', details: { requestId: wniosek.id } } });

    const B = await p.user.create({ data: { email: `k2r-b-${Date.now()}@test.verris.pl`, passwordHash: 'x', emailVerifiedAt: new Date() } });
    const admin = await p.user.create({ data: { email: `k2r-admin-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const zmiana = new ZmianaWlascicielaService(p as never, { send: vi.fn().mockResolvedValue({}) } as never, { get: () => 'https://panel.test' } as never);
    await zmiana.przenies({ subscriptionId: sub.id, operator: { userId: admin.id, role: 'ADMIN' }, email: B.email, powod: 'Sprzedaż sklepu — zgłoszenie obu stron', potwierdzenie: B.email });

    // Panel nowego właściciela: oś migracji usługi (ten sam serwis co kontroler GET services/:id/migrations/timeline).
    const orkiestrator = Object.assign(Object.create(MigrationOrchestratorService.prototype), { prisma: p }) as MigrationOrchestratorService;
    const os = await orkiestrator.listMigrationTimelineForUser(sub.id, B.id);
    expect(JSON.stringify(os)).not.toContain('ftp.stary-hosting-a.pl');
    expect(JSON.stringify(os)).not.toContain('jan.kowalski');
    expect(JSON.stringify(os)).not.toContain('hasło do WP');

    // GET services/:id — „Co się działo” (ostatnie 20 zdarzeń) po oczyszczeniu dla klienta (ten sam filtr co kontroler).
    const zdarzenia = await p.subscriptionEvent.findMany({ where: await zdarzeniaUslugiDlaKlienta(p, sub.id), orderBy: { createdAt: 'desc' }, take: 20 });
    const dlaKlienta = JSON.stringify(zdarzenia.map((e) => oczyscDetailsZdarzeniaKlienta(e.details as never)));
    expect(dlaKlienta).not.toContain('jan.kowalski');
    expect(dlaKlienta).not.toContain('zaszyfrowane-haslo-A');
    // Nowy właściciel widzi samo przejęcie usługi.
    expect(zdarzenia.map((e) => e.type)).toEqual(['OWNER_CHANGED']);
    // Usługa bez zmiany właściciela — klient widzi całą historię.
    const bezZmiany = '00000000-0000-4000-8000-000000000000';
    expect(await zdarzeniaUslugiDlaKlienta(p, bezZmiany)).toEqual({ subscriptionId: bezZmiany });
    // Szyfrogram hasła starego hostingu nie trafia do klienta nawet w zdarzeniu jego własnej usługi.
    expect(oczyscDetailsZdarzeniaKlienta({ sourceHost: 'h', sourceSecretEnc: 'v1:x' } as never)).toEqual({ sourceHost: 'h' });
  });
});
