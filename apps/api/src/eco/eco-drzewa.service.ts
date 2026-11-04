import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, SubscriptionPaymentSource, WalletTxStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import {
  CERTYFIKAT_VERRIS,
  CZESCI_DRZEWA,
  CZESCI_PROCENTU,
  KLUCZE_DRZEW,
  KLUCZ_PUNKTY_NA_DRZEWO,
  groszeZKwoty,
  nettoZBruttoGrosze,
  odczytajUstawieniaDrzew,
  odstepPonowieniaMs,
  planujPrzydzial,
  punktyZaProcent,
  wkladZUslugiCzesci,
  type SrodowiskoDrzew,
  type UstawieniaDrzew,
} from './drzewa-model.js';
import { kluczPierwszejOplaty } from '../billing/paynow/zamowienie-paynow.js';
import { czescOplaconaPieniedzmi } from '../users/zwrot-salda.js';
import { ADRESY_POSADZIMY, PosadzimyBlad, PosadzimyClient } from './posadzimy.client.js';

type Db = PrismaService | Prisma.TransactionClient;

/** Zamówienie „w drodze” dłużej niż to = przebieg padł w trakcie wysyłki → NIEPEWNE (nie ponawiamy na ślepo). */
const WYSYLANE_PRZETERMINOWANE_MS = 15 * 60_000;
/** Maks. własnych drzew w jednej wymianie. */
export const MAKS_WLASNYCH_DRZEW_NA_RAZ = 10;

export const POWODY_WYMIANY_DRZEW = {
  PULA: 'EKO_DRZEWO_PULA',
  WLASNE: 'EKO_DRZEWO_WLASNE',
} as const;

/** Env z tokenem API partnera (wpisuje właściciel skryptem prod-ustaw-klucze.sh; NIE w panelu admina). */
export const ENV_TOKENU: Record<SrodowiskoDrzew, string> = {
  produkcja: 'POSADZIMY_API_TOKEN',
  test: 'POSADZIMY_API_TOKEN_TEST',
};

export type RaportPrzebiegu = {
  pominiety?: string;
  saldo?: number;
  wyslane: number;
  posadzone: number;
  bledy: string[];
};

const POSADZONE_PROD = { status: 'POSADZONE', srodowisko: 'produkcja' } as const;

@Injectable()
export class EcoDrzewaService {
  private readonly logger = new Logger(EcoDrzewaService.name);
  /** Test podmienia fabrykę na atrapę — z sesji nie wołamy prawdziwego API. */
  fabrykaKlienta = (u: UstawieniaDrzew, token: string) =>
    new PosadzimyClient({ baseUrl: ADRESY_POSADZIMY[u.srodowisko], token });

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async ustawienia(db: Db = this.prisma): Promise<UstawieniaDrzew> {
    const wiersze = await db.platformSetting.findMany({
      where: { key: { in: [...Object.values(KLUCZE_DRZEW), KLUCZ_PUNKTY_NA_DRZEWO] } },
      select: { key: true, value: true },
    });
    return odczytajUstawieniaDrzew(new Map(wiersze.map((w) => [w.key, w.value])));
  }

