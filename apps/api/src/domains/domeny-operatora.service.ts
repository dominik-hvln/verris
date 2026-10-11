import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DomainRegistrarOrderStatus, DomainRegistrarOrderType, DomainStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { kontekstZadania } from '../common/audit/kontekst-magazyn.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';
import { DomainRegistrarService } from './domain-registrar.service.js';

/** Kto i dlaczego (D2): powód obowiązkowy, numer zgłoszenia klienta opcjonalny. */
export interface ZlecenieDomeny {
  operatorUserId: string;
  /** Rola z tokenu (ADMIN | STAFF) — STAFF działa tylko na domenach klientów (USER). */
  operatorRole: string;
  powod: string;
  zgloszenie?: string | null;
}

export type AkcjaDomeny = 'blokada' | 'odblokowanie' | 'kod-epp' | 'ns' | 'odnowienie' | 'odnowienie-koszt-verris' | 'ponowienie';

export const MIN_POWOD_DOMENY = 10;
const NA_STRONE = 50;
/** Stany domeny, która nie jest już u naszego rejestratora (domain-registrar.service.ts domenaOpuscila). */
export const ODESZLA = ['TRANSFERRED_OUT', 'DELETED', 'REGISTRAR_DEL'];

type Szczegoly = Record<string, string | number | boolean | null | undefined>;
type Cel = { userId: string; rolaKlienta: string; domena: string; domainId: string | null };

export interface FiltryDomen {
  /** DomainStatus */
  stan?: string;
  /** „verris” — kupione u nas (rejestrator), „poza” — tylko dopisane do konta. */
  rejestr?: string;
  /** Wygasające w N dni (także już wygasłe), tylko domeny u nas. */
  wygasa?: number;
  q?: string;
  page?: number;
}

/**
 * F2.7 (OI-01…06, OI-09; D8) — domeny platformy w panelu operatora: lista, karta i operacje u rejestratora.
 *
 * Każda operacja woła TĘ SAMĄ metodę rejestratora co panel klienta (domain-registrar.service.ts) z id WŁAŚCICIELA
 * domeny i z operatorem jako `actorUserId` — reguły (domena kupiona u nas, NS, dwuklik odnowienia, portfel przed
 * rejestratorem i zwrot przy jego błędzie) są te same. Dziennik (D2/D3):
 * - OPERATOR_DOMAIN_CHANGED — dziennik zespołu: akcja, powód, zgłoszenie, wynik (także błąd rejestratora — w eksporcie
 *   RODO klienta zamieniony na komunikat ogólny, data-export.service.ts dziennikBialaEtykieta);
 * - wpis DOMAIN_* na koncie klienta z operatorem jako autorem i numerem zgłoszenia (kontekst `operator`), więc klient
 *   widzi „obsługa Verris (zgłoszenie #…)”, bez nazwiska i bez powodu.
 */
