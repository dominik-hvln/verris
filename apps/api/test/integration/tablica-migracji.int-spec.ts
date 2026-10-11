import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MigrationStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { NotificationsService } from '../../src/notifications/notifications.service.js';
import { TablicaMigracjiService } from '../../src/subscriptions/tablica-migracji.service.js';
import { UsersService } from '../../src/users/users.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * D11 — tablica migracji na prawdziwej bazie: przejścia etapów blokowane checklistą, „Sprawdź DNS” w kontekście
 * operatora, raport do klienta (mail z szablonu, aktywność klienta „obsługa Verris (zgłoszenie #…)”), cofnięcie
 * z powodem, wyścig dwóch przejść, log kontaktów ze zgłoszeniem klienta i alert terminu w dzwonku zespołu.
 * Sprawdzenie DNS (MigrationCutoverService.verify) zastąpione atrapą zapisującą dziennik jak prawdziwa metoda.
 */
describe('D11 — tablica migracji obsługi', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  async function przygotuj(o: { status?: MigrationStatus; createdAt?: Date } = {}) {
    const p = prisma();
    const k = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const n = Date.now();
    const rolaL2 = await p.staffRole.create({ data: { name: `L2-${n}`, permissions: ['TICKETS_VIEW', 'MIGRATIONS_MANAGE'] } });
    const rolaL1 = await p.staffRole.create({ data: { name: `L1-${n}`, permissions: ['TICKETS_VIEW'] } });
    const l2 = await p.user.create({ data: { email: `l2-${n}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rolaL2.id } });
    const l2b = await p.user.create({ data: { email: `l2b-${n}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rolaL2.id } });
    const l1 = await p.user.create({ data: { email: `l1-${n}@test.verris.pl`, passwordHash: 'x', role: 'STAFF', staffRoleId: rolaL1.id } });
    const zgl = await p.ticket.create({ data: { userId: k.user.id, subject: 'Migracja – 1 strona, 2 skrzynki', message: 'x' } });
    const mig = await p.migrationRequest.create({
      data: {
        subscriptionId: k.subscription.id,
        userId: k.user.id,
        sourceBundleEnc: 'x',
        targetDomain: k.account.domain,
        status: o.status ?? MigrationStatus.COMPLETED,
        ticketId: zgl.id,
        ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      },
    });

    const audit = new AuditService(p as never);
    const maile: Array<{ to: string; subject: string; text: string; html?: string }> = [];
    let mailDziala = true;
    const mailer = {
      send: async (m: { to: string; subject: string; text: string; html?: string }) => {
        if (!mailDziala) return { delivered: false };
        maile.push(m);
        return { delivered: true };
      },
    };
    const cutover = {
      verify: async (subscriptionId: string, userId: string, id: string) => {
        const teraz = new Date();
        await p.migrationRequest.update({ where: { id }, data: { cutoverAt: teraz, cutoverMode: 'ns' } });
        await audit.record({ action: 'MIGRATION_CUTOVER_DNS_APPLIED', userId, actorUserId: userId, details: { subscriptionId, migrationRequestId: id, mode: 'ns' } });
        return { status: 'done', message: 'Domena jest delegowana na nasze serwery nazw.', cutoverAt: teraz.toISOString() };
      },
    };
    const svc = new TablicaMigracjiService(p as never, audit, mailer as never, new NotificationsService(p as never), cutover as never);
    return { p, k, l1, l2, l2b, zgl, mig, svc, maile, wylaczMail: () => (mailDziala = false), wlaczMail: () => (mailDziala = true) };
  }

  it('pełna ścieżka: checklista blokuje przejścia, DNS potwierdzony, raport do klienta, zamknięcie', async () => {
    const { p, k, l2, zgl, mig, svc, maile } = await przygotuj();
    const op = { userId: l2.id, role: 'STAFF' };

    await svc.zmienEtap(mig.id, { etap: 'TESTY' }, op);
    await expect(svc.zmienEtap(mig.id, { etap: 'DO_ZMIANY_DNS' }, op)).rejects.toThrow(/TTL domen zmienione na 300 · Wynik testu strony/);
    await svc.checklista(mig.id, { pole: 'ttl300', wartosc: true }, op);
    await svc.checklista(mig.id, { pole: 'testTymczasowy', wartosc: 'PageSpeed 92 / TTFB 160 ms na adresie tymczasowym' }, op);
    // Zapis atomowy: druga pozycja nie skasowała pierwszej.
    const c = (await p.migrationRequest.findUniqueOrThrow({ where: { id: mig.id } })).checklista as Record<string, unknown>;
    expect(Object.keys(c).sort()).toEqual(['testTymczasowy', 'ttl300']);
    await svc.zmienEtap(mig.id, { etap: 'DO_ZMIANY_DNS' }, op);

    await expect(svc.zmienEtap(mig.id, { etap: 'PO_PRZELACZENIU' }, op)).rejects.toThrow(/Sprawdź DNS/);
    expect(await svc.sprawdzDns(mig.id, op)).toMatchObject({ dns: { status: 'done' }, dalej: { etap: 'PO_PRZELACZENIU', braki: [] } });
    // Sprawdzenie z panelu obsługi zapisuje operatora, nie klienta.
    const dns = await p.auditLog.findFirstOrThrow({ where: { action: 'MIGRATION_CUTOVER_DNS_APPLIED', userId: k.user.id } });
    expect(dns.actorUserId).toBe(l2.id);
    const po = await svc.zmienEtap(mig.id, { etap: 'PO_PRZELACZENIU', oknoDni: 7 }, op);
    const okno = new Date(po.poprawkiDo!).getTime() - Date.now();
    expect(okno).toBeGreaterThan(6.9 * 86400_000);
    expect(okno).toBeLessThanOrEqual(7 * 86400_000);

    // Raport: braki → 400; tekst z nazwą oprogramowania serwera do klienta nie przejdzie.
    await expect(svc.wyslijRaport(mig.id, op)).rejects.toThrow(/Podsumowanie dla klienta/);
    await expect(svc.checklista(mig.id, { pole: 'optymalizacja', wartosc: 'Włączyliśmy cache w DirectAdmin' }, op)).rejects.toThrow(/trafi do klienta/);
    await expect(svc.checklista(mig.id, { pole: 'testPo', wartosc: 'Serwer 203.0.113.7 odpowiada w 90 ms' }, op)).rejects.toThrow(/trafi do klienta/);
    await svc.checklista(mig.id, { pole: 'podsumowanie', wartosc: 'Przenieśliśmy stronę sklepu i 2 skrzynki.\n- poczta działa od rana' }, op);
    await svc.checklista(mig.id, { pole: 'optymalizacja', wartosc: 'Włączyliśmy cache strony i kompresję obrazów.' }, op);
    await svc.checklista(mig.id, { pole: 'testPrzed', wartosc: 'LCP 4,1 s, TTFB 900 ms' }, op);
    await svc.checklista(mig.id, { pole: 'testPo', wartosc: 'LCP 1,3 s, TTFB 160 ms' }, op);
    await expect(svc.zmienEtap(mig.id, { etap: 'ZAMKNIETA' }, op)).rejects.toThrow(/Raport pomigracyjny nie został wysłany/);

    const podglad = await svc.podgladRaportu(mig.id);
    expect(podglad.braki).toEqual([]);
    expect(podglad.temat).toBe(`Raport z przeniesienia ${k.account.domain}`);
    await svc.wyslijRaport(mig.id, op);
    expect(maile).toHaveLength(1);
    expect(maile[0]).toMatchObject({ to: k.user.email, subject: `Raport z przeniesienia ${k.account.domain}` });
    expect(maile[0].text).toContain('LCP 4,1 s, TTFB 900 ms');
    expect(maile[0].text).toContain('LCP 1,3 s, TTFB 160 ms');
    expect(maile[0].text).toContain(`#${zgl.id.slice(0, 8)}`);
    // Myślnik operatora zostaje tekstem w akapicie, a nie listą HTML.
    expect(maile[0].html).toContain('<br/>- poczta działa od rana');
    expect(`${maile[0].text}${maile[0].html}`).not.toMatch(/DirectAdmin|CloudLinux|Exim|Hetzner|2222/i);

    // Klient widzi raport w aktywności jako działanie obsługi ze zgłoszenia, bez nazwiska; etapów i kontaktów nie.
    const aktywnosc = await new UsersService(p as never, null as never, null as never, null as never, null as never, null as never).listMyActivity(k.user.id);
    expect(aktywnosc.events.map((e) => [e.action, e.actor, e.context])).toEqual([
      ['MIGRATION_REPORT_SENT', `obsługa Verris (zgłoszenie #${zgl.id.slice(0, 8)})`, k.account.domain],
    ]);

    const zamknieta = await svc.zmienEtap(mig.id, { etap: 'ZAMKNIETA' }, op);
    expect(zamknieta.etap).toBe('ZAMKNIETA');
    expect(zamknieta.terminStan).toBeNull();
    // Oś czasu ma przejścia etapów, sprawdzenie DNS i raport — z operatorem.
    const akcje = zamknieta.os.filter((w) => w.typ === 'zdarzenie').map((w) => (w as { akcja: string }).akcja);
    expect(akcje.filter((a) => a === 'MIGRATION_STAGE_CHANGED')).toHaveLength(4);
    expect(akcje).toEqual(expect.arrayContaining(['MIGRATION_CUTOVER_DNS_APPLIED', 'MIGRATION_REPORT_SENT']));
  });

  it('cofnięcie tylko z powodem (w dzienniku); dwa równoczesne przejścia — jedno 409', async () => {
    const { p, k, l2, l2b, mig, svc } = await przygotuj();
    await svc.zmienEtap(mig.id, { etap: 'TESTY' }, { userId: l2.id, role: 'STAFF' });
    await expect(svc.zmienEtap(mig.id, { etap: 'NOWA' }, { userId: l2.id, role: 'STAFF' })).rejects.toThrow(/powód cofnięcia/);
    await svc.zmienEtap(mig.id, { etap: 'NOWA', powod: 'Klient prosi o wstrzymanie do poniedziałku' }, { userId: l2.id, role: 'STAFF' });
    const wpis = await p.auditLog.findFirstOrThrow({ where: { action: 'MIGRATION_STAGE_CHANGED', userId: k.user.id, actorUserId: l2.id }, orderBy: { createdAt: 'desc' } });
    expect(wpis.details).toMatchObject({ z: 'TESTY', na: 'NOWA', kierunek: 'wstecz', powod: 'Klient prosi o wstrzymanie do poniedziałku' });

    const wyniki = await Promise.allSettled([
      svc.zmienEtap(mig.id, { etap: 'TESTY' }, { userId: l2.id, role: 'STAFF' }),
      svc.zmienEtap(mig.id, { etap: 'TESTY' }, { userId: l2b.id, role: 'STAFF' }),
    ]);
    expect(wyniki.map((w) => w.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect((await p.migrationRequest.findUniqueOrThrow({ where: { id: mig.id } })).etapObslugi).toBe('TESTY');
  });

  it('automat w toku blokuje „Testy u nas”; anulowanej nie ma na tablicy', async () => {
    const { p, k, l2, mig, svc } = await przygotuj({ status: MigrationStatus.RUNNING });
    await expect(svc.zmienEtap(mig.id, { etap: 'TESTY' }, { userId: l2.id, role: 'STAFF' })).rejects.toThrow(/Automat nie skończył/);
    const t = await svc.tablica({ aktor: { userId: l2.id, role: 'STAFF' } });
    expect(t.kolumny.NOWA.map((x) => x.id)).toEqual([mig.id]);
    expect(t.kolumny.NOWA[0]!.dalej).toEqual({ etap: 'TESTY', braki: ['Automat nie skończył przenoszenia danych (stan: w toku)'] });
    await p.migrationRequest.create({ data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: MigrationStatus.CANCELED } });
    expect(Object.values((await svc.tablica({ aktor: { userId: l2.id, role: 'STAFF' } })).kolumny).flat()).toHaveLength(1);
  });

  it('log kontaktów: tylko zgłoszenie tego klienta; wpis na osi czasu z kanałem i operatorem', async () => {
    const { p, l2, zgl, mig, svc } = await przygotuj();
    const obcy = await utworzKonto({ serverId: (await utworzWezel()).id, planId: (await utworzPlan()).id });
    const obceZgl = await p.ticket.create({ data: { userId: obcy.user.id, subject: 'Inne', message: 'x' } });
    const op = { userId: l2.id, role: 'STAFF' };
    await expect(svc.kontakt(mig.id, { kanal: 'TELEFON', tresc: 'Rozmowa o DNS', zgloszenie: `#${obceZgl.id.slice(0, 8)}` }, op)).rejects.toThrow(/Nie ma takiego zgłoszenia/);
    await expect(svc.kontakt(mig.id, { kanal: 'TELEFON', tresc: 'Rozmowa', kiedy: new Date(Date.now() + 86400_000).toISOString() }, op)).rejects.toThrow(/z przyszłości/);
    const o = await svc.kontakt(mig.id, { kanal: 'TELEFON', tresc: 'Klient zmieni NS jutro o 8:00.', zgloszenie: `#${zgl.id.slice(0, 8)}` }, op);
    expect(o.os.find((w) => w.typ === 'kontakt')).toMatchObject({ kanal: 'TELEFON', tresc: 'Klient zmieni NS jutro o 8:00.', ticketId: zgl.id, kto: l2.email });
  });

  it('przypisanie tylko do operatora z uprawnieniem do migracji; przypisany dostaje powiadomienie', async () => {
    const { p, l1, l2, l2b, zgl, mig, svc } = await przygotuj();
    const op = { userId: l2.id, role: 'STAFF' };
    await expect(svc.ustaw(mig.id, { przypisanyDoId: l1.id }, op)).rejects.toThrow(/tylko aktywnemu operatorowi/);
    const o = await svc.ustaw(mig.id, { przypisanyDoId: l2b.id, przerywacz: true, wygasaUStaregoAt: '2026-12-01T00:00:00.000Z', zgloszenie: null }, op);
    expect(o).toMatchObject({ przerywacz: true, przypisany: { id: l2b.id, email: l2b.email }, wygasaUStaregoAt: '2026-12-01T00:00:00.000Z', ticketId: null });
    expect(o.operatorzy.map((x) => x.id).sort()).toEqual([l2.id, l2b.id].sort());
    const n = await p.notification.findMany({ where: { userId: l2b.id } });
    expect(n.map((x) => x.title)).toEqual([expect.stringMatching(/^Przerywacz · Przypisano Ci migrację/)]);
    await svc.ustaw(mig.id, { zgloszenie: zgl.id }, op);
    expect((await p.migrationRequest.findUniqueOrThrow({ where: { id: mig.id } })).ticketId).toBe(zgl.id);
  });

  it('alert terminu: raz na stan; bez przypisania — wszyscy z uprawnieniem do migracji, z przypisaniem — prowadzący', async () => {
    const { p, l1, l2, l2b, mig, svc } = await przygotuj({ createdAt: new Date(Date.now() - 50 * 3600_000) });
    // 50 h od utworzenia: do terminu 3 dni zostały 22 h — „termin się zbliża”.
    expect(await svc.alertTerminow()).toBe(1);
    expect(await svc.alertTerminow()).toBe(0);
    const tytuly = async (id: string) => (await p.notification.findMany({ where: { userId: id } })).map((x) => [x.title, x.severity]);
    expect(await tytuly(l2.id)).toEqual([[expect.stringContaining('termin się zbliża'), 'warning']]);
    expect(await tytuly(l2b.id)).toHaveLength(1);
    expect(await tytuly(l1.id)).toEqual([]);

    // Termin minął (operator przestawił go na wczoraj) — nowy alert „po terminie”, tylko do prowadzącego.
    await svc.ustaw(mig.id, { przypisanyDoId: l2.id, termin: new Date(Date.now() - 3600_000).toISOString() }, { userId: l2b.id, role: 'STAFF' });
    expect(await svc.alertTerminow()).toBe(1);
    expect((await tytuly(l2.id)).filter(([t]) => String(t).includes('po terminie'))).toEqual([[expect.any(String), 'critical']]);
    expect((await tytuly(l2b.id)).filter(([t]) => String(t).includes('po terminie'))).toEqual([]);
  });

  it('audyt Fal 2 — historia sprzed tablicy: po migracji danych bez alertów „po terminie”; nieudana bez terminu i znika z tablicy', async () => {
    const dawno = new Date(Date.now() - 40 * 86400_000);
    const { p, k, l2, mig, svc } = await przygotuj({ status: MigrationStatus.ATTENTION, createdAt: dawno });
    const nieudana = await p.migrationRequest.create({
      data: { subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', targetDomain: k.account.domain, status: MigrationStatus.FAILED, createdAt: dawno },
    });
    const sql = readFileSync(resolve(import.meta.dirname, '../../../../libs/database/prisma/migrations/20261011235000_migracja_tablica_termin_historii/migration.sql'), 'utf8');
    await p.$executeRawUnsafe(sql);
    await p.$executeRawUnsafe(sql); // idempotentna — drugi przebieg nie przesuwa terminu
    const po = await p.migrationRequest.findUniqueOrThrow({ where: { id: mig.id } });
    expect(po.termin!.getTime()).toBeGreaterThan(Date.now() + 2.9 * 86400_000);
    expect((await p.migrationRequest.findUniqueOrThrow({ where: { id: nieudana.id } })).termin).toBeNull();
    // Pierwszy przebieg alertu po wdrożeniu: nic (termin za 3 dni, nieudana bez terminu).
    expect(await svc.alertTerminow()).toBe(0);
    expect(await p.notification.count({ where: { userId: l2.id } })).toBe(0);
    // Nieudana sprzed ponad 14 dni nie wisi w kolumnie „Nowa”; aktywna — tak, z terminem „ok”.
    await p.migrationRequest.update({ where: { id: nieudana.id }, data: { updatedAt: dawno } });
    const t = await svc.tablica({ aktor: { userId: l2.id, role: 'STAFF' } });
    expect(t.kolumny.NOWA.map((x) => x.id)).toEqual([mig.id]);
    expect(t.kolumny.NOWA[0].termin).toMatchObject({ stan: 'ok' });
    expect(t.alerty).toEqual({ poTerminie: 0, blisko: 0 });
  });

  it('przegląd D11 — ponowne otwarcie zamkniętej migracji daje nowe okno poprawek; zmiana etapu nie powtarza alertu', async () => {
    const { p, l2, mig, svc } = await przygotuj({ createdAt: new Date(Date.now() - 50 * 3600_000) });
    const op = { userId: l2.id, role: 'STAFF' };
    // Termin się zbliża — jeden alert; przejście do „Testy u nas” przy tym samym terminie nie wysyła go drugi raz.
    expect(await svc.alertTerminow()).toBe(1);
    await svc.zmienEtap(mig.id, { etap: 'TESTY' }, op);
    expect(await svc.alertTerminow()).toBe(0);

    // Zamknięta 10 dni temu (okno poprawek dawno minęło), klient zgłasza błąd — obsługa otwiera ją ponownie.
    const dawno = new Date(Date.now() - 10 * 86400_000);
    await p.migrationRequest.update({
      where: { id: mig.id },
      data: { etapObslugi: 'ZAMKNIETA', cutoverAt: dawno, poprawkiDo: new Date(dawno.getTime() + 7 * 86400_000), raportWyslanyAt: dawno },
    });
    const o = await svc.zmienEtap(mig.id, { etap: 'PO_PRZELACZENIU', powod: 'Klient zgłosił błąd formularza po przeniesieniu' }, op);
    expect(new Date(o.poprawkiDo!).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86400_000);
    expect(o.terminStan).toMatchObject({ rodzaj: 'okno-poprawek', stan: 'ok' });
    expect(await svc.alertTerminow()).toBe(0);
  });

  it('przegląd D11 — wynik testu na tymczasowym adresie też trafia do klienta (eksport RODO): bez adresu węzła', async () => {
    const { l2, mig, svc } = await przygotuj();
    const op = { userId: l2.id, role: 'STAFF' };
    await expect(svc.checklista(mig.id, { pole: 'testTymczasowy', wartosc: 'Podgląd na 203.0.113.7 działa, PageSpeed 92' }, op)).rejects.toThrow(/trafi do klienta/);
    await expect(svc.checklista(mig.id, { pole: 'testTymczasowy', wartosc: 'Podgląd przez CageFS: OK' }, op)).rejects.toThrow(/trafi do klienta/);
    await svc.checklista(mig.id, { pole: 'testTymczasowy', wartosc: 'Podgląd na adresie tymczasowym działa, PageSpeed 92' }, op);
  });

  it('audyt Fal 2 — filtr raportu: fail2ban, lvectl, IPv6 i nazwa hosta węzła z bazy nie przechodzą', async () => {
    const { p, l2, mig, svc } = await przygotuj();
    const op = { userId: l2.id, role: 'STAFF' };
    await p.server.updateMany({ data: { hostname: 'n7.verris-wezly.example' } });
    for (const wartosc of [
      'Odblokowaliśmy Twoje IP w fail2ban po migracji',
      'Limity ustawione przez lvectl zgodnie z planem',
      'Podgląd na 2a01:4f8:c17:1::5 działał bez błędów',
      'Strona działa na n7.verris-wezly.example od wczoraj',
    ]) {
      await expect(svc.checklista(mig.id, { pole: 'podsumowanie', wartosc }, op)).rejects.toThrow(/trafi do klienta/);
    }
    // Wpis sprzed poprawki (zapisany starym filtrem) nie wychodzi w raporcie — wysyłka sprawdza pola ponownie.
    await p.migrationRequest.update({
      where: { id: mig.id },
      data: {
        etapObslugi: 'PO_PRZELACZENIU',
        cutoverAt: new Date(),
        checklista: Object.fromEntries(
          ['podsumowanie', 'optymalizacja', 'testPrzed', 'testPo'].map((k) => [k, { tekst: k === 'podsumowanie' ? 'IP odblokowane w fail2ban' : `tekst ${k}`, at: new Date().toISOString(), przez: l2.id }]),
        ),
      },
    });
    await expect(svc.wyslijRaport(mig.id, op)).rejects.toThrow(/trafi do klienta/);
  });

  it('nieudana wysyłka raportu — raport nie jest oznaczony jako wysłany, zamknięcie dalej zablokowane', async () => {
    const { p, l2, mig, svc, wylaczMail } = await przygotuj();
    await p.migrationRequest.update({
      where: { id: mig.id },
      data: {
        etapObslugi: 'PO_PRZELACZENIU',
        cutoverAt: new Date(),
        checklista: Object.fromEntries(
          ['podsumowanie', 'optymalizacja', 'testPrzed', 'testPo'].map((k) => [k, { tekst: `tekst ${k}`, at: new Date().toISOString(), przez: l2.id }]),
        ),
      },
    });
    wylaczMail();
    await expect(svc.wyslijRaport(mig.id, { userId: l2.id, role: 'STAFF' })).rejects.toThrow(/Nie udało się wysłać/);
    expect((await p.migrationRequest.findUniqueOrThrow({ where: { id: mig.id } })).raportWyslanyAt).toBeNull();
    await expect(svc.zmienEtap(mig.id, { etap: 'ZAMKNIETA' }, { userId: l2.id, role: 'STAFF' })).rejects.toThrow(/Raport/);
  });
});