  private token(srodowisko: SrodowiskoDrzew): string {
    return (this.config.get<string>(ENV_TOKENU[srodowisko]) ?? '').trim();
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Wkład z opłaconej usługi
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Automatyczny wkład w drzewo z opłaconej usługi: ⌊netto × stawka⌋, idempotentnie po (usługa, płatność).
   * `referenceId` = klucz płatności (odnowienie z portfela: klucz idempotencji obciążenia; Stripe: id faktury);
   * pierwsza płatność: `pierwsza` (obciążenie portfela kluczem `sub-<id>-initial` albo przejście z okresu próbnego).
   *
   * Decyzja 16 (4.11.2026): wkład tylko od części zapłaconej prawdziwymi pieniędzmi. Przy obciążeniu portfela
   * kredyty z kodów (np. BETA), promocji, poleceń i rekompensat schodzą najpierw — ta sama kolejność co przy zwrocie
   * salda (`users/zwrot-salda.ts`, {@link czescOplaconaPieniedzmi}). Płatność kartą (Stripe) albo poza Verris to
   * pieniądze w całości. Usługa z portfela bez obciążenia (np. cena 0 zł) i okres próbny bez przejścia na płatny
   * nie dają wkładu. Zwraca liczbę części albo 0.
   */
  async wkladZUslugi(
    db: Db,
    input: { userId: string; subscriptionId: string; referenceId: string; pierwsza: boolean },
  ): Promise<number> {
    const referenceId = `usluga:${input.subscriptionId}:${input.referenceId}`.slice(0, 200);
    if (await db.ecoWkladDrzewa.findUnique({ where: { referenceId }, select: { id: true } })) return 0;

    const sub = await db.subscription.findUnique({
      where: { id: input.subscriptionId },
      select: {
        userId: true,
        priceAmount: true,
        listPriceAmount: true,
        individualPrice: true,
        isTrial: true,
        trialConvertedAt: true,
        paymentSource: true,
      },
    });
    if (!sub || sub.userId !== input.userId) return 0;
    if (sub.isTrial && !sub.trialConvertedAt) return 0;

    const klucze = input.pierwsza
      ? [kluczPierwszejOplaty(input.subscriptionId), `trial-convert-${input.subscriptionId}`]
      : [input.referenceId];
    const obciazenie = await db.walletTransaction.findFirst({
      where: { idempotencyKey: { in: klucze }, userId: input.userId, status: WalletTxStatus.COMPLETED },
      orderBy: { createdAt: 'asc' },
      select: { amount: true, createdAt: true },
    });

    let bruttoGrosze: number;
    if (obciazenie) {
      if (groszeZKwoty(obciazenie.amount) >= 0) return 0;
      const przed = await db.walletTransaction.findMany({
        where: { userId: input.userId, status: WalletTxStatus.COMPLETED, createdAt: { lt: obciazenie.createdAt } },
        select: { type: true, amount: true, status: true, idempotencyKey: true, createdAt: true },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      bruttoGrosze = groszeZKwoty(czescOplaconaPieniedzmi(obciazenie.amount, przed).toFixed(2));
    } else if (sub.paymentSource === SubscriptionPaymentSource.WALLET) {
      return 0;
    } else if (input.pierwsza) bruttoGrosze = groszeZKwoty(sub.priceAmount);
    else bruttoGrosze = groszeZKwoty(sub.individualPrice ?? sub.listPriceAmount ?? sub.priceAmount);

    const nettoGrosze = nettoZBruttoGrosze(bruttoGrosze);
    const czesci = wkladZUslugiCzesci(nettoGrosze, (await this.ustawienia(db)).wkladNa100ZlNetto);
    if (czesci <= 0) return 0;
    try {
      await db.ecoWkladDrzewa.create({
        data: {
          userId: input.userId,
          zrodlo: 'USLUGA',
          czesci,
          referenceId,
          subscriptionId: input.subscriptionId,
          kwotaNettoGrosze: nettoGrosze,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 0;
      throw e;
    }
    return czesci;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Wymiana punktów
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Wymiana punktów EKO: `PULA` — procent drzewa (1–100) do wspólnej puli; `WLASNE` — całe drzewa z certyfikatem
   * na klienta. Punkty schodzą dekrementem warunkowym w tej samej transakcji, w której powstaje wkład/zamówienie.
   */
  async wymien(
    actor: { userId: string; customerOwnerId?: string | null; impersonatedBy?: string | null },
    input: { cel: 'PULA' | 'WLASNE'; procent?: number; drzewa?: number },
  ) {
    if (actor.customerOwnerId || actor.impersonatedBy) {
      throw new ForbiddenException('Punkty wymienia wyłącznie właściciel konta.');
    }
    const userId = actor.userId;
    const u = await this.ustawienia();
    let punkty: number;
    let czesci: number;
    if (input.cel === 'PULA') {
      const procent = Math.trunc(input.procent ?? 0);
      if (!(procent >= 1 && procent <= 100)) throw new BadRequestException('Wybierz od 1 do 100% drzewa.');
      punkty = punktyZaProcent(procent, u.punktyNaDrzewo);
      czesci = procent * CZESCI_PROCENTU;
    } else {
      const drzewa = Math.trunc(input.drzewa ?? 0);
      if (!(drzewa >= 1 && drzewa <= MAKS_WLASNYCH_DRZEW_NA_RAZ)) {
        throw new BadRequestException(`Wybierz od 1 do ${MAKS_WLASNYCH_DRZEW_NA_RAZ} drzew.`);
      }
      punkty = drzewa * u.punktyNaDrzewo;
      czesci = drzewa * CZESCI_DRZEWA;
    }

    return this.prisma.$transaction(async (tx) => {
      const zdjete = await tx.user.updateMany({
        where: { id: userId, ecoPoints: { gte: punkty } },
        data: { ecoPoints: { decrement: punkty } },
      });
      if (zdjete.count === 0) {
        if (!(await tx.user.count({ where: { id: userId } }))) throw new NotFoundException('Nie znaleziono konta.');
        throw new BadRequestException(`Za mało punktów EKO — potrzebujesz ${punkty} pkt.`);
      }
      const wpis = await tx.ecoPointsLedgerEntry.create({
        data: { userId, delta: -punkty, reason: POWODY_WYMIANY_DRZEW[input.cel] },
      });
      if (input.cel === 'PULA') {
        await tx.ecoWkladDrzewa.create({
          data: { userId, zrodlo: 'PUNKTY', czesci, referenceId: `punkty:${wpis.id}` },
        });
      } else {
        // Decyzja 17 — certyfikat własnego drzewa też wyłącznie na Verris (bez nazwy klienta); przypisanie do klienta
        // zostaje u nas (userId), klient widzi certyfikat w panelu.
        await tx.ecoZamowienieSadzenia.create({
          data: {
            rodzaj: 'WLASNE',
            userId,
            liczbaDrzew: czesci / CZESCI_DRZEWA,
            nazwaNaCertyfikacie: CERTYFIKAT_VERRIS.customerName,
            tekstCertyfikatu: CERTYFIKAT_VERRIS.certificateText,
            kosztDrzewaGrosze: u.kosztDrzewaGrosze,
            punktyWydane: punkty,
            srodowisko: u.srodowisko,
          },
        });
      }
      const { ecoPoints } = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { ecoPoints: true } });
      return { ok: true as const, cel: input.cel, punktyWydane: punkty, czesci, punktyPo: ecoPoints };
    });
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Liczniki i dane panelu
  // ---------------------------------------------------------------------------------------------------------------

  /** Drzewa posadzone przez Verris (pula + własne klientów), tylko produkcja, tylko z certyfikatem. */
  async licznikVerris(): Promise<number> {
    const a = await this.prisma.ecoZamowienieSadzenia.aggregate({
      where: { ...POSADZONE_PROD, certificateUrl: { not: null } },
      _sum: { liczbaDrzew: true },
    });
    return a._sum.liczbaDrzew ?? 0;
  }

  /** Liczniki klienta w częściach: z wkładu (udział w posadzonych drzewach zbiorczych) i własne. */
  async licznikiKlienta(userId: string): Promise<{ zWkladuCzesci: number; wlasne: number }> {
    const [zWkladu, wlasne] = await Promise.all([
      this.prisma.ecoWkladDrzewa.aggregate({
        where: { userId, zamowienie: { ...POSADZONE_PROD, rodzaj: 'PULA', certificateUrl: { not: null } } },
        _sum: { czesci: true },
      }),
      this.prisma.ecoZamowienieSadzenia.aggregate({
        where: { userId, rodzaj: 'WLASNE', ...POSADZONE_PROD, certificateUrl: { not: null } },
        _sum: { liczbaDrzew: true },
      }),
    ]);
    return { zWkladuCzesci: zWkladu._sum.czesci ?? 0, wlasne: wlasne._sum.liczbaDrzew ?? 0 };
  }

  /** Licznik na odznakę: `verris` = wszystkie drzewa Verris, `moje` = własne + udział z wkładu. W częściach. */
  async licznikOdznaki(userId: string, licznik: 'verris' | 'moje'): Promise<number> {
    if (licznik === 'verris') return (await this.licznikVerris()) * CZESCI_DRZEWA;
    const k = await this.licznikiKlienta(userId);
    return k.wlasne * CZESCI_DRZEWA + k.zWkladuCzesci;
  }

  async panelKlienta(userId: string) {
    const u = await this.ustawienia();
    const [user, verris, moje, czekaWkladu, pulaWolna, wlasneZam, udzialy] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { ecoPoints: true } }),
      this.licznikVerris(),
      this.licznikiKlienta(userId),
      this.prisma.ecoWkladDrzewa.aggregate({
        where: {
          userId,
          OR: [{ zamowienieId: null }, { zamowienie: { NOT: { ...POSADZONE_PROD, certificateUrl: { not: null } } } }],
        },
        _sum: { czesci: true },
      }),
      this.prisma.ecoWkladDrzewa.aggregate({ where: { zamowienieId: null }, _sum: { czesci: true } }),
      this.prisma.ecoZamowienieSadzenia.findMany({
        where: { userId, rodzaj: 'WLASNE' },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      this.prisma.ecoWkladDrzewa.groupBy({
        by: ['zamowienieId'],
        where: { userId, zamowienie: { status: 'POSADZONE', certificateUrl: { not: null } } },
        _sum: { czesci: true },
      }),
    ]);
    if (!user) throw new NotFoundException('Nie znaleziono konta.');
    const idsPuli = udzialy.map((x) => x.zamowienieId).filter((x): x is string => Boolean(x));
    const zamPuli = idsPuli.length
      ? await this.prisma.ecoZamowienieSadzenia.findMany({ where: { id: { in: idsPuli } }, orderBy: { posadzoneAt: 'desc' } })
      : [];
    const udzial = new Map(udzialy.map((x) => [x.zamowienieId, x._sum.czesci ?? 0]));
    const certyfikat = (z: (typeof wlasneZam)[number]) => ({
      id: z.id,
      rodzaj: z.rodzaj,
      liczbaDrzew: z.liczbaDrzew,
      // Klient widzi tylko to, co pewne: posadzone = jest certyfikat; reszta to „w realizacji”.
      status: z.status === 'POSADZONE' && z.certificateUrl ? ('POSADZONE' as const) : ('W_REALIZACJI' as const),
      testowe: z.srodowisko !== 'produkcja',
      certificateUrl: z.status === 'POSADZONE' ? z.certificateUrl : null,
      certificateImageUrl: z.status === 'POSADZONE' ? z.certificateImageUrl : null,
      posadzoneAt: z.posadzoneAt,
      utworzone: z.createdAt,
      mojeCzesci: z.rodzaj === 'PULA' ? (udzial.get(z.id) ?? 0) : z.liczbaDrzew * CZESCI_DRZEWA,
    });
    return {
      punkty: user.ecoPoints,
      punktyNaDrzewo: u.punktyNaDrzewo,
      wkladNa100ZlNetto: u.wkladNa100ZlNetto,
      maksWlasnychNaRaz: MAKS_WLASNYCH_DRZEW_NA_RAZ,
      liczniki: {
        verris: verris,
        zWkladuCzesci: moje.zWkladuCzesci,
        wlasne: moje.wlasne,
      },
      /** Twoje wkłady, które czekają na drzewo (w puli albo w zamówieniu bez certyfikatu). */
      czekaCzesci: czekaWkladu._sum.czesci ?? 0,
      /** Ile części jest teraz we wspólnej puli (do kolejnego drzewa zbiorczego). */
      pulaCzesci: (pulaWolna._sum.czesci ?? 0) % CZESCI_DRZEWA,
      certyfikaty: [...wlasneZam.map(certyfikat), ...zamPuli.map(certyfikat)],
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Sadzenie (harmonogram)
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Jeden przebieg: (1) zawieszone w wysyłce → NIEPEWNE, (2) saldo kredytów API, (3) zaległe zamówienia
   * (własne i zbiorcze), (4) nowe drzewa zbiorcze z pełnej puli — tylko na tyle drzew, na ile starcza kredytów.
   * Odrzucenie przez API nie zabiera wkładu: zamówienie wraca do kolejki z przydzielonymi wkładami.
   */
  async przebieg(teraz = new Date()): Promise<RaportPrzebiegu> {
    const raport: RaportPrzebiegu = { wyslane: 0, posadzone: 0, bledy: [] };
    await this.prisma.ecoZamowienieSadzenia.updateMany({
      where: { status: 'WYSYLANE', wyslaneAt: { lt: new Date(teraz.getTime() - WYSYLANE_PRZETERMINOWANE_MS) } },
      data: { status: 'NIEPEWNE', ostatniBlad: 'Wysyłka przerwana bez odpowiedzi — sprawdź w panelu partnera, czy zamówienie powstało.' },
    });

    const u = await this.ustawienia();
    if (!u.wlaczone) return { ...raport, pominiety: 'Sadzenie wyłączone w ustawieniach.' };
    if (!u.idSadzenia) return { ...raport, pominiety: 'Brak ID sadzenia w ustawieniach.' };
    const token = this.token(u.srodowisko);
    if (!token) return { ...raport, pominiety: `Brak tokenu API (${ENV_TOKENU[u.srodowisko]}).` };
    const klient = this.fabrykaKlienta(u, token);

    let saldo: number;
    try {
      saldo = await klient.saldo();
    } catch (e) {
      const msg = e instanceof PosadzimyBlad ? e.message : `Saldo kredytów: ${(e as Error).message}`;
      raport.bledy.push(msg);
      return raport;
    }
    raport.saldo = saldo;
    let dostepne = Math.floor(saldo / u.kredytyNaDrzewo);

    const zalegle = await this.prisma.ecoZamowienieSadzenia.findMany({
      where: { status: 'OCZEKUJE', OR: [{ nastepnaProbaPo: null }, { nastepnaProbaPo: { lte: teraz } }] },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });
    for (const z of zalegle) {
      if (z.liczbaDrzew > dostepne) {
        await this.prisma.ecoZamowienieSadzenia.update({
          where: { id: z.id },
          data: { ostatniBlad: `Za mało kredytów API (saldo ${saldo}, potrzeba ${z.liczbaDrzew * u.kredytyNaDrzewo}).` },
        });
        raport.bledy.push(`Zamówienie ${z.id}: za mało kredytów API.`);
        continue;
      }
      const w = await this.wyslij(z.id, u, klient, teraz, raport);
      if (w) dostepne -= z.liczbaDrzew;
    }

    for (let i = 0; i < 20 && dostepne >= 1; i++) {
      const nowe = await this.utworzZamowieniePuli(Math.min(u.maksDrzewNaZamowienie, dostepne), u);
      if (!nowe) break;
      const w = await this.wyslij(nowe.id, u, klient, teraz, raport);
      if (!w) break; // odrzucone/niepewne — nie zakładamy kolejnych w tym przebiegu
      dostepne -= nowe.liczbaDrzew;
    }
    return raport;
  }

  /** Drzewa zbiorcze z pełnej puli: przydział wkładów FIFO pod blokadą (jedna instancja naraz). */
  async utworzZamowieniePuli(maksDrzew: number, u: UstawieniaDrzew) {
    if (maksDrzew < 1) return null;
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('eko-pula-drzew'))`;
      const wolne = await tx.ecoWkladDrzewa.findMany({
        where: { zamowienieId: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, czesci: true, userId: true, zrodlo: true, subscriptionId: true, createdAt: true },
      });
      const suma = wolne.reduce((s, w) => s + w.czesci, 0);
      const drzewa = Math.min(maksDrzew, Math.floor(suma / CZESCI_DRZEWA));
      if (drzewa < 1) return null;
      const zam = await tx.ecoZamowienieSadzenia.create({
        data: {
          rodzaj: 'PULA',
          liczbaDrzew: drzewa,
          nazwaNaCertyfikacie: CERTYFIKAT_VERRIS.customerName,
          tekstCertyfikatu: CERTYFIKAT_VERRIS.certificateText,
          kosztDrzewaGrosze: u.kosztDrzewaGrosze,
          srodowisko: u.srodowisko,
        },
      });
      const plan = planujPrzydzial(wolne, drzewa * CZESCI_DRZEWA);
      if (plan.cale.length) {
        await tx.ecoWkladDrzewa.updateMany({ where: { id: { in: plan.cale } }, data: { zamowienieId: zam.id } });
      }
      if (plan.podzial) {
        const o = wolne.find((w) => w.id === plan.podzial!.id)!;
        await tx.ecoWkladDrzewa.update({
          where: { id: o.id },
          data: { czesci: plan.podzial.przydzielone, zamowienieId: zam.id },
        });
        await tx.ecoWkladDrzewa.create({
          data: {
            userId: o.userId,
            zrodlo: o.zrodlo,
            czesci: plan.podzial.reszta,
            subscriptionId: o.subscriptionId,
            createdAt: o.createdAt,
          },
        });
      }
      return zam;
    });
  }

  /** Wysyła jedno zamówienie (zajęcie OCZEKUJE → WYSYLANE atomowo). true = API przyjęło (jest orderId). */
  private async wyslij(
    id: string,
    u: UstawieniaDrzew,
    klient: PosadzimyClient,
    teraz: Date,
    raport: RaportPrzebiegu,
  ): Promise<boolean> {
    const zajete = await this.prisma.ecoZamowienieSadzenia.updateMany({
      where: { id, status: 'OCZEKUJE', orderId: null },
      data: { status: 'WYSYLANE', proby: { increment: 1 }, wyslaneAt: teraz, srodowisko: u.srodowisko },
    });
    if (zajete.count === 0) return false;
    const z = await this.prisma.ecoZamowienieSadzenia.findUniqueOrThrow({ where: { id } });
    raport.wyslane += 1;
    // Decyzja 17 — do partnera idą wyłącznie stałe dane Verris (nie pola z wiersza), więc żadne dane klienta nie wyjdą
    // nawet z zamówienia zapisanego przed tą zmianą.
    const w = await klient.zamow({
      customerName: CERTYFIKAT_VERRIS.customerName,
      treeGroupID: u.idSadzenia,
      numberOfTrees: z.liczbaDrzew,
      certificateText: CERTYFIKAT_VERRIS.certificateText,
    });
    if (w.rodzaj === 'przyjete') {
      try {
        await this.prisma.ecoZamowienieSadzenia.update({
          where: { id },
          data: {
            status: w.certificateUrl ? 'POSADZONE' : 'ZLOZONE',
            orderId: w.orderId,
            certificateUrl: w.certificateUrl,
            certificateImageUrl: w.certificateImageUrl,
            posadzoneAt: w.certificateUrl ? teraz : null,
            ostatniBlad: w.certificateUrl ? null : 'API przyjęło zamówienie bez certyfikatu — uzupełnij adres certyfikatu.',
            nastepnaProbaPo: null,
          },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        await this.prisma.ecoZamowienieSadzenia.update({
          where: { id },
          data: { status: 'NIEPEWNE', ostatniBlad: `API zwróciło orderId ${w.orderId}, który mamy już przy innym zamówieniu.` },
        });
        raport.bledy.push(`Zamówienie ${id}: powtórzony orderId ${w.orderId}.`);
        return false;
      }
      if (w.certificateUrl) raport.posadzone += z.liczbaDrzew;
      return true;
    }
    if (w.rodzaj === 'odrzucone') {
      await this.prisma.ecoZamowienieSadzenia.update({
        where: { id },
        data: {
          status: 'OCZEKUJE',
          ostatniBlad: w.blad,
          nastepnaProbaPo: new Date(teraz.getTime() + odstepPonowieniaMs(z.proby)),
        },
      });
    } else {
      await this.prisma.ecoZamowienieSadzenia.update({ where: { id }, data: { status: 'NIEPEWNE', ostatniBlad: w.blad } });
    }
    raport.bledy.push(`Zamówienie ${id}: ${w.blad}`);
    this.logger.warn(`sadzenie drzew: zamówienie ${id} — ${w.rodzaj}: ${w.blad}`);
    return false;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // Admin
  // ---------------------------------------------------------------------------------------------------------------

  async panelAdmina() {
    const u = await this.ustawienia();
    const [pula, wszystkie, verris, testowe, zamowienia, statusy] = await Promise.all([
      this.prisma.ecoWkladDrzewa.aggregate({ where: { zamowienieId: null }, _sum: { czesci: true } }),
      this.prisma.ecoWkladDrzewa.groupBy({ by: ['zrodlo'], _sum: { czesci: true } }),
      this.licznikVerris(),
      this.prisma.ecoZamowienieSadzenia.aggregate({
        where: { status: 'POSADZONE', srodowisko: 'test' },
        _sum: { liczbaDrzew: true },
      }),
      this.prisma.ecoZamowienieSadzenia.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { email: true } } },
      }),
      this.prisma.ecoZamowienieSadzenia.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      ustawienia: u,
      tokeny: { produkcja: Boolean(this.token('produkcja')), test: Boolean(this.token('test')) },
      envTokenow: ENV_TOKENU,
      pulaCzesci: pula._sum.czesci ?? 0,
      wkladyCzesci: Object.fromEntries(wszystkie.map((x) => [x.zrodlo, x._sum.czesci ?? 0])),
      posadzoneProdukcja: verris,
      posadzoneTest: testowe._sum.liczbaDrzew ?? 0,
      statusy: Object.fromEntries(statusy.map((x) => [x.status, x._count._all])),
      zamowienia: zamowienia.map((z) => ({
        id: z.id,
        rodzaj: z.rodzaj,
        klient: z.user?.email ?? null,
        liczbaDrzew: z.liczbaDrzew,
        status: z.status,
        srodowisko: z.srodowisko,
        proby: z.proby,
        ostatniBlad: z.ostatniBlad,
        orderId: z.orderId,
        certificateUrl: z.certificateUrl,
        createdAt: z.createdAt,
        posadzoneAt: z.posadzoneAt,
      })),
    };
  }

  async zapiszUstawienia(dane: Partial<Omit<UstawieniaDrzew, 'punktyNaDrzewo'>> & { punktyNaDrzewo?: number }, actorUserId: string) {
    const wpisy: Array<[string, string]> = [];
    if (dane.wlaczone !== undefined) wpisy.push([KLUCZE_DRZEW.WLACZONE, dane.wlaczone ? '1' : '0']);
    if (dane.srodowisko !== undefined) wpisy.push([KLUCZE_DRZEW.SRODOWISKO, dane.srodowisko]);
    if (dane.kosztDrzewaGrosze !== undefined) wpisy.push([KLUCZE_DRZEW.KOSZT_DRZEWA_GROSZE, String(dane.kosztDrzewaGrosze)]);
    if (dane.wkladNa100ZlNetto !== undefined) wpisy.push([KLUCZE_DRZEW.WKLAD_NA_100_ZL_NETTO, String(dane.wkladNa100ZlNetto)]);
    if (dane.idSadzenia !== undefined) wpisy.push([KLUCZE_DRZEW.ID_SADZENIA, dane.idSadzenia.trim()]);
    if (dane.kredytyNaDrzewo !== undefined) wpisy.push([KLUCZE_DRZEW.KREDYTY_NA_DRZEWO, String(dane.kredytyNaDrzewo)]);
    if (dane.maksDrzewNaZamowienie !== undefined) {
      wpisy.push([KLUCZE_DRZEW.MAKS_DRZEW_NA_ZAMOWIENIE, String(dane.maksDrzewNaZamowienie)]);
    }
    if (dane.punktyNaDrzewo !== undefined) wpisy.push([KLUCZ_PUNKTY_NA_DRZEWO, String(dane.punktyNaDrzewo)]);
    const przed = await this.ustawienia();
    await this.prisma.$transaction(
      wpisy.map(([key, value]) =>
        this.prisma.platformSetting.upsert({
          where: { key },
          create: { key, value, updatedByUserId: actorUserId },
          update: { value, updatedByUserId: actorUserId },
        }),
      ),
    );
    const po = await this.ustawienia();
    await this.audit.record({
      action: 'ADMIN_ECO_TREES_SETTINGS_UPDATED',
      userId: actorUserId,
      actorUserId,
      details: { przed, po } as unknown as Prisma.InputJsonValue,
    });
    return po;
  }

  /** Sprawdzenie połączenia: saldo kredytów w wybranym środowisku. */
  async saldoAdmin(): Promise<{ saldo: number; srodowisko: SrodowiskoDrzew }> {
    const u = await this.ustawienia();
    const token = this.token(u.srodowisko);
    if (!token) throw new BadRequestException(`Brak tokenu API w ${ENV_TOKENU[u.srodowisko]}.`);
    try {
      return { saldo: await this.fabrykaKlienta(u, token).saldo(), srodowisko: u.srodowisko };
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Nie udało się sprawdzić salda.');
    }
  }

  /** NIEPEWNE → OCZEKUJE: admin sprawdził w panelu partnera, że zamówienia tam nie ma. */
  async ponow(id: string, actorUserId: string) {
    const r = await this.prisma.ecoZamowienieSadzenia.updateMany({
      where: { id, status: 'NIEPEWNE', orderId: null },
      data: { status: 'OCZEKUJE', nastepnaProbaPo: null, ostatniBlad: null },
    });
    if (r.count === 0) throw new BadRequestException('Ponowić można tylko zamówienie niepewne bez orderId.');
    await this.audit.record({ action: 'ADMIN_ECO_TREE_ORDER_RETRY', userId: actorUserId, actorUserId, details: { id } });
    return { ok: true as const };
  }

  /** NIEPEWNE/ZLOZONE → POSADZONE: admin przepisuje orderId i adres certyfikatu z panelu partnera. */
  async potwierdz(
    id: string,
    dane: { orderId: number; certificateUrl: string; certificateImageUrl?: string | null },
    actorUserId: string,
  ) {
    if (!/^https:\/\//.test(dane.certificateUrl)) throw new BadRequestException('Adres certyfikatu musi zaczynać się od https://.');
    const z = await this.prisma.ecoZamowienieSadzenia.findUnique({ where: { id } });
    if (!z || !['NIEPEWNE', 'ZLOZONE'].includes(z.status)) {
      throw new BadRequestException('Potwierdzić można tylko zamówienie niepewne albo złożone bez certyfikatu.');
    }
    if (z.orderId !== null && z.orderId !== dane.orderId) {
      throw new BadRequestException(`To zamówienie ma już orderId ${z.orderId}.`);
    }
    try {
      await this.prisma.ecoZamowienieSadzenia.update({
        where: { id },
        data: {
          status: 'POSADZONE',
          orderId: dane.orderId,
          certificateUrl: dane.certificateUrl,
          certificateImageUrl: dane.certificateImageUrl ?? null,
          posadzoneAt: new Date(),
          ostatniBlad: null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('Ten orderId jest już przypisany do innego zamówienia.');
      }
      throw e;
    }
    await this.audit.record({
      action: 'ADMIN_ECO_TREE_ORDER_CONFIRMED',
      userId: actorUserId,
      actorUserId,
      details: { id, orderId: dane.orderId },
    });
    return { ok: true as const };
  }
}