@Injectable()
export class DomenyOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrar: DomainRegistrarService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Odczyt (L1)
  // ---------------------------------------------------------------------------

  async lista(f: FiltryDomen) {
    const page = Math.max(1, Math.floor(f.page ?? 1));
    const teraz = new Date();
    const warunki: Prisma.DomainWhereInput[] = [];
    if (f.stan && (Object.values(DomainStatus) as string[]).includes(f.stan)) warunki.push({ status: f.stan as DomainStatus });
    if (f.rejestr === 'verris') warunki.push({ registrarExternalId: { not: null } });
    if (f.rejestr === 'poza') warunki.push({ registrarExternalId: null });
    if (f.rejestr === 'odeszla') warunki.push({ registrarStatus: { in: ODESZLA } });
    const dni = f.wygasa && Number.isFinite(f.wygasa) ? Math.min(Math.max(Math.floor(f.wygasa), 1), 365) : null;
    if (dni) warunki.push({ registrarExternalId: { not: null }, expiresAt: { lte: new Date(teraz.getTime() + dni * 86_400_000) } });
    const q = f.q?.trim().toLowerCase();
    if (q) warunki.push({ OR: [{ name: { contains: q } }, { user: { email: { contains: q, mode: 'insensitive' } } }] });
    const where: Prisma.DomainWhereInput = warunki.length ? { AND: warunki } : {};

    const [rows, total, verris, wygasa30, nieudane] = await Promise.all([
      this.prisma.domain.findMany({
        where,
        orderBy: dni ? [{ expiresAt: 'asc' }] : [{ createdAt: 'desc' }],
        skip: (page - 1) * NA_STRONE,
        take: NA_STRONE,
        select: {
          id: true, name: true, status: true, registrarStatus: true, registrarExternalId: true, expiresAt: true,
          autoRenew: true, transferLock: true, lastRegistrarSyncAt: true, createdAt: true,
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.domain.count({ where }),
      this.prisma.domain.count({ where: { registrarExternalId: { not: null } } }),
      this.prisma.domain.count({ where: { registrarExternalId: { not: null }, expiresAt: { lte: new Date(teraz.getTime() + 30 * 86_400_000) } } }),
      this.nieudaneZamowienia().then((z) => z.length),
    ]);
    return {
      rows: rows.map(({ registrarExternalId, ...r }) => ({ ...r, uNas: !!registrarExternalId })),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / NA_STRONE)),
      liczby: { verris, wygasa30, nieudane },
    };
  }

  /**
   * OI-09 — nieudane (albo nieopłacone) rejestracje i transfery, których nikt jeszcze nie ponowił: po nich nie ma
   * żadnego późniejszego zamówienia tego klienta na tę domenę (w toku, zakończonego ani kolejnego nieudanego). Klient zapłacił albo chciał zapłacić, a domeny nie ma.
   * ponytail: 200 najnowszych kandydatów i filtr w pamięci; przy tysiącach nieudanych — zapytanie z NOT EXISTS.
   */
  private async nieudaneZamowienia() {
    const kandydaci = await this.prisma.domainRegistrarOrder.findMany({
      where: {
        type: { in: [DomainRegistrarOrderType.REGISTER, DomainRegistrarOrderType.TRANSFER] },
        status: { in: [DomainRegistrarOrderStatus.FAILED, DomainRegistrarOrderStatus.PENDING_PAYMENT] },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true, domainName: true, type: true, status: true, years: true, priceAmount: true, currency: true, lastError: true,
        ownerHandle: true, createdAt: true, userId: true, user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!kandydaci.length) return [];
    const pozniejsze = await this.prisma.domainRegistrarOrder.findMany({
      where: {
        domainName: { in: [...new Set(kandydaci.map((k) => k.domainName))] },
        type: { in: [DomainRegistrarOrderType.REGISTER, DomainRegistrarOrderType.TRANSFER] },
        // Przegląd F2.7 — każde późniejsze zamówienie (także nieudane ponowienie) zastępuje wcześniejsze: na liście
        // zostaje tylko najnowsze nieudane, a nie dwa „Ponów” dla tej samej domeny.
      },
      select: { userId: true, domainName: true, type: true, createdAt: true },
    });
    return kandydaci.filter(
      (k) => !pozniejsze.some((p) => p.userId === k.userId && p.domainName === k.domainName && p.type === k.type && p.createdAt > k.createdAt),
    );
  }

  /** Nieudane rejestracje i transfery (do ponowienia) oraz transfery czekające u rejestratora. */
  async zamowienia() {
    const [nieudane, wToku] = await Promise.all([
      this.nieudaneZamowienia(),
      this.prisma.domainRegistrarOrder.findMany({
        where: { type: DomainRegistrarOrderType.TRANSFER, status: DomainRegistrarOrderStatus.SUBMITTED },
        orderBy: { submittedAt: 'asc' },
        take: 100,
        select: {
          id: true, domainName: true, type: true, status: true, years: true, priceAmount: true, currency: true, submittedAt: true,
          createdAt: true, userId: true, user: { select: { email: true, firstName: true, lastName: true } },
        },
      }),
    ]);
    return {
      // Uchwyt abonenta to dane rejestratora — operatorowi wystarczy wiedzieć, czy ponowienie jest możliwe.
      // Audyt Fal 2 — ponowienie obciąża kwotą z zamówienia, więc bez zapisanej ceny też się nie da.
      nieudane: nieudane.map(({ ownerHandle, ...z }) => ({ ...z, moznaPonowic: !!ownerHandle && z.priceAmount !== null })),
      wToku,
    };
  }

  async karta(id: string) {
    const d = await this.prisma.domain.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, role: true, walletBalance: true } } },
    });
    if (!d) throw new NotFoundException('Domena nie została znaleziona.');
    const [zamowienia, konto, historia] = await Promise.all([
      this.prisma.domainRegistrarOrder.findMany({
        where: { OR: [{ domainId: d.id }, { domainName: d.name }] },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true, type: true, status: true, years: true, priceAmount: true, currency: true, walletTxId: true, lastError: true,
          createdAt: true, completedAt: true, userId: true, ownerHandle: true,
        },
      }),
      this.prisma.account.findFirst({
        where: { domain: d.name, status: { not: 'DELETED' } },
        select: { subscriptionId: true, status: true },
      }),
      this.prisma.auditLog.findMany({
        where: {
          details: { path: ['domain'], equals: d.name },
          OR: [{ action: { startsWith: 'DOMAIN_' } }, { action: { in: ['REGISTRAR_WEBHOOK', SupportActions.OPERATOR_DOMAIN_CHANGED] } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, action: true, details: true, actorUserId: true, createdAt: true },
      }),
    ]);
    const aktorzy = [...new Set(historia.map((h) => h.actorUserId).filter((a): a is string => !!a))];
    const kto = new Map(
      (aktorzy.length ? await this.prisma.user.findMany({ where: { id: { in: aktorzy } }, select: { id: true, email: true } }) : []).map((u) => [u.id, u.email]),
    );
    const { user, ...domena } = d;
    return {
      ...domena,
      uNas: !!d.registrarExternalId,
      klient: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, walletBalance: String(user.walletBalance) },
      usluga: konto ? { id: konto.subscriptionId, stanKonta: konto.status } : null,
      zamowienia: zamowienia.map(({ ownerHandle, ...z }) => ({
        ...z,
        // Przegląd poprawek — ten sam warunek ceny co lista nieudanych (ponowienie obciąża kwotą z zamówienia).
        moznaPonowic:
          !!ownerHandle &&
          z.priceAmount !== null &&
          (z.type === 'REGISTER' || z.type === 'TRANSFER') &&
          (z.status === 'FAILED' || z.status === 'PENDING_PAYMENT'),
      })),
      historia: historia.map((h) => ({ ...h, aktor: h.actorUserId ? (kto.get(h.actorUserId) ?? h.actorUserId) : null })),
    };
  }

  /** Dane abonenta u rejestratora (odczyt). Dane osobowe — każdy odczyt w dzienniku zespołu. */
  async abonent(id: string, operatorUserId: string) {
    const d = await this.prisma.domain.findUnique({ where: { id }, select: { id: true, name: true, userId: true } });
    if (!d) throw new NotFoundException('Domena nie została znaleziona.');
    const dane = await this.registrar.registrant(d.userId, d.id);
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId: d.userId,
      actorUserId: operatorUserId,
      details: { sekcja: 'abonent-domeny', domain: d.name },
    });
    return dane;
  }

  async wycenaOdnowienia(id: string, lata: number) {
    const d = await this.prisma.domain.findUnique({ where: { id }, select: { id: true, userId: true } });
    if (!d) throw new NotFoundException('Domena nie została znaleziona.');
    return this.registrar.renewQuote(d.userId, d.id, lata);
  }

  // ---------------------------------------------------------------------------
  // Operacje (L3; na koszt Verris — L4/ADMIN)
  // ---------------------------------------------------------------------------

  /** Synchronizacja stanu z rejestratorem — nic nie zmienia u rejestratora, więc bez powodu; w dzienniku zespołu. */
  async synchronizuj(id: string, operatorUserId: string) {
    return this.registrar.synchronizuj(id, operatorUserId);
  }

  /** A-09 — przebieg „domknij transfery” na żądanie (zamiast czekać na godzinny harmonogram). */
  async sprawdzTransfery() {
    return this.registrar.domknijTransfery();
  }

  async blokada(id: string, z: ZlecenieDomeny, locked: boolean) {
    const cel = await this.celDomeny(id);
    return this.wykonaj(z, cel, locked ? 'blokada' : 'odblokowanie', {}, () =>
      this.registrar.setTransferLock(cel.userId, z.operatorUserId, id, locked),
    );
  }

  /** Kod EPP (authinfo) — wraca do operatora, ale nie do dziennika (tam tylko fakt pokazania). */
  async kodEpp(id: string, z: ZlecenieDomeny) {
    const cel = await this.celDomeny(id);
    return this.wykonaj(z, cel, 'kod-epp', {}, () => this.registrar.authCode(cel.userId, z.operatorUserId, id));
  }

  async serweryNazw(id: string, z: ZlecenieDomeny, nameservers: string[]) {
    const cel = await this.celDomeny(id);
    return this.wykonaj(z, cel, 'ns', { ns: nameservers.join(', ') }, () =>
      this.registrar.setNameservers(cel.userId, z.operatorUserId, id, nameservers),
    );
  }

  /** D8 — domyślnie z portfela klienta (L3); na koszt Verris tylko L4/ADMIN (egzekucja: kontroler). */
  async odnow(id: string, z: ZlecenieDomeny, lata: number, naKosztVerris: boolean) {
    const cel = await this.celDomeny(id);
    return this.wykonaj(
      z,
      cel,
      naKosztVerris ? 'odnowienie-koszt-verris' : 'odnowienie',
      { lata, platnik: naKosztVerris ? 'verris' : 'portfel-klienta' },
      () => this.registrar.renew(cel.userId, z.operatorUserId, id, lata, { naKosztVerris }),
      (r) => ({ zamowienieId: r.id, kwota: r.priceAmount != null ? String(r.priceAmount) : null, walletTxId: r.walletTxId }),
    );
  }

  /** OI-09 — ponowienie nieudanej rejestracji/transferu: portfel klienta jak przy jego zamówieniu. */
  async ponow(orderId: string, z: ZlecenieDomeny, authCode?: string | null) {
    const o = await this.prisma.domainRegistrarOrder.findUnique({
      where: { id: orderId },
      select: { domainName: true, domainId: true, userId: true, user: { select: { role: true } } },
    });
    if (!o) throw new NotFoundException('Zamówienie nie istnieje.');
    const cel: Cel = { userId: o.userId, rolaKlienta: o.user.role, domena: o.domainName, domainId: o.domainId };
    return this.wykonaj(
      z,
      cel,
      'ponowienie',
      { zamowienieId: orderId, nowyKodEpp: authCode?.trim() ? true : undefined },
      () => this.registrar.ponowZamowienie(orderId, z.operatorUserId, { authCode }),
      (r) => ({ noweZamowienieId: r.id, stan: r.status }),
    );
  }

  private async celDomeny(id: string): Promise<Cel> {
    const d = await this.prisma.domain.findUnique({ where: { id }, select: { id: true, name: true, userId: true, user: { select: { role: true } } } });
    if (!d) throw new NotFoundException('Domena nie została znaleziona.');
    return { userId: d.userId, rolaKlienta: d.user.role, domena: d.name, domainId: d.id };
  }

  /**
   * Wspólny przebieg (jak akcje-konta-operatora.service.ts): domeny zespołu zmienia tylko ADMIN, powód, zgłoszenie
   * klienta, operacja w kontekście operatora (wpis klienta: „obsługa Verris (zgłoszenie #…)”), wpis zespołu z wynikiem.
   * Błąd rejestratora = błąd dla operatora i wpis „blad”.
   */
  private async wykonaj<T>(
    z: ZlecenieDomeny,
    cel: Cel,
    akcja: AkcjaDomeny,
    szczegoly: Szczegoly,
    operacja: () => Promise<T>,
    doDziennika?: (r: T) => Szczegoly,
  ): Promise<T> {
    if (z.operatorRole !== 'ADMIN' && cel.rolaKlienta !== 'USER') {
      throw new ForbiddenException('Personel może zmieniać wyłącznie domeny klientów — domenę konta zespołu zmienia administrator.');
    }
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD_DOMENY) {
      throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_DOMENY} znaków) — zapisze się w dzienniku.`);
    }
    const zgloszenieId = await zgloszenieKlienta(this.prisma, cel.userId, z.zgloszenie);
    const dziennik = (wynik: Szczegoly) =>
      this.audit.record({
        action: SupportActions.OPERATOR_DOMAIN_CHANGED,
        userId: cel.userId,
        actorUserId: z.operatorUserId,
        details: bezPustych({ domain: cel.domena, domainId: cel.domainId, akcja, powod, zgloszenieId, ...szczegoly, ...wynik }),
      });
    const magazyn = { ...(kontekstZadania.getStore() ?? {}), operator: { wlasciciel: cel.userId, operatorUserId: z.operatorUserId, zgloszenieId } };
    let wynik: T;
    try {
      wynik = await kontekstZadania.run(magazyn, operacja);
    } catch (err) {
      await dziennik({ wynik: 'blad', blad: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
      throw err;
    }
    await dziennik({ wynik: 'ok', ...(doDziennika ? doDziennika(wynik) : {}) });
    return wynik;
  }
}

function bezPustych(o: Szczegoly): Prisma.InputJsonObject {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')) as Prisma.InputJsonObject;
}
