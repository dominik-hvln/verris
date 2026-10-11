import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTxType, type WalletTransaction } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { RozliczeniaOperatoraActions, SupportActions } from '../common/audit/audit.actions.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { DoladowanieService } from './doladowanie.service.js';
import { BillingService } from './billing.service.js';
import { PromoService } from './promo.service.js';
import { powodAutoDoladowania, powodBlokadyPonowienia, WalletAutoTopupService } from './wallet-auto-topup.service.js';
import {
  AKCJE_PRZYPOMNIEN,
  PROGI_WINDYKACJI,
  prognozaWindykacji,
  scalProbyAutoDoladowania,
  type ProbaAutoDoladowania,
  type Prognoza,
} from './windykacja.js';

export interface Operator {
  userId: string;
  role: string;
}

export const MIN_POWOD_ROZLICZEN = 10;
/** Górna granica jednej korekty i jednej wpłaty — jak zasilenie portfela (admin-credit.dto.ts). */
export const MAKS_KWOTA = 100_000;

export type ZrodloPlatnosci = 'PAYNOW' | 'AUTO_DOLADOWANIE' | 'STRIPE';
export const ZRODLA_PLATNOSCI: readonly ZrodloPlatnosci[] = ['PAYNOW', 'AUTO_DOLADOWANIE', 'STRIPE'];
/** Paynow: odrzucone i z błędem oraz niedokończone (wygasłe, porzucone). CONFIRMED, NEW i PENDING nie są nieudane. */
const STATUSY_PAYNOW = ['REJECTED', 'ERROR', 'EXPIRED', 'ABANDONED'];
const AKCJE_AUTO = ['WALLET_AUTO_TOPUP_FAILED', 'WALLET_AUTOTOPUP_PAYMENT_FAILED'] as const;
/** Ile wpisów każdego źródła bierzemy do scalenia — powyżej lista mówi „ucięto” i trzeba zawęzić okres. */
const MAKS_ZE_ZRODLA = 500;
const DZIEN = 24 * 60 * 60 * 1000;

export interface NieudanaPlatnosc {
  id: string;
  zrodlo: ZrodloPlatnosci;
  kiedy: string;
  klient: { id: string; email: string | null };
  kwota: string | null;
  waluta: string;
  status: string;
  powod: string | null;
  referencja: string | null;
  /** Czy panel może ponowić płatność; `uwaga` mówi dlaczego nie albo co się stanie. */
  ponowienie: { mozliwe: boolean; uwaga: string };
}

const zgl = (id: string | null) => (id ? ` (zgłoszenie #${id.slice(0, 8)})` : '');
const bezPustych = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Prisma.InputJsonValue;
const jestP2002 = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
const szczegol = (d: unknown, k: string): string | null => {
  const v = d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>)[k] : null;
  return typeof v === 'string' && v ? v : null;
};

/** Referencja z wyciągu: bez spacji na brzegach, pojedyncze spacje, wielkie litery — ten sam przelew = ten sam klucz. */
export function normalizujReferencje(r: string): string {
  return r.trim().replace(/\s+/g, ' ').toUpperCase();
}

/**
 * F3.6 — rozliczenia prowadzone przez Finanse i L4 z panelu operatora: lista nieudanych płatności z ponowieniem
 * auto-doładowania, wpłata przelewem na portfel klienta, korekta salda (±) i rejestr ruchów portfela, widok
 * przypomnień i automatycznego zawieszenia.
 *
 * Pieniądze płyną WYŁĄCZNIE przez istniejącą księgę (WalletLedgerService.zapiszWpis — blokada wiersza klienta,
 * saldo nigdy poniżej zera) i istniejące księgowanie wpłaty (DoladowanieService.zaksieguj — dokument za wpłatę
 * w modelu `przy_doladowaniu`, bez zmian w logice faktur i KSeF; PB-13/D7 czeka na biuro). Idempotencja po kluczu
 * księgi (unikalny idempotencyKey): przelew — referencja z wyciągu, korekta — klucz formularza.
 *
 * D2/D3: powód obowiązkowy przy korekcie i ponowieniu, zgłoszenie klienta opcjonalne (musi być jego); klient widzi
 * „obsługa Verris (zgłoszenie #…)”, bez nazwiska; dziennik zespołu z powodem — OPERATOR_ACCOUNT_CHANGED.
 * W księdze (eksport RODO) nie zapisujemy id pracownika. STAFF działa tylko na portfelach klientów (USER).
 */
