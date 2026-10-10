import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { MigracjaEtap, MigracjaKanalKontaktu, MigrationStatus, Prisma } from '@verris/database';
import { zdradzaPanelSerwera } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { MigrationActions } from '../common/audit/audit.actions.js';
import { kontekstZadania } from '../common/audit/kontekst-magazyn.js';
import { MailerService } from '../mail/mailer.service.js';
import { raportPomigracyjnyTemplate } from '../mail/templates/migration-notifications.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';
import { sumaUprawnien, roleZWiersza } from '../staff-roles/uprawnienia-operatora.js';
import { MigrationCutoverService } from './migration-cutover.service.js';
import {
  ETAP_PL,
  ETAPY,
  OKNO_POPRAWEK_DNI,
  OKNO_POPRAWEK_MAX_DNI,
  POLA_RAPORTU,
  POLE_PL,
  STATUS_PL,
  TERMIN_PL,
  brakiDoEtapu,
  brakiRaportu,
  checklistaZBazy,
  kluczAlertu,
  kolejnosc,
  przejscie,
  terminDomyslny,
  terminMigracji,
  type Etap,
  type PoleChecklisty,
  type StanMigracji,
  type Termin,
} from './tablica-migracji.js';

const DZIEN_MS = 24 * 60 * 60 * 1000;
const UPRAWNIENIE = 'MIGRATIONS_MANAGE';
/** Pola checklisty, które wychodzą do klienta w raporcie — white label sprawdzamy już przy zapisie. */
const DO_KLIENTA = new Set<PoleChecklisty>(POLA_RAPORTU);
/** Poza wzorcem panelu serwera: MTA i dostawca serwerów, adresy IP (węzły). */
const ZDRADZA_INFRASTRUKTURE = /\bExim\b|Hetzner|\b\d{1,3}(\.\d{1,3}){3}\b/i;

export interface Aktor {
  userId: string;
  role: string;
}

/** Tekst, który trafi do klienta (raport): bez nazw oprogramowania serwera, dostawcy i adresów węzłów. */
export function bialaEtykietaRaportu(tekst: string): string | null {
  if (zdradzaPanelSerwera(tekst) || ZDRADZA_INFRASTRUKTURE.test(tekst)) {
    return 'Ten tekst trafi do klienta — usuń nazwy oprogramowania serwera, dostawcy i adresy IP węzłów.';
  }
  return null;
}

const WYBOR = {
  id: true,
  subscriptionId: true,
  userId: true,
  status: true,
  targetDomain: true,
  ticketId: true,
  needsAttention: true,
  createdAt: true,
  cutoverAt: true,
  etapObslugi: true,
  etapOd: true,
  termin: true,
  wygasaUStaregoAt: true,
  domenaWygasaAt: true,
  przerywacz: true,
  przypisanyDoId: true,
  poprawkiDo: true,
  checklista: true,
  raportWyslanyAt: true,
  terminAlert: true,
  user: { select: { email: true, firstName: true } },
  subscription: { select: { serviceTag: true, account: { select: { domain: true } } } },
} satisfies Prisma.MigrationRequestSelect;

type Wiersz = Prisma.MigrationRequestGetPayload<{ select: typeof WYBOR }>;

const stan = (m: Wiersz): StanMigracji => ({
  etap: m.etapObslugi as Etap,
  status: m.status,
  createdAt: m.createdAt,
  cutoverAt: m.cutoverAt,
  termin: m.termin,
  wygasaUStaregoAt: m.wygasaUStaregoAt,
  domenaWygasaAt: m.domenaWygasaAt,
  poprawkiDo: m.poprawkiDo,
  raportWyslanyAt: m.raportWyslanyAt,
  checklista: checklistaZBazy(m.checklista),
});

const domenaMigracji = (m: Wiersz) => m.targetDomain ?? m.subscription?.account?.domain ?? m.subscription?.serviceTag ?? m.id.slice(0, 8);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const terminJson = (t: Termin | null) => (t ? { rodzaj: t.rodzaj, opis: TERMIN_PL[t.rodzaj], data: t.data.toISOString(), stan: t.stan } : null);
const nastepny = (e: Etap): Etap | null => ETAPY[ETAPY.indexOf(e) + 1] ?? null;

