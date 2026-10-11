import { AuditService } from '../../src/common/audit/audit.service.js';
import { AccountDeletionService } from '../../src/compliance/account-deletion.service.js';
import { prisma, rozlacz, utworzKonto, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * X-04 — usunięcie konta (RODO art. 17) na prawdziwej bazie: anonimizacja po okresie karencji,
 * cofnięcie wniosku, które wyprzedziło przebieg harmonogramu, oraz usunięcie konta z węzła,
 * które zwalnia pojemność węzła raz, nie dwa razy. DirectAdmin i poczta są atrapami.
 */
let daDelete: string[] = [];
let opoznienieMs = 0;
const da = {
  getClientForServer: async () => ({
    deleteAccount: async (u: string) => {
      await new Promise((r) => setTimeout(r, opoznienieMs));
      daDelete.push(u);
    },
    suspendAccount: async () => undefined,
  }),
  domenyKontaPrzedUsunieciem: async (a: { domain: string }) => [a.domain],
  usunDelegacjeUsunietegoKonta: async () => undefined,
};
const magazyn = new Map<string, Buffer>();
const serwis = () => {
  const p = prisma() as never;
  const storage = { removeObject: async (_b: string, k: string) => void magazyn.delete(k) };
  return new AccountDeletionService(p, new AuditService(p), da as never, { send: async () => ({}) } as never, { get: () => undefined } as never, storage as never);
};

async function zWnioskiem(minionyTermin = true) {
  const wezel = await utworzWezel();
  const plan = await utworzPlan({ productKind: 'HOSTING' });
  const k = await utworzKonto({ serverId: wezel.id, planId: plan.id });
  const termin = new Date(Date.now() + (minionyTermin ? -60_000 : 14 * 864e5));
  await prisma().accountDeletionRequest.create({ data: { userId: k.user.id, scheduledFor: termin } });
  await prisma().user.update({ where: { id: k.user.id }, data: { deletionRequestedAt: new Date() } });
  return { ...k, wezel };
}
const uzytkownik = (id: string) => prisma().user.findUniqueOrThrow({ where: { id } });

describe('X-04 usunięcie konta (RODO)', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    daDelete = [];
    opoznienieMs = 0;
  });
  afterAll(rozlacz);

  it('po terminie: konto zanonimizowane, usługi anulowane, wniosek zamknięty', async () => {
    const k = await zWnioskiem();
    await prisma().subscription.update({ where: { id: k.subscription.id }, data: { status: 'ACTIVE' } });
    const s = serwis();
    for (const id of await s.listDue()) await s.executeAnonymization(id, null);
    expect((await uzytkownik(k.user.id)).anonymizedAt).not.toBeNull();
    expect((await prisma().subscription.findUniqueOrThrow({ where: { id: k.subscription.id } })).status).toBe('CANCELED');
    expect((await prisma().accountDeletionRequest.findUniqueOrThrow({ where: { userId: k.user.id } })).anonymizedAt).not.toBeNull();
  });

  it('przegląd D11 — log kontaktów i checklista obsługi migracji znikają z anonimizacją; zlecenie zostaje', async () => {
    const k = await zWnioskiem();
    const mig = await prisma().migrationRequest.create({
      data: {
        subscriptionId: k.subscription.id, userId: k.user.id, sourceBundleEnc: 'x', status: 'COMPLETED',
        checklista: { podsumowanie: { tekst: 'Klient prosił o telefon po 16.', at: new Date().toISOString(), przez: 'op' } },
        kontakty: { create: { kanal: 'TELEFON', tresc: 'Rozmowa z klientem o DNS.', kiedy: new Date() } },
      },
    });
    await serwis().executeAnonymization(k.user.id, null);
    expect(await prisma().migracjaKontakt.count({ where: { migrationRequestId: mig.id } })).toBe(0);
    expect((await prisma().migrationRequest.findUniqueOrThrow({ where: { id: mig.id } })).checklista).toEqual({});
  });

  it('audyt Fal 2 — notatki w wątku, tagi, powód blokady wysyłki i jawne adresy z wniosków znikają; wnioski zostają', async () => {
    const k = await zWnioskiem();
    const p = prisma();
    const stary = k.user.email;
    const nowy = `Nowy-${Date.now()}@Firma-klienta.pl`;
    const op = await p.user.create({ data: { email: `op-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const obcy = `x${stary}`; // inny adres, który zawiera adres klienta — zostaje
    await p.account.update({ where: { id: k.account.id }, data: { mailBlockedAt: new Date(), mailBlockedById: op.id, mailBlockedReason: 'Nadużycie #ab12: zgłoszenie od abuse@zglaszajacy.example' } });
    const zgl = await p.ticket.create({ data: { userId: k.user.id, subject: 'Poczta', message: 'Nie wysyła', tags: ['vip', 'trudny-klient'] } });
    await p.ticketReply.createMany({
      data: [
        { ticketId: zgl.id, authorId: k.user.id, message: 'Dalej nie działa.' },
        { ticketId: zgl.id, authorId: op.id, isStaff: true, internal: true, message: 'Klient dzwonił zdenerwowany, ma drugi numer.' },
      ],
    });
    const w = await p.operatorRequest.create({
      data: {
        type: 'CUSTOMER_EMAIL_CHANGE', customerId: k.user.id, requestedById: op.id, payload: { newEmail: nowy },
        justification: `Klient Jan Kowalski prosił telefonicznie, stary adres ${stary}`, status: 'APPROVED', decidedById: op.id,
        decisionReason: 'Potwierdzone hasłem z umowy', result: { komunikat: `Adres e-mail zmieniony na ${nowy.toLowerCase()}.` },
      },
    });
    await p.auditLog.createMany({
      data: [
        { action: 'OPERATOR_REQUEST_SUBMITTED', userId: k.user.id, actorUserId: op.id, details: { wniosekId: w.id, payload: { newEmail: nowy }, uzasadnienie: `Jan Kowalski, ${stary}` } },
        { action: 'OPERATOR_REQUEST_APPROVED', userId: k.user.id, actorUserId: op.id, details: { wniosekId: w.id, wynik: { komunikat: `Adres e-mail zmieniony na ${nowy}.` } } },
      ],
    });
    await p.notification.createMany({
      data: [
        { userId: op.id, category: 'SYSTEM', title: 'Wniosek do decyzji: zmiana e-maila', body: `Ktoś prosi o: Zmiana adresu e-mail na ${nowy.toLowerCase()} · klient ${stary}. Uzasadnienie: …` },
        { userId: op.id, category: 'SYSTEM', title: 'Inny klient', body: `klient ${obcy}` },
      ],
    });

    await serwis().executeAnonymization(k.user.id, null);

    expect(await p.ticketReply.count({ where: { ticketId: zgl.id } })).toBe(1);
    expect((await p.ticket.findUniqueOrThrow({ where: { id: zgl.id } })).tags).toEqual([]);
    expect(await p.account.findUniqueOrThrow({ where: { id: k.account.id } })).toMatchObject({ mailBlockedReason: null, mailBlockedById: op.id });
    const po = await p.operatorRequest.findUniqueOrThrow({ where: { id: w.id } });
    expect(po).toMatchObject({ type: 'CUSTOMER_EMAIL_CHANGE', status: 'APPROVED', justification: '[zanonimizowano]', decisionReason: '[zanonimizowano]' });
    expect(po.payload).toEqual({ newEmail: '[zanonimizowano]' });
    expect(po.result).toEqual({ komunikat: 'Adres e-mail zmieniony na [zanonimizowano].' });
    const dziennik = JSON.stringify(await p.auditLog.findMany({ where: { userId: k.user.id, action: { startsWith: 'OPERATOR_REQUEST_' } } }));
    expect(dziennik).not.toMatch(new RegExp(`${nowy}|${stary}|Kowalski`.replace(/\./g, '\\.'), 'i'));
    const dzwonki = await p.notification.findMany({ where: { userId: op.id }, orderBy: { title: 'asc' } });
    expect(dzwonki.map((n) => n.body)).toEqual([`klient ${obcy}`, 'Ktoś prosi o: Zmiana adresu e-mail na [zanonimizowano] · klient [zanonimizowano]. Uzasadnienie: …']);
  });

  it('przegląd poprawek — kopie uzasadnienia i powodu odrzucenia w dzwonkach i dzienniku oraz adres sprzed zmiany przez obsługę znikają', async () => {
    const k = await zWnioskiem();
    const p = prisma();
    const ts = Date.now();
    const sprzedZmiany = `stary-${ts}@poczta-klienta.pl`;
    const op = await p.user.create({ data: { email: `op2-${ts}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const decydujacy = await p.user.create({ data: { email: `op3-${ts}@test.verris.pl`, passwordHash: 'x', role: 'ADMIN' } });
    const uzasadnienie = 'Klientka Anna Nowak dzwoniła z numeru 600 100 200, prosi o reset.';
    const powodOdrzucenia = 'Anna Nowak nie podała hasła z umowy, oddzwonić na 600 100 200';
    const w = await p.operatorRequest.create({
      data: {
        type: 'CUSTOMER_PASSWORD_RESET', customerId: k.user.id, requestedById: op.id, payload: {}, justification: uzasadnienie,
        status: 'REJECTED', decidedById: decydujacy.id, decisionReason: powodOdrzucenia,
      },
    });
    await p.auditLog.createMany({
      data: [
        // Adres sprzed zmiany przez obsługę (users.admin.service.ts changeCustomerEmail) — bieżący adres jest już inny.
        { action: 'CUSTOMER_EMAIL_CHANGED', userId: k.user.id, actorUserId: op.id, details: { fromEmail: sprzedZmiany, toEmail: k.user.email, reason: null } },
        { action: 'OPERATOR_REQUEST_REJECTED', userId: k.user.id, actorUserId: decydujacy.id, details: { wniosekId: w.id, wnioskujacyUserId: op.id, powod: powodOdrzucenia } },
      ],
    });
    await p.notification.createMany({
      data: [
        // wnioski.service.ts powiadomDecydujacych (przy złożeniu — klient miał jeszcze stary adres) i powiadomWnioskujacego.
        { userId: decydujacy.id, category: 'SYSTEM', link: '/wnioski', title: 'Wniosek do decyzji: reset hasła', body: `Ktoś prosi o: Reset hasła · klient ${sprzedZmiany}. Uzasadnienie: ${uzasadnienie}` },
        { userId: op.id, category: 'SYSTEM', link: '/wnioski?zakladka=moje', title: 'Wniosek odrzucony: reset hasła', body: `Decydujący: ${powodOdrzucenia}` },
        // Cudzy wniosek z innym uzasadnieniem — zostaje.
        { userId: decydujacy.id, category: 'SYSTEM', link: '/wnioski', title: 'Wniosek do decyzji: reset hasła', body: 'Ktoś prosi o: Reset hasła · klient inny@firma.pl. Uzasadnienie: Inny klient prosi o reset.' },
      ],
    });

    await serwis().executeAnonymization(k.user.id, null);

    const dzwonki = JSON.stringify(await p.notification.findMany({ where: { userId: { in: [op.id, decydujacy.id] } } }));
    expect(dzwonki).not.toMatch(/Nowak|600 100 200/);
    expect(dzwonki).not.toContain(sprzedZmiany);
    expect(dzwonki).toContain('Uzasadnienie: Inny klient prosi o reset.');
    expect(dzwonki).toContain('Uzasadnienie: [zanonimizowano]');
    expect(dzwonki).toContain('Decydujący: [zanonimizowano]');
    const dziennik = JSON.stringify(await p.auditLog.findMany({ where: { userId: k.user.id, action: { startsWith: 'OPERATOR_REQUEST_' } } }));
    expect(dziennik).not.toMatch(/Nowak|600 100 200/);
  });

  it('audyt Fali 3 — kopie powodów (dziennik, zdarzenia), wyniki zadań węzła kont i pliki poczty przychodzącej znikają', async () => {
    const k = await zWnioskiem();
    const p = prisma();
    const op = await p.user.create({ data: { email: `op4-${Date.now()}@test.verris.pl`, passwordHash: 'x', role: 'STAFF' } });
    const powod = 'Klient stracił pracę, zapłaci 15-go — prosił o przesunięcie (Jan Kowalski)';
    const zgl = await p.ticket.create({ data: { userId: k.user.id, subject: 'Faktura', message: 'x', escalationReason: powod, riskFlag: 'ABUSE', riskReason: powod } });
    await p.ticketEvent.createMany({
      data: [
        { ticketId: zgl.id, type: 'MERGED_FROM', actorId: op.id, meta: { zrodlo: 'z1', reason: powod } },
        { ticketId: zgl.id, type: 'STATUS_CHANGED', actorId: op.id, meta: { from: 'OPEN', to: 'CLOSED' } },
      ],
    });
    await p.subscriptionEvent.create({ data: { subscriptionId: k.subscription.id, type: 'SUSPENDED', details: { reason: 'ABUSE', note: powod } } });
    await p.auditLog.createMany({
      data: [
        { action: 'OPERATOR_ACCOUNT_CHANGED', userId: k.user.id, actorUserId: op.id, details: { akcja: 'zmiana-daty-odnowienia', powod, wynik: 'ok' } },
        { action: 'OPERATOR_DOMAIN_CHANGED', userId: k.user.id, actorUserId: op.id, details: { akcja: 'ns', powod } },
        { action: 'TICKET_MERGED', userId: k.user.id, actorUserId: op.id, details: { zrodlo: 'z1', cel: zgl.id, reason: powod } },
        { action: 'OUTBOUND_CORDON_APPLIED', userId: k.user.id, details: { reason: `Blokada wysyłki konta przez obsługę: ${powod}`, source: 'operator' } },
        { action: 'SUBSCRIPTION_SUSPENDED', userId: k.user.id, actorUserId: op.id, details: { reason: 'ABUSE', note: powod } },
        { action: 'SUBSCRIPTION_SUSPENDED', userId: k.user.id, details: { reason: 'NON_PAYMENT', note: null } },
        // Przegląd poprawek Fali 3 — ten sam rodzaj wolnego tekstu w innych wpisach zespołu na koncie klienta.
        { action: 'TICKET_ESCALATED', userId: k.user.id, actorUserId: op.id, details: { ticketId: zgl.id, reason: powod, priority: 'URGENT' } },
        { action: 'CUSTOMER_RISK_FLAG_UPDATED', userId: k.user.id, actorUserId: op.id, details: { ticketId: zgl.id, riskFlag: 'ABUSE', reason: powod } },
        { action: 'SUBSCRIPTION_CANCELED', userId: k.user.id, actorUserId: op.id, details: { subscriptionId: k.subscription.id, immediate: true, source: 'ADMIN', powod } },
      ],
    });
    // Zadania węzła kont klienta z danymi osobowymi; zadanie innego rodzaju zostaje.
    await p.nodeTask.createMany({
      data: [
        { serverId: k.wezel.id, accountId: k.account.id, kind: 'IP_BLOCKS', status: 'COMPLETED', payload: { mode: 'unban', ip: '198.51.100.23' }, outputLog: 'VERRIS_IPB 203.0.113.50 sshd' },
        { serverId: k.wezel.id, accountId: k.account.id, kind: 'WAF_HITS', status: 'COMPLETED', payload: { domains: 'x.pl' }, outputLog: 'VERRIS_WAF 203.0.113.60 /reset/abc' },
        { serverId: k.wezel.id, accountId: k.account.id, kind: 'MAIL_LOG', status: 'COMPLETED', payload: { domains: 'x.pl', address: 'ania@obca.pl' }, outputLog: 'ania@obca.pl' },
        { serverId: k.wezel.id, accountId: k.account.id, kind: 'DISK_USAGE', status: 'COMPLETED', payload: { path: '/' }, outputLog: 'public_html 10M' },
      ],
    });
    const pocztaId = '5c0d0000-0000-4000-8000-0000000000aa';
    magazyn.set(`poczta/${pocztaId}/zrzut.jpg`, Buffer.from('x'));
    magazyn.set('poczta/inny/plik.pdf', Buffer.from('y'));
    await p.pocztaPrzychodzaca.create({
      data: {
        id: pocztaId, messageId: `<a3-${Date.now()}@x>`, skrzynka: 'z', nadawca: 'jan.prywatnie@poczta.pl', temat: 'x', otrzymano: new Date(), rozmiar: 1,
        wynik: 'BEZ_KLIENTA', userId: k.user.id, zalaczniki: [{ nazwa: 'zrzut.jpg', klucz: `poczta/${pocztaId}/zrzut.jpg` }, { nazwa: 'a.exe', pominiety: 'typ' }],
      },
    });

    await serwis().executeAnonymization(k.user.id, null);

    const tekst = JSON.stringify([
      await p.auditLog.findMany({ where: { userId: k.user.id } }),
      await p.ticketEvent.findMany({ where: { ticketId: zgl.id } }),
      await p.subscriptionEvent.findMany({ where: { subscriptionId: k.subscription.id } }),
      await p.ticket.findMany({ where: { id: zgl.id } }),
    ]);
    expect(tekst).not.toMatch(/Kowalski|stracił pracę/);
    expect(await p.ticket.findUniqueOrThrow({ where: { id: zgl.id }, select: { escalationReason: true, riskFlag: true, riskReason: true } })).toEqual({
      escalationReason: '[zanonimizowano]',
      riskFlag: 'ABUSE',
      riskReason: '[zanonimizowano]',
    });
    const wpisy = await p.auditLog.findMany({ where: { userId: k.user.id, action: { in: ['OPERATOR_ACCOUNT_CHANGED', 'TICKET_MERGED', 'SUBSCRIPTION_SUSPENDED'] } } });
    expect(wpisy.map((w) => w.details)).toHaveLength(4);
    expect(wpisy.map((w) => w.details)).toEqual(
      expect.arrayContaining([
        { akcja: 'zmiana-daty-odnowienia', powod: '[zanonimizowano]', wynik: 'ok' },
        { reason: 'ABUSE', note: '[zanonimizowano]' },
        { reason: 'NON_PAYMENT', note: null },
        { zrodlo: 'z1', cel: zgl.id, reason: '[zanonimizowano]' },
      ]),
    );
    expect((await p.ticketEvent.findMany({ where: { ticketId: zgl.id }, orderBy: { type: 'asc' } })).map((e) => e.meta)).toEqual([
      { zrodlo: 'z1', reason: '[zanonimizowano]' },
      { from: 'OPEN', to: 'CLOSED' },
    ]);

    const zadania = await p.nodeTask.findMany({ where: { accountId: k.account.id } });
    expect(Object.fromEntries(zadania.map((z) => [z.kind, [z.outputLog, z.payload]]))).toEqual({
      IP_BLOCKS: [null, { mode: 'unban' }],
      WAF_HITS: [null, { domains: 'x.pl' }],
      MAIL_LOG: [null, { domains: 'x.pl' }],
      DISK_USAGE: ['public_html 10M', { path: '/' }],
    });

    expect(await p.pocztaPrzychodzaca.count({ where: { id: pocztaId } })).toBe(0);
    expect([...magazyn.keys()]).toEqual(['poczta/inny/plik.pdf']);
  });

  it('klient cofnął wniosek po wybraniu listy do anonimizacji: dane zostają nietknięte', async () => {
    const k = await zWnioskiem();
    const s = serwis();
    const lista = await s.listDue();
    expect(lista).toContain(k.user.id);
    await s.cancel(k.user.id);
    await s.executeAnonymization(k.user.id, null).catch(() => undefined);
    const u = await uzytkownik(k.user.id);
    expect(u.anonymizedAt).toBeNull();
    expect(u.email).toBe(k.user.email);
  });

  it('po anonimizacji wniosku nie da się cofnąć', async () => {
    const k = await zWnioskiem();
    const s = serwis();
    await s.executeAnonymization(k.user.id, null);
    await expect(s.cancel(k.user.id)).rejects.toThrow();
  });

  it('dwa usunięcia tego samego konta z węzła naraz: pojemność węzła zwolniona raz', async () => {
    const k = await zWnioskiem();
    const przed = await prisma().server.findUniqueOrThrow({ where: { id: k.wezel.id } });
    await prisma().account.update({ where: { id: k.account.id }, data: { status: 'SUSPENDED' } });
    opoznienieMs = 100;
    const s = serwis();
    await Promise.all([s.purgeAccountOnDa(k.account.id), s.purgeAccountOnDa(k.account.id)]);
    const po = await prisma().server.findUniqueOrThrow({ where: { id: k.wezel.id } });
    expect(po.allocatedCpu).toBe(przed.allocatedCpu - k.account.cpuLimit);
    expect(po.allocatedMemory).toBe(przed.allocatedMemory - k.account.ramLimitMb);
    expect((await prisma().account.findUniqueOrThrow({ where: { id: k.account.id } })).status).toBe('DELETED');
  });
});