@Injectable()
export class RozliczeniaOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly doladowanie: DoladowanieService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly autoDoladowanie: WalletAutoTopupService,
    private readonly promo: PromoService,
  ) {}

  private async klient(userId: string, operator: Operator, zmiana: boolean) {
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, email: true, anonymizedAt: true, customerOwnerId: true, walletBalance: true, walletCurrency: true },
    });
    if (!u || u.anonymizedAt) throw new NotFoundException('Klient nie istnieje.');
    if (operator.role !== 'ADMIN' && u.role !== 'USER') {
      throw new ForbiddenException('Personel widzi i zmienia wyłącznie portfele klientów — konto zespołu obsługuje administrator.');
    }
    if (zmiana && u.customerOwnerId) throw new BadRequestException('To subkonto — portfel należy do właściciela konta.');
    return u;
  }

  private powod(p: string | null | undefined): string {
    const t = (p ?? '').trim();
    if (t.length < MIN_POWOD_ROZLICZEN) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_ROZLICZEN} znaków) — zapisze się w dzienniku.`);
    return t;
  }

  private kwota(k: number | string): Prisma.Decimal {
    const d = new Prisma.Decimal(k);
    if (!d.isFinite() || d.lte(0) || d.gt(MAKS_KWOTA) || !d.eq(d.toDecimalPlaces(2))) {
      throw new BadRequestException(`Kwota musi być dodatnia, do ${MAKS_KWOTA} i mieć najwyżej dwa miejsca po przecinku.`);
    }
    return d;
  }

  private dziennikZespolu(klientId: string, operator: Operator, details: Record<string, unknown>) {
    return this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
      userId: klientId,
      actorUserId: operator.userId,
      details: bezPustych(details),
    });
  }

  // ── 1. nieudane płatności ─────────────────────────────────────────────────

  async nieudanePlatnosci(
    f: { zrodlo?: ZrodloPlatnosci; dni?: number; userId?: string; limit?: number; offset?: number },
    operator: Operator,
    teraz = new Date(),
  ): Promise<{ wiersze: NieudanaPlatnosc[]; total: number; od: string; ucieto: boolean }> {
    const dni = Math.min(Math.max(Math.trunc(f.dni ?? 30), 1), 365);
    const od = new Date(teraz.getTime() - dni * DZIEN);
    const limit = Math.min(Math.max(Math.trunc(f.limit ?? 50), 1), 200);
    const offset = Math.max(Math.trunc(f.offset ?? 0), 0);
    const chce = (z: ZrodloPlatnosci) => !f.zrodlo || f.zrodlo === z;
    // Przegląd F3.6 — personel widzi płatności wyłącznie kont klientów (USER); konta zespołu tylko administrator.
    const tylkoKlienci = operator.role !== 'ADMIN' ? { user: { role: 'USER' as const } } : {};
    const klientWhere = { ...(f.userId ? { userId: f.userId } : {}), ...tylkoKlienci };

    const [paynow, auto, stripe] = await Promise.all([
      chce('PAYNOW')
        ? this.prisma.paynowPlatnosc.findMany({
            where: { ...klientWhere, status: { in: STATUSY_PAYNOW }, updatedAt: { gte: od } },
            orderBy: { updatedAt: 'desc' },
            take: MAKS_ZE_ZRODLA,
            select: { id: true, userId: true, kwotaMinor: true, waluta: true, status: true, paymentId: true, updatedAt: true, user: { select: { email: true } } },
          })
        : [],
      chce('AUTO_DOLADOWANIE')
        ? this.prisma.auditLog.findMany({
            where: { ...klientWhere, action: { in: [...AKCJE_AUTO] }, createdAt: { gte: od } },
            orderBy: { createdAt: 'desc' },
            take: MAKS_ZE_ZRODLA,
            select: { id: true, userId: true, action: true, details: true, createdAt: true },
          })
        : [],
      chce('STRIPE')
        ? this.prisma.subscriptionEvent.findMany({
            where: {
              type: 'PAYMENT_FAILED',
              createdAt: { gte: od },
              details: { path: ['source'], equals: 'STRIPE' },
              subscription: { ...(f.userId ? { userId: f.userId } : {}), ...tylkoKlienci },
            },
            orderBy: { createdAt: 'desc' },
            take: MAKS_ZE_ZRODLA,
            select: {
              id: true,
              details: true,
              createdAt: true,
              subscription: { select: { userId: true, user: { select: { email: true } }, plan: { select: { name: true } }, account: { select: { domain: true } } } },
            },
          })
        : [],
    ]);
    const ucieto = [paynow, auto, stripe].some((z) => z.length >= MAKS_ZE_ZRODLA);
    const wiersze: NieudanaPlatnosc[] = [];

    for (const p of paynow) {
      wiersze.push({
        id: `paynow:${p.id}`,
        zrodlo: 'PAYNOW',
        kiedy: p.updatedAt.toISOString(),
        klient: { id: p.userId, email: p.user.email },
        kwota: (p.kwotaMinor / 100).toFixed(2),
        waluta: p.waluta,
        status: p.status,
        powod: p.status === 'EXPIRED' || p.status === 'ABANDONED' ? 'Klient nie dokończył płatności.' : 'Płatność odrzucona przez bank lub operatora płatności.',
        referencja: p.paymentId,
        ponowienie: { mozliwe: false, uwaga: 'Płatność online ponawia klient — w panelu zleca nowe doładowanie.' },
      });
    }

    const proby: ProbaAutoDoladowania[] = scalProbyAutoDoladowania(
      auto.flatMap((a) =>
        !a.userId
          ? []
          : [{
          id: a.id,
          userId: a.userId,
          kiedy: a.createdAt,
          akcja: a.action as ProbaAutoDoladowania['akcja'],
          powod: szczegol(a.details, 'message') ?? szczegol(a.details, 'error'),
          referencja: szczegol(a.details, 'stripeRef') ?? szczegol(a.details, 'paymentIntentId'),
        }],
      ),
    );
    if (proby.length) {
      const ids = [...new Set(proby.map((p) => p.userId))];
      const [konta, reguly] = await Promise.all([
        this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } }),
        this.prisma.walletAutoTopup.findMany({
          where: { userId: { in: ids } },
          select: { userId: true, enabled: true, topupAmount: true, currency: true, lastAttemptOk: true, lastAttemptError: true },
        }),
      ]);
      const email = new Map(konta.map((k) => [k.id, k.email]));
      const regula = new Map(reguly.map((r) => [r.userId, r]));
      const najnowsza = new Map<string, string>();
      for (const p of proby) if (!najnowsza.has(p.userId)) najnowsza.set(p.userId, p.id); // proby są malejąco po dacie
      for (const p of proby) {
        const r = regula.get(p.userId);
        const blokada = !r ? 'Klient usunął regułę auto-doładowania.' : najnowsza.get(p.userId) !== p.id ? 'Była już późniejsza próba.' : powodBlokadyPonowienia(r);
        wiersze.push({
          id: `auto:${p.id}`,
          zrodlo: 'AUTO_DOLADOWANIE',
          kiedy: p.kiedy.toISOString(),
          klient: { id: p.userId, email: email.get(p.userId) ?? null },
          kwota: r ? r.topupAmount.toFixed(2) : null,
          waluta: r?.currency ?? 'PLN',
          status: 'ODRZUCONA',
          powod: p.powod ? powodAutoDoladowania(p.powod) : null,
          referencja: p.referencja,
          ponowienie: blokada ? { mozliwe: false, uwaga: blokada } : { mozliwe: true, uwaga: 'Obciąży zapisaną kartę klienta kwotą z jego reguły.' },
        });
      }
    }

    if (stripe.length) {
      const fakturaZ = (d: unknown) => /stripe:invoice:(in_[A-Za-z0-9]+):payment_failed/.exec(szczegol(d, 'reason') ?? '')?.[1] ?? null;
      const refy = [...new Set(stripe.map((e) => fakturaZ(e.details)).filter((r): r is string => !!r))];
      const faktury = refy.length
        ? await this.prisma.invoice.findMany({ where: { provider: 'STRIPE', providerRef: { in: refy } }, select: { providerRef: true, amount: true, currency: true, status: true, number: true } })
        : [];
      const faktura = new Map(faktury.map((x) => [x.providerRef, x]));
      for (const e of stripe) {
        const ref = fakturaZ(e.details);
        const fv = ref ? faktura.get(ref) : undefined;
        const usluga = [e.subscription.plan?.name, e.subscription.account?.domain].filter(Boolean).join(' · ');
        wiersze.push({
          id: `stripe:${e.id}`,
          zrodlo: 'STRIPE',
          kiedy: e.createdAt.toISOString(),
          klient: { id: e.subscription.userId, email: e.subscription.user.email },
          kwota: fv ? fv.amount.toFixed(2) : null,
          waluta: fv?.currency ?? 'PLN',
          status: fv?.status === 'PAID' ? 'OPLACONA_POZNIEJ' : 'ODRZUCONA',
          powod: `Odnowienie kartą${usluga ? ` — ${usluga}` : ''}`,
          referencja: fv?.number ?? ref,
          ponowienie: {
            mozliwe: false,
            uwaga: fv?.status === 'PAID' ? 'Faktura opłacona później.' : 'Operator kart ponawia sam; klient może opłacić fakturę w panelu.',
          },
        });
      }
    }

    wiersze.sort((a, b) => b.kiedy.localeCompare(a.kiedy));
    return { wiersze: wiersze.slice(offset, offset + limit), total: wiersze.length, od: od.toISOString(), ucieto };
  }

  /** Ponowienie nieudanego auto-doładowania (karta zapisana przez klienta, kwota z jego reguły). */
  async ponowAutoDoladowanie(z: { userId: string; operator: Operator; powod: string; zgloszenie?: string | null }) {
    await this.klient(z.userId, z.operator, true);
    const powod = this.powod(z.powod);
    const zgloszenieId = await zgloszenieKlienta(this.prisma, z.userId, z.zgloszenie);
    const wynik = await this.autoDoladowanie.ponowPoBledzie(z.userId);
    if (wynik.wynik === 'pominieto') throw new ConflictException(wynik.powod);
    await this.dziennikZespolu(z.userId, z.operator, {
      akcja: 'ponowienie-auto-doladowania',
      powod,
      zgloszenieId,
      wynik: wynik.wynik === 'zlecono' ? 'ok' : 'blad',
      status: wynik.wynik === 'zlecono' ? wynik.status : undefined,
      paymentIntentId: wynik.wynik === 'zlecono' ? wynik.paymentIntentId : undefined,
      blad: wynik.wynik === 'blad' ? wynik.powod.slice(0, 300) : undefined,
    });
    // Błąd karty = błąd dla operatora (z treścią od operatora kart) — nie „zlecono”.
    if (wynik.wynik === 'blad') throw new ConflictException(`Płatność nie przeszła: ${powodAutoDoladowania(wynik.powod)} (${wynik.powod.slice(0, 160)})`);
    return {
      status: wynik.status,
      komunikat:
        wynik.status === 'succeeded'
          ? 'Płatność przyjęta — portfel zostanie uznany po potwierdzeniu od operatora kart.'
          : `Płatność zlecona (status: ${wynik.status}) — wynik pojawi się na liście.`,
    };
  }

  // ── 2. wpłata przelewem ───────────────────────────────────────────────────

  async zaksiegujPrzelew(z: {
    userId: string;
    operator: Operator;
    kwota: number | string;
    tytul: string;
    referencja: string;
    dataWplaty: Date;
    zgloszenie?: string | null;
  }) {
    await this.klient(z.userId, z.operator, true);
    const kwota = this.kwota(z.kwota);
    const tytul = (z.tytul ?? '').trim().replace(/\s+/g, ' ');
    if (tytul.length < 3 || tytul.length > 140) throw new BadRequestException('Tytuł przelewu: od 3 do 140 znaków (tak jak na wyciągu).');
    const referencja = normalizujReferencje(z.referencja ?? '');
    if (referencja.length < 4 || referencja.length > 100) throw new BadRequestException('Referencja z wyciągu: od 4 do 100 znaków (identyfikator transakcji w banku).');
    if (!(z.dataWplaty instanceof Date) || Number.isNaN(z.dataWplaty.getTime())) throw new BadRequestException('Nieprawidłowa data wpłaty.');
    if (z.dataWplaty.getTime() > Date.now() + 60 * 60 * 1000) throw new BadRequestException('Data wpłaty nie może być z przyszłości.');
    const zgloszenieId = await zgloszenieKlienta(this.prisma, z.userId, z.zgloszenie);
    const klucz = `przelew:${referencja}`;

    // Ten sam przelew drugi raz (podwójny klik, drugi operator, ponowny import wyciągu): klucz księgi go odrzuca.
    // Ta sama referencja z inną kwotą albo na innym koncie to pomyłka — 409, nic nie księgujemy.
    const juz = (w: WalletTransaction) => {
      const wplata = (w.metadata as { wplata?: { kwota?: string } } | null)?.wplata;
      if (w.userId !== z.userId || wplata?.kwota !== kwota.toFixed(2)) {
        throw new ConflictException('Przelew o tej referencji jest już zaksięgowany z inną kwotą albo na innym koncie — sprawdź wyciąg.');
      }
      return { duplikat: true as const, walletTxId: w.id, kredytK: new Prisma.Decimal(w.amount).toFixed(2), komunikat: 'Ten przelew był już zaksięgowany — nic nie zmieniono.' };
    };
    const istniejacy = await this.ledger.findByIdempotencyKey(klucz);
    if (istniejacy) return juz(istniejacy);

    const { wpis, kredytK, nowy } = await this.doladowanie.zaksieguj({
      userId: z.userId,
      kwotaMinor: Number(kwota.mul(100).toFixed(0)),
      waluta: 'PLN',
      meta: null,
      idempotencyKey: klucz,
      paymentRef: referencja,
      paymentProvider: 'PRZELEW',
      opis: `Wpłata przelewem — ${tytul}`,
      zaplaconoAt: z.dataWplaty,
      metadata: { channel: 'przelew', tytul, dataWplaty: z.dataWplaty.toISOString(), ...(zgloszenieId ? { zgloszenieId } : {}) },
    });
    if (!nowy) return juz(wpis);

    // Ta sama ścieżka po wpłacie co Stripe i Paynow: audyt WALLET_TOPUP_COMPLETED, mail do klienta, EKO.
    await this.billing.poZaksiegowaniuDoladowania({
      userId: z.userId,
      wpis,
      kredytK,
      meta: {},
      kwota: kwota.toFixed(2),
      waluta: 'PLN',
      odniesienie: klucz,
      szczegoly: { provider: 'PRZELEW', referencja },
    });
    const wspolne = { walletTxId: wpis.id, kwota: kwota.toFixed(2), kredytK: kredytK.toFixed(2), referencja, zgloszenieId };
    await this.audit.record({
      action: RozliczeniaOperatoraActions.WALLET_MANUAL_PAYMENT_POSTED,
      userId: z.userId,
      actorUserId: z.operator.userId,
      details: bezPustych(wspolne),
    });
    await this.dziennikZespolu(z.userId, z.operator, { ...wspolne, akcja: 'wplata-przelewem', tytul, dataWplaty: z.dataWplaty.toISOString(), wynik: 'ok' });
    const dok = await this.prisma.walletTransaction.findUnique({ where: { id: wpis.id }, select: { invoice: { select: { id: true, number: true } } } });
    return {
      duplikat: false as const,
      walletTxId: wpis.id,
      kredytK: kredytK.toFixed(2),
      dokument: dok?.invoice ?? null,
      komunikat: dok?.invoice
        ? `Zaksięgowano ${kredytK.toFixed(2)} K; dokument ${dok.invoice.number}.`
        : `Zaksięgowano ${kredytK.toFixed(2)} K; dokument powstanie przy obciążeniu portfela (model fakturowania).`,
    };
  }

  // ── 3. korekta salda i ruchy portfela ─────────────────────────────────────

  async korektaSalda(z: {
    userId: string;
    operator: Operator;
    kierunek: 'plus' | 'minus';
    kwota: number | string;
    powod: string;
    zgloszenie?: string | null;
    klucz: string;
  }) {
    const u = await this.klient(z.userId, z.operator, true);
    const kwota = this.kwota(z.kwota);
    const powod = this.powod(z.powod);
    if (z.kierunek !== 'plus' && z.kierunek !== 'minus') throw new BadRequestException('Kierunek korekty: plus albo minus.');
    if (!/^[A-Za-z0-9-]{8,64}$/.test(z.klucz ?? '')) throw new BadRequestException('Brak klucza operacji — odśwież formularz.');
    const zgloszenieId = await zgloszenieKlienta(this.prisma, z.userId, z.zgloszenie);
    const klucz = `korekta:${z.klucz}`;
    const zeZnakiem = z.kierunek === 'plus' ? kwota : kwota.negated();

    const juz = (w: WalletTransaction) => {
      if (w.userId !== z.userId || !new Prisma.Decimal(w.amount).eq(zeZnakiem)) {
        throw new ConflictException('Ten klucz operacji użyto już do innej korekty — odśwież formularz.');
      }
      return { duplikat: true as const, walletTxId: w.id, saldo: new Prisma.Decimal(w.balanceAfter).toFixed(2), komunikat: 'Ta korekta była już zapisana — nic nie zmieniono.' };
    };
    const istniejacy = await this.ledger.findByIdempotencyKey(klucz);
    if (istniejacy) return juz(istniejacy);

    let wpis: WalletTransaction;
    try {
      wpis = await this.prisma.$transaction((tx) =>
        this.ledger.zapiszWpis(
          tx,
          {
            userId: z.userId,
            amount: kwota,
            type: WalletTxType.ADJUSTMENT,
            // Klient widzi opis w historii portfela — bez powodu i bez nazwiska (D3); powód jest w dzienniku zespołu.
            description: `Korekta salda — obsługa Verris${zgl(zgloszenieId)}`,
            idempotencyKey: klucz,
            paymentProvider: 'MANUAL',
            metadata: bezPustych({ korekta: z.kierunek, zgloszenieId }),
          },
          z.kierunek === 'plus' ? 'credit' : 'debit',
          kwota,
          zeZnakiem,
        ),
      );
    } catch (err) {
      if (jestP2002(err)) {
        const w = await this.ledger.findByIdempotencyKey(klucz);
        if (w) return juz(w);
      }
      if (err instanceof ConflictException) {
        const teraz = await this.prisma.user.findUnique({ where: { id: z.userId }, select: { walletBalance: true } });
        throw new ConflictException(
          `Saldo klienta (${new Prisma.Decimal(teraz?.walletBalance ?? u.walletBalance).toFixed(2)} K) jest mniejsze niż kwota korekty — portfel nie może zejść poniżej zera.`,
        );
      }
      throw err;
    }

    const wspolne = { walletTxId: wpis.id, kwota: zeZnakiem.toFixed(2), zgloszenieId };
    await this.audit.record({
      action: RozliczeniaOperatoraActions.WALLET_OPERATOR_ADJUSTED,
      userId: z.userId,
      actorUserId: z.operator.userId,
      details: bezPustych(wspolne),
    });
    await this.dziennikZespolu(z.userId, z.operator, { ...wspolne, akcja: 'korekta-salda', powod, saldoPo: wpis.balanceAfter.toFixed(2), wynik: 'ok' });
    return {
      duplikat: false as const,
      walletTxId: wpis.id,
      saldo: wpis.balanceAfter.toFixed(2),
      komunikat: `Korekta ${zeZnakiem.gt(0) ? '+' : ''}${zeZnakiem.toFixed(2)} K zapisana. Saldo: ${wpis.balanceAfter.toFixed(2)} K.`,
    };
  }

  /** Rejestr ruchów portfela klienta (odczyt od L1, BILLING_VIEW; bez eksportu — eksport to EXPORT_DATA). */
  async ruchyPortfela(userId: string, operator: Operator, f: { typ?: WalletTxType; limit?: number; offset?: number }) {
    const u = await this.klient(userId, operator, false);
    const limit = Math.min(Math.max(Math.trunc(f.limit ?? 25), 1), 100);
    const offset = Math.max(Math.trunc(f.offset ?? 0), 0);
    const where: Prisma.WalletTransactionWhereInput = { userId, ...(f.typ ? { type: f.typ } : {}) };
    const [wiersze, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          status: true,
          amount: true,
          currency: true,
          balanceAfter: true,
          description: true,
          paymentProvider: true,
          paymentRef: true,
          createdAt: true,
          invoice: { select: { id: true, number: true } },
        },
      }),
      this.prisma.walletTransaction.count({ where }),
    ]);
    const paynowIds = wiersze.filter((w) => w.type === 'TOPUP' && w.paymentProvider === 'PAYNOW').map((w) => w.id);
    const doZwrotu = new Map(
      (paynowIds.length
        ? await this.prisma.paynowPlatnosc.findMany({ where: { walletTxId: { in: paynowIds } }, select: { walletTxId: true, kwotaMinor: true, zwroconoMinor: true } })
        : []
      ).map((r) => [r.walletTxId, ((r.kwotaMinor - r.zwroconoMinor) / 100).toFixed(2)]),
    );
    return {
      saldo: u.walletBalance.toFixed(2),
      waluta: u.walletCurrency,
      subkonto: !!u.customerOwnerId,
      total,
      wiersze: wiersze.map((w) => ({
        id: w.id,
        type: w.type,
        status: w.status,
        amount: w.amount.toFixed(2),
        currency: w.currency,
        balanceAfter: w.balanceAfter.toFixed(2),
        description: w.description,
        paymentProvider: w.paymentProvider,
        paymentRef: w.paymentRef,
        faktura: w.invoice,
        paynowDoZwrotu: doZwrotu.get(w.id) ?? null,
        createdAt: w.createdAt.toISOString(),
      })),
    };
  }

  // ── 4. przypomnienia i automatyczne zawieszenie (odczyt) ──────────────────

  private async ostatnieZdarzenia(ids: string[]) {
    const zdarzenia = ids.length
      ? await this.prisma.subscriptionEvent.findMany({
          where: { subscriptionId: { in: ids }, type: { in: ['PAYMENT_FAILED', 'SUSPENDED'] } },
          orderBy: { createdAt: 'desc' },
          select: { subscriptionId: true, type: true, details: true, createdAt: true },
        })
      : [];
    const nieudana = new Map<string, Date>();
    const zawieszenie = new Map<string, { kiedy: Date; powod: string | null }>();
    for (const e of zdarzenia) {
      if (e.type === 'PAYMENT_FAILED' && !nieudana.has(e.subscriptionId)) nieudana.set(e.subscriptionId, e.createdAt);
      if (e.type === 'SUSPENDED' && !zawieszenie.has(e.subscriptionId)) zawieszenie.set(e.subscriptionId, { kiedy: e.createdAt, powod: szczegol(e.details, 'reason') });
    }
    return { nieudana, zawieszenie };
  }

  private async kwotaOdnowienia(s: Parameters<PromoService['resolveNextRenewalAmount']>[0]) {
    return (await this.promo.resolveNextRenewalAmount(s)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private static readonly POLA_USLUGI = {
    id: true,
    userId: true,
    status: true,
    paymentSource: true,
    stripeSubscriptionId: true,
    currentPeriodEnd: true,
    cancelAt: true,
    paymentPromiseUntil: true,
    isTrial: true,
    priceAmount: true,
    listPriceAmount: true,
    appliedPromoCodeId: true,
    introDiscountPct: true,
    introDiscountPeriodsLeft: true,
    individualPrice: true,
    currency: true,
    plan: { select: { name: true } },
    account: { select: { domain: true } },
  } as const;

  private async zPrognoza(
    uslugi: Array<Prisma.SubscriptionGetPayload<{ select: typeof RozliczeniaOperatoraService.POLA_USLUGI }>>,
    saldo: (userId: string) => Prisma.Decimal,
    teraz: Date,
  ) {
    const { nieudana, zawieszenie } = await this.ostatnieZdarzenia(uslugi.map((s) => s.id));
    return Promise.all(
      uslugi.map(async (s) => {
        const p: Prognoza = prognozaWindykacji(
          { ...s, ostatniaNieudana: nieudana.get(s.id) ?? null, ostatnieZawieszenie: zawieszenie.get(s.id) ?? null },
          teraz,
        );
        const zPortfela = p.etap !== 'bez-windykacji' && s.paymentSource !== 'STRIPE_CARD';
        const kwota = zPortfela ? await this.kwotaOdnowienia(s) : null;
        const brakuje = kwota ? Prisma.Decimal.max(kwota.minus(saldo(s.userId)), 0) : null;
        return {
          id: s.id,
          userId: s.userId,
          usluga: [s.plan?.name, s.account?.domain].filter(Boolean).join(' · ') || s.id.slice(0, 8),
          status: s.status,
          zrodlo: s.paymentSource,
          koniecOkresu: s.currentPeriodEnd?.toISOString() ?? null,
          obietnicaDo: s.paymentPromiseUntil?.toISOString() ?? null,
          ostatniaNieudana: nieudana.get(s.id)?.toISOString() ?? null,
          kwotaOdnowienia: kwota?.toFixed(2) ?? null,
          brakuje: brakuje?.toFixed(2) ?? null,
          etap: p.etap,
          probaOdnowienia: p.probaOdnowienia?.toISOString() ?? null,
          zawieszenie: p.zawieszenie?.toISOString() ?? null,
          wygasniecie: p.wygasniecie?.toISOString() ?? null,
          uwaga: p.uwaga,
        };
      }),
    );
  }

  /** Karta klienta: kiedy dostał przypomnienia i co (oraz kiedy) zrobi harmonogram z każdą jego usługą. */
  async windykacjaKlienta(userId: string, operator: Operator, teraz = new Date()) {
    const u = await this.klient(userId, operator, false);
    const [uslugi, wpisy] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId, status: { in: ['ACTIVE', 'PAST_DUE', 'SUSPENDED'] } },
        orderBy: { currentPeriodEnd: 'asc' },
        take: 50,
        select: RozliczeniaOperatoraService.POLA_USLUGI,
      }),
      this.prisma.auditLog.findMany({
        where: { userId, action: { in: Object.keys(AKCJE_PRZYPOMNIEN) }, createdAt: { gte: new Date(teraz.getTime() - 90 * DZIEN) } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: { id: true, action: true, details: true, createdAt: true },
      }),
    ]);
    return {
      progi: PROGI_WINDYKACJI,
      saldo: u.walletBalance.toFixed(2),
      uslugi: await this.zPrognoza(uslugi, () => new Prisma.Decimal(u.walletBalance), teraz),
      przypomnienia: wpisy.map((w) => ({
        id: w.id,
        kiedy: w.createdAt.toISOString(),
        akcja: w.action,
        etykieta: AKCJE_PRZYPOMNIEN[w.action] ?? w.action,
        subscriptionId: szczegol(w.details, 'subscriptionId'),
        kwota: szczegol(w.details, 'amount'),
        brakuje: szczegol(w.details, 'shortfallAmount'),
      })),
    };
  }

  /**
   * Lista floty: usługi zaległe, zawieszone za brak płatności (do wygaśnięcia) i aktywne z portfela, którym w ciągu
   * 7 dni zabraknie środków na odnowienie. Najbliższe zdarzenie na górze.
   */
  async windykacjaLista(teraz = new Date()) {
    const za7dni = new Date(teraz.getTime() + 7 * DZIEN);
    const uslugi = await this.prisma.subscription.findMany({
      where: {
        user: { role: 'USER', anonymizedAt: null },
        OR: [
          { status: { in: ['PAST_DUE', 'SUSPENDED'] } },
          { status: 'ACTIVE', paymentSource: 'WALLET', cancelAt: null, isTrial: false, currentPeriodEnd: { lte: za7dni } },
        ],
      },
      orderBy: { currentPeriodEnd: 'asc' },
      take: 300,
      select: { ...RozliczeniaOperatoraService.POLA_USLUGI, user: { select: { email: true, walletBalance: true } } },
    });
    const saldo = new Map(uslugi.map((s) => [s.userId, new Prisma.Decimal(s.user.walletBalance)]));
    const email = new Map(uslugi.map((s) => [s.userId, s.user.email]));
    const wiersze = (await this.zPrognoza(uslugi, (id) => saldo.get(id) ?? new Prisma.Decimal(0), teraz))
      .filter((w) => {
        if (w.etap === 'odnowienie') return w.brakuje !== null && Number(w.brakuje) > 0;
        if (w.etap === 'zawieszona') return w.wygasniecie !== null; // tylko za brak płatności
        return w.etap === 'zalegla';
      })
      .map((w) => ({ ...w, email: email.get(w.userId) ?? null, saldo: (saldo.get(w.userId) ?? new Prisma.Decimal(0)).toFixed(2) }));
    const kolejne = (w: (typeof wiersze)[number]) => (w.etap === 'zawieszona' ? w.wygasniecie : w.zawieszenie) ?? '9999';
    wiersze.sort((a, b) => kolejne(a).localeCompare(kolejne(b)));
    return { progi: PROGI_WINDYKACJI, wiersze, ucieto: uslugi.length >= 300 };
  }
}