function data(v: string | null | undefined, pole: string): Date | null {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Niepoprawna data: ${pole}.`);
  return d;
}

/**
 * D11 — tablica migracji obsługi (MIGRATIONS_MANAGE, L2 support migracji). Reguły przejść i terminów —
 * tablica-migracji.ts; tu odczyt, zapis z dziennikiem (klient = userId, operator = actorUserId), raport do klienta,
 * sprawdzenie DNS tą samą metodą co klient i alert terminów w dzwonku zespołu.
 */
@Injectable()
export class TablicaMigracjiService {
  private readonly logger = new Logger(TablicaMigracjiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly powiadomienia: NotificationsService,
    private readonly cutover: MigrationCutoverService,
  ) {}

  // ------------------------------------------------------------------ odczyt

  /** Tablica: kolumny etapów (bez anulowanych), zamknięte z ostatnich 14 dni; Przerywacz i najpilniejszy termin na górze. */
  async tablica(opts: { tylkoMoje?: boolean; aktor: Aktor }) {
    const teraz = new Date();
    const rows = await this.prisma.migrationRequest.findMany({
      where: {
        status: { not: MigrationStatus.CANCELED },
        OR: [{ etapObslugi: { not: MigracjaEtap.ZAMKNIETA } }, { etapOd: { gte: new Date(teraz.getTime() - 14 * DZIEN_MS) } }],
        ...(opts.tylkoMoje ? { przypisanyDoId: opts.aktor.userId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 500,
      select: WYBOR,
    });
    const operatorzy = await this.emaileOperatorow(rows.map((r) => r.przypisanyDoId));
    const karty = rows.map((r) => {
      const s = stan(r);
      const termin = terminMigracji(s, teraz);
      const dalej = nastepny(s.etap);
      return {
        id: r.id,
        subscriptionId: r.subscriptionId,
        domena: domenaMigracji(r),
        klient: r.user?.email ?? null,
        etap: s.etap,
        etapOd: iso(r.etapOd),
        status: r.status,
        statusOpis: STATUS_PL[r.status] ?? r.status,
        needsAttention: r.needsAttention,
        przerywacz: r.przerywacz,
        przypisany: r.przypisanyDoId ? { id: r.przypisanyDoId, email: operatorzy.get(r.przypisanyDoId) ?? null } : null,
        ticketId: r.ticketId,
        termin: terminJson(termin),
        dalej: dalej ? { etap: dalej, braki: brakiDoEtapu(s, dalej) } : null,
        _sort: { przerywacz: r.przerywacz, termin },
      };
    });
    karty.sort((a, b) => kolejnosc(a._sort, b._sort));
    const kolumny = Object.fromEntries(ETAPY.map((e) => [e, [] as Array<Omit<(typeof karty)[number], '_sort'>>])) as Record<
      Etap,
      Array<Omit<(typeof karty)[number], '_sort'>>
    >;
    for (const { _sort, ...k } of karty) kolumny[k.etap].push(k);
    return {
      etapy: ETAPY.map((e) => ({ etap: e, nazwa: ETAP_PL[e] })),
      kolumny,
      alerty: {
        poTerminie: karty.filter((k) => k.termin?.stan === 'po-terminie').length,
        blisko: karty.filter((k) => k.termin?.stan === 'blisko').length,
      },
    };
  }

  /** Panel obsługi na karcie migracji: etap, terminy, checklista, braki, kontakty i oś czasu. */
  async obsluga(id: string) {
    const m = await this.wczytaj(id);
    const s = stan(m);
    const teraz = new Date();
    const dalej = nastepny(s.etap);
    const [kontakty, zdarzenia, operatorzy] = await Promise.all([
      this.prisma.migracjaKontakt.findMany({ where: { migrationRequestId: id }, orderBy: { kiedy: 'desc' }, take: 200 }),
      this.prisma.auditLog.findMany({
        // Wpisy migratora i tablicy mają userId = klient (indeks userId+createdAt), a id zlecenia w szczegółach.
        where: { userId: m.userId, action: { startsWith: 'MIGRATION_' }, details: { path: ['migrationRequestId'], equals: id } },
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: { id: true, action: true, actorUserId: true, details: true, createdAt: true },
      }),
      this.operatorzyMigracji(),
    ]);
    const kto = await this.emaileOperatorow([
      m.przypisanyDoId,
      ...kontakty.map((k) => k.autorId),
      ...zdarzenia.map((z) => z.actorUserId),
      ...Object.values(s.checklista).map((w) => w?.przez ?? null),
    ]);
    const os = [
      ...kontakty.map((k) => ({
        typ: 'kontakt' as const,
        id: k.id,
        at: k.kiedy.toISOString(),
        kanal: k.kanal,
        tresc: k.tresc,
        ticketId: k.ticketId,
        kto: k.autorId ? (kto.get(k.autorId) ?? null) : null,
      })),
      ...zdarzenia.map((z) => ({
        typ: 'zdarzenie' as const,
        id: z.id,
        at: z.createdAt.toISOString(),
        akcja: z.action,
        szczegoly: z.details,
        kto: z.actorUserId ? (kto.get(z.actorUserId) ?? (z.actorUserId === m.userId ? 'klient' : null)) : null,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));
    return {
      id: m.id,
      domena: domenaMigracji(m),
      etap: s.etap,
      etapOd: iso(m.etapOd),
      status: m.status,
      statusOpis: STATUS_PL[m.status] ?? m.status,
      cutoverAt: iso(m.cutoverAt),
      termin: iso(m.termin),
      terminDomyslny: terminDomyslny(m.createdAt).toISOString(),
      wygasaUStaregoAt: iso(m.wygasaUStaregoAt),
      domenaWygasaAt: iso(m.domenaWygasaAt),
      przerywacz: m.przerywacz,
      przypisany: m.przypisanyDoId ? { id: m.przypisanyDoId, email: kto.get(m.przypisanyDoId) ?? null } : null,
      poprawkiDo: iso(m.poprawkiDo),
      ticketId: m.ticketId,
      raportWyslanyAt: iso(m.raportWyslanyAt),
      checklista: Object.fromEntries(
        Object.entries(s.checklista).map(([k, w]) => [k, { ...w, przez: w ? (kto.get(w.przez) ?? null) : null }]),
      ),
      terminStan: terminJson(terminMigracji(s, teraz)),
      dalej: dalej ? { etap: dalej, nazwa: ETAP_PL[dalej], braki: brakiDoEtapu(s, dalej) } : null,
      brakiRaportu: brakiRaportu(s),
      oknoPoprawekDni: OKNO_POPRAWEK_DNI,
      operatorzy,
      os,
    };
  }

  /** Operatorzy, którym można przypisać migrację: aktywni STAFF z MIGRATIONS_MANAGE i administratorzy. */
  async operatorzyMigracji(): Promise<Array<{ id: string; email: string }>> {
    const ROLA = { select: { id: true, name: true, permissions: true } } as const;
    const users = await this.prisma.user.findMany({
      where: { role: { in: ['STAFF', 'ADMIN'] }, loginBlocked: false, anonymizedAt: null },
      select: { id: true, email: true, role: true, staffRole: ROLA, staffRoleAssignments: { select: { role: ROLA } } },
      orderBy: { email: 'asc' },
      take: 500,
    });
    return users
      .filter((u) => u.role === 'ADMIN' || sumaUprawnien(roleZWiersza(u)).includes(UPRAWNIENIE))
      .map((u) => ({ id: u.id, email: u.email }));
  }

  // ------------------------------------------------------------------ zapis

  /** Zmiana etapu: naprzód o jeden po spełnieniu checklisty, wstecz z powodem. Wejście „Po przełączeniu” otwiera okno poprawek. */
  async zmienEtap(id: string, z: { etap: string; powod?: string | null; oknoDni?: number | null }, aktor: Aktor) {
    const cel = z.etap as Etap;
    if (!ETAPY.includes(cel)) throw new BadRequestException('Nieznany etap.');
    const m = await this.wczytaj(id);
    const s = stan(m);
    const wynik = przejscie(s, cel, z.powod);
    if (!wynik.ok) throw new BadRequestException(wynik.bledy.join(' · '));
    const oknoDni = z.oknoDni ?? OKNO_POPRAWEK_DNI;
    if (!Number.isInteger(oknoDni) || oknoDni < 1 || oknoDni > OKNO_POPRAWEK_MAX_DNI) {
      throw new BadRequestException(`Okno poprawek: od 1 do ${OKNO_POPRAWEK_MAX_DNI} dni.`);
    }
    const teraz = new Date();
    const poprawkiDo = cel === 'PO_PRZELACZENIU' && wynik.kierunek === 'naprzod' ? new Date(teraz.getTime() + oknoDni * DZIEN_MS) : undefined;
    // Warunek na etap z odczytu: dwa równoczesne przejścia — drugie dostaje 409, a nie przeskok o dwa etapy.
    const { count } = await this.prisma.migrationRequest.updateMany({
      where: { id, etapObslugi: s.etap },
      data: { etapObslugi: cel, etapOd: teraz, terminAlert: null, ...(poprawkiDo ? { poprawkiDo } : {}) },
    });
    if (count === 0) throw new ConflictException('Ktoś właśnie zmienił etap tej migracji — odśwież stronę.');
    await this.audit.record({
      action: MigrationActions.MIGRATION_STAGE_CHANGED,
      userId: m.userId,
      actorUserId: aktor.userId,
      details: {
        migrationRequestId: id,
        subscriptionId: m.subscriptionId,
        z: s.etap,
        na: cel,
        kierunek: wynik.kierunek,
        ...(z.powod?.trim() ? { powod: z.powod.trim() } : {}),
        ...(poprawkiDo ? { poprawkiDo: poprawkiDo.toISOString() } : {}),
      },
    });
    return this.obsluga(id);
  }

  /** Terminy, Przerywacz, przypisanie i zgłoszenie — tylko pola podane w żądaniu (null czyści). */
  async ustaw(
    id: string,
    z: {
      termin?: string | null;
      wygasaUStaregoAt?: string | null;
      domenaWygasaAt?: string | null;
      przerywacz?: boolean;
      przypisanyDoId?: string | null;
      zgloszenie?: string | null;
    },
    aktor: Aktor,
  ) {
    const m = await this.wczytaj(id);
    const dane: Prisma.MigrationRequestUpdateInput = {};
    const zmiany: Record<string, { przed: Prisma.InputJsonValue | null; po: Prisma.InputJsonValue | null }> = {};
    const zmien = (pole: string, przed: unknown, po: unknown) => {
      const a = przed instanceof Date ? przed.toISOString() : (przed ?? null);
      const b = po instanceof Date ? po.toISOString() : (po ?? null);
      if (a === b) return;
      (dane as Record<string, unknown>)[pole] = po;
      zmiany[pole] = { przed: a as Prisma.InputJsonValue | null, po: b as Prisma.InputJsonValue | null };
    };
    if (z.termin !== undefined) zmien('termin', m.termin, data(z.termin, 'termin'));
    if (z.wygasaUStaregoAt !== undefined) zmien('wygasaUStaregoAt', m.wygasaUStaregoAt, data(z.wygasaUStaregoAt, 'wygaśnięcie u starego dostawcy'));
    if (z.domenaWygasaAt !== undefined) zmien('domenaWygasaAt', m.domenaWygasaAt, data(z.domenaWygasaAt, 'wygaśnięcie domeny'));
    if (z.przerywacz !== undefined) zmien('przerywacz', m.przerywacz, z.przerywacz);
    if (z.przypisanyDoId !== undefined) {
      const nowy = z.przypisanyDoId?.trim() || null;
      if (nowy && !(await this.operatorzyMigracji()).some((o) => o.id === nowy)) {
        throw new BadRequestException('Migrację można przypisać tylko aktywnemu operatorowi z uprawnieniem do migracji.');
      }
      zmien('przypisanyDoId', m.przypisanyDoId, nowy);
    }
    if (z.zgloszenie !== undefined) zmien('ticketId', m.ticketId, await zgloszenieKlienta(this.prisma, m.userId, z.zgloszenie));
    if (!Object.keys(zmiany).length) return this.obsluga(id);
    // Zmiana terminów otwiera alert na nowo (nowy termin — nowe ostrzeżenie).
    if (zmiany.termin || zmiany.wygasaUStaregoAt || zmiany.domenaWygasaAt) dane.terminAlert = null;
    await this.prisma.migrationRequest.update({ where: { id }, data: dane });
    await this.audit.record({
      action: MigrationActions.MIGRATION_HANDLING_UPDATED,
      userId: m.userId,
      actorUserId: aktor.userId,
      details: { migrationRequestId: id, subscriptionId: m.subscriptionId, zmiany },
    });
    const przypisany = zmiany.przypisanyDoId?.po;
    if (typeof przypisany === 'string' && przypisany !== aktor.userId) {
      const pilna = z.przerywacz ?? m.przerywacz;
      await this.powiadomienia.create({
        userId: przypisany,
        category: 'SUPPORT',
        severity: pilna ? 'warning' : 'info',
        title: `${pilna ? 'Przerywacz · ' : ''}Przypisano Ci migrację ${domenaMigracji(m)}`,
        body: `Etap: ${ETAP_PL[m.etapObslugi as Etap]}.`,
        link: `/migrations/${id}`,
      });
    }
    return this.obsluga(id);
  }

  /**
   * Pozycja checklisty: TTL 300 (tak/nie) albo tekst (wynik testu, opis optymalizacji, podsumowanie); null czyści.
   * Zapis atomowy na jednym kluczu JSON — dwóch operatorów odhaczających różne pozycje nie nadpisuje sobie wpisów.
   */
  async checklista(id: string, z: { pole: string; wartosc: string | boolean | null }, aktor: Aktor) {
    const pole = z.pole as PoleChecklisty;
    if (!(pole in POLE_PL)) throw new BadRequestException('Nieznana pozycja checklisty.');
    const m = await this.wczytaj(id);
    let wpis: { tekst?: string; at: string; przez: string } | null;
    if (pole === 'ttl300') {
      if (typeof z.wartosc !== 'boolean' && z.wartosc !== null) throw new BadRequestException('TTL 300: tak albo nie.');
      wpis = z.wartosc ? { at: new Date().toISOString(), przez: aktor.userId } : null;
    } else {
      if (z.wartosc !== null && typeof z.wartosc !== 'string') throw new BadRequestException(`${POLE_PL[pole]}: wpisz tekst.`);
      const tekst = (z.wartosc ?? '').trim();
      if (tekst && (tekst.length < 3 || tekst.length > 2000)) throw new BadRequestException(`${POLE_PL[pole]}: od 3 do 2000 znaków.`);
      if (tekst && DO_KLIENTA.has(pole)) {
        const blad = bialaEtykietaRaportu(tekst);
        if (blad) throw new BadRequestException(blad);
      }
      wpis = tekst ? { tekst, at: new Date().toISOString(), przez: aktor.userId } : null;
    }
    if (wpis) {
      await this.prisma.$executeRaw`UPDATE "MigrationRequest" SET "checklista" = "checklista" || jsonb_build_object(${pole}::text, ${JSON.stringify(wpis)}::jsonb), "updatedAt" = now() WHERE "id" = ${id}`;
    } else {
      await this.prisma.$executeRaw`UPDATE "MigrationRequest" SET "checklista" = "checklista" - ${pole}::text, "updatedAt" = now() WHERE "id" = ${id}`;
    }
    await this.audit.record({
      action: MigrationActions.MIGRATION_CHECKLIST_UPDATED,
      userId: m.userId,
      actorUserId: aktor.userId,
      details: { migrationRequestId: id, subscriptionId: m.subscriptionId, pole, odhaczone: !!wpis },
    });
    return this.obsluga(id);
  }

  /** Log kontaktu (telefon, mail) na osi czasu; zgłoszenie musi należeć do klienta. */
  async kontakt(id: string, z: { kanal: string; tresc: string; zgloszenie?: string | null; kiedy?: string | null }, aktor: Aktor) {
    if (z.kanal !== 'TELEFON' && z.kanal !== 'MAIL') throw new BadRequestException('Kanał: telefon albo mail.');
    const tresc = (z.tresc ?? '').trim();
    if (tresc.length < 3 || tresc.length > 2000) throw new BadRequestException('Opis kontaktu: od 3 do 2000 znaków.');
    const teraz = new Date();
    const kiedy = data(z.kiedy, 'kiedy') ?? teraz;
    if (kiedy.getTime() > teraz.getTime() + 5 * 60 * 1000) throw new BadRequestException('Kontakt nie może być z przyszłości.');
    const m = await this.wczytaj(id);
    const ticketId = await zgloszenieKlienta(this.prisma, m.userId, z.zgloszenie);
    const k = await this.prisma.migracjaKontakt.create({
      data: { migrationRequestId: id, kanal: z.kanal as MigracjaKanalKontaktu, tresc, ticketId, autorId: aktor.userId, kiedy },
    });
    await this.audit.record({
      action: MigrationActions.MIGRATION_CONTACT_LOGGED,
      userId: m.userId,
      actorUserId: aktor.userId,
      details: { migrationRequestId: id, subscriptionId: m.subscriptionId, kontaktId: k.id, kanal: z.kanal, ...(ticketId ? { ticketId } : {}) },
    });
    return this.obsluga(id);
  }

  /** Podgląd maila z raportem (temat i treść tekstowa) — operator widzi, co dostanie klient. */
  async podgladRaportu(id: string) {
    const m = await this.wczytaj(id);
    const s = stan(m);
    const braki = brakiRaportu(s);
    if (braki.length) return { braki, temat: null, tekst: null };
    const mail = this.mailRaportu(m, s);
    return { braki, temat: mail.subject, tekst: mail.text };
  }

  /** „Wyślij raport” — mail do klienta z szablonu (white label), wpis w aktywności klienta (D3). */
  async wyslijRaport(id: string, aktor: Aktor) {
    const m = await this.wczytaj(id);
    const s = stan(m);
    const braki = brakiRaportu(s);
    if (braki.length) throw new BadRequestException(braki.join(' · '));
    for (const p of POLA_RAPORTU) {
      const blad = bialaEtykietaRaportu(s.checklista[p]?.tekst ?? '');
      if (blad) throw new BadRequestException(`${POLE_PL[p]}: ${blad}`);
    }
    if (!m.user?.email) throw new BadRequestException('Klient nie ma adresu e-mail.');
    const teraz = new Date();
    // Rezerwacja: podwójne kliknięcie nie wysyła dwóch maili.
    const { count } = await this.prisma.migrationRequest.updateMany({
      where: { id, raportWyslanyAt: m.raportWyslanyAt },
      data: { raportWyslanyAt: teraz },
    });
    if (count === 0) throw new ConflictException('Raport właśnie wysyła ktoś inny — odśwież stronę.');
    const mail = this.mailRaportu(m, s);
    let wynik: { delivered: boolean } | null = null;
    try {
      wynik = await this.mailer.send({ ...mail, userId: m.userId, category: 'TRANSACTIONAL', fromRole: 'NOREPLY' });
    } catch (e) {
      this.logger.warn(`raport pomigracyjny ${id}: ${(e as Error).message}`);
    }
    if (!wynik?.delivered) {
      await this.prisma.migrationRequest.updateMany({ where: { id, raportWyslanyAt: teraz }, data: { raportWyslanyAt: m.raportWyslanyAt } });
      throw new BadRequestException('Nie udało się wysłać maila z raportem — spróbuj ponownie za chwilę.');
    }
    await this.audit.record({
      action: MigrationActions.MIGRATION_REPORT_SENT,
      userId: m.userId,
      actorUserId: aktor.userId,
      details: {
        migrationRequestId: id,
        subscriptionId: m.subscriptionId,
        domain: domenaMigracji(m),
        ...(m.ticketId ? { zgloszenieId: m.ticketId } : {}),
        ...(m.raportWyslanyAt ? { ponownie: true } : {}),
      },
    });
    return this.obsluga(id);
  }

  /**
   * „Sprawdź DNS” z panelu obsługi — ta sama metoda co przycisk klienta (MigrationCutoverService.verify: odczyt DNS,
   * bez operacji na węźle). Wywołana z id właściciela w kontekście operatora: dziennik zapisuje operatora.
   */
  async sprawdzDns(id: string, aktor: Aktor) {
    const m = await this.wczytaj(id);
    const magazyn = { ...(kontekstZadania.getStore() ?? {}), operator: { wlasciciel: m.userId, operatorUserId: aktor.userId, zgloszenieId: m.ticketId } };
    const plan = await kontekstZadania.run(magazyn, () => this.cutover.verify(m.subscriptionId, m.userId, id));
    return { ...(await this.obsluga(id)), dns: { status: plan.status, komunikat: plan.message } };
  }

  // ------------------------------------------------------------------ alert terminów

  /**
   * Alert, gdy termin się zbliża albo minął: dzwonek osoby prowadzącej (bez przypisania — wszystkich z uprawnieniem
   * do migracji). Ten sam termin w tym samym stanie powiadamia raz (MigrationRequest.terminAlert).
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'migracje-terminy' })
  async alertTerminow(): Promise<number> {
    const teraz = new Date();
    const rows = await this.prisma.migrationRequest.findMany({
      where: { status: { not: MigrationStatus.CANCELED }, etapObslugi: { not: MigracjaEtap.ZAMKNIETA } },
      select: WYBOR,
      take: 1000,
    });
    let wyslane = 0;
    let wszyscy: string[] | null = null;
    for (const m of rows) {
      const t = terminMigracji(stan(m), teraz);
      if (!t || t.stan === 'ok') continue;
      const klucz = kluczAlertu(t);
      if (m.terminAlert === klucz) continue;
      // Warunek na poprzedni klucz — dwie instancje API nie wyślą tego samego alertu dwa razy.
      const { count } = await this.prisma.migrationRequest.updateMany({ where: { id: m.id, terminAlert: m.terminAlert }, data: { terminAlert: klucz } });
      if (count === 0) continue;
      const odbiorcy = m.przypisanyDoId ? [m.przypisanyDoId] : (wszyscy ??= (await this.operatorzyMigracji()).map((o) => o.id));
      const kiedy = t.data.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      for (const userId of odbiorcy) {
        await this.powiadomienia.create({
          userId,
          category: 'SUPPORT',
          severity: t.stan === 'po-terminie' ? 'critical' : 'warning',
          title: `${m.przerywacz ? 'Przerywacz · ' : ''}Migracja ${domenaMigracji(m)}: ${t.stan === 'po-terminie' ? 'po terminie' : 'termin się zbliża'}`,
          body: `${TERMIN_PL[t.rodzaj]} — ${kiedy}. Etap: ${ETAP_PL[m.etapObslugi as Etap]}.`,
          link: `/migrations/${m.id}`,
        });
      }
      wyslane++;
    }
    return wyslane;
  }

  // ------------------------------------------------------------------ pomocnicze

  private async wczytaj(id: string): Promise<Wiersz> {
    const m = await this.prisma.migrationRequest.findUnique({ where: { id }, select: WYBOR });
    if (!m) throw new NotFoundException('Nie znaleziono migracji.');
    return m;
  }

  private async emaileOperatorow(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const unikalne = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unikalne.length) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unikalne }, role: { in: ['STAFF', 'ADMIN'] } }, select: { id: true, email: true } });
    return new Map(users.map((u) => [u.id, u.email]));
  }

  private mailRaportu(m: Wiersz, s: StanMigracji) {
    const c = s.checklista;
    return raportPomigracyjnyTemplate({
      to: m.user?.email ?? '',
      firstName: m.user?.firstName ?? null,
      domena: domenaMigracji(m),
      podsumowanie: c.podsumowanie?.tekst ?? '',
      optymalizacja: c.optymalizacja?.tekst ?? '',
      testPrzed: c.testPrzed?.tekst ?? '',
      testPo: c.testPo?.tekst ?? '',
      poprawkiDo: m.poprawkiDo,
      zgloszenie: m.ticketId ? `#${m.ticketId.slice(0, 8)}` : null,
      panelUrl: (process.env.CLIENT_PANEL_URL || 'https://panel.verris.pl').replace(/\/$/, ''),
    });
  }
}
