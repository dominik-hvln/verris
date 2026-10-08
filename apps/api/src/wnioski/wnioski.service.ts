import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import type { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { OperatorRequestActions } from '../common/audit/audit.actions.js';
import { kontekstZadania } from '../common/audit/kontekst-magazyn.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { UsersAdminService } from '../users/users.admin.service.js';
import { BillingService } from '../billing/billing.service.js';
import { AnulowanieService } from '../billing/anulowanie.service.js';
import { roleZWiersza, sumaUprawnien, uprawnieniaOperatora } from '../staff-roles/uprawnienia-operatora.js';
import {
  definicjaWniosku,
  mozeWykonac,
  typyDoDecyzji,
  wymaganeUprawnienia,
  type DefinicjaWniosku,
  type ZaleznosciWnioskow,
} from './rejestr-wnioskow.js';

/** Zalogowany operator (z JWT; przy impersonacji liczy się principal). */
export interface Operator {
  userId: string;
  role: string;
}

const STATUSY = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'FAILED'] as const;
type Status = (typeof STATUSY)[number];

const OSOBA = { select: { id: true, email: true, firstName: true, lastName: true } } as const;
const WIERSZ = {
  include: { requestedBy: OSOBA, decidedBy: OSOBA, customer: OSOBA },
} as const;

type Osoba = { id: string; email: string; firstName: string | null; lastName: string | null } | null;
type Wiersz = {
  id: string;
  type: string;
  customerId: string | null;
  subscriptionId: string | null;
  payload: Prisma.JsonValue;
  justification: string;
  requestedById: string;
  status: string;
  decidedById: string | null;
  decisionReason: string | null;
  decidedAt: Date | null;
  result: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  requestedBy?: Osoba;
  decidedBy?: Osoba;
  customer?: Osoba;
};

/** JSON z kluczami w stałej kolejności — porównanie payloadów niezależne od kolejności pól. */
function kanoniczny(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(kanoniczny).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${kanoniczny((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

const nazwa = (o: Osoba | undefined) => (o ? [o.firstName, o.lastName].filter(Boolean).join(' ').trim() || o.email : null);

/** Komunikat błędu wykonawcy do zapisania przy wniosku (FAILED) — czytelny, bez stosu. */
export function komunikatBledu(err: unknown): string {
  if (err instanceof HttpException) {
    const r = err.getResponse();
    const m = typeof r === 'string' ? r : (r as { message?: string | string[] }).message;
    return (Array.isArray(m) ? m.join(', ') : m) || err.message;
  }
  const m = err instanceof Error ? err.message : String(err);
  return `Operacja nie powiodła się: ${m.slice(0, 300)}`;
}

/**
 * PB-48 (decyzja właściciela 08.10) — wnioski o operację wymagającą wyższego uprawnienia.
 *
 * Pracownik bez uprawnienia składa wniosek z uzasadnieniem; akceptuje ADMIN albo STAFF z REQUESTS_APPROVE
 * i uprawnieniem samej operacji (suma ról, sprawdzana w chwili decyzji). Operacja wykonuje się z uprawnieniem
 * akceptującego przez istniejący serwis — w dzienniku actor = akceptujący, a wpisy operacji niosą wniosekId
 * i wnioskującego (kontekst dziennika, audit.service.ts zWnioskiem).
 *
 * Akceptacja jest atomowa: warunkowy update PENDING→APPROVED; drugi równoczesny klik dostaje 409 i nic nie
 * wykonuje. Błąd wykonawcy → FAILED z komunikatem (serwisy operacji same są transakcyjne, więc bez stanu
 * częściowego). Proces przerwany w trakcie wykonania zostawia APPROVED bez wyniku — widać to na liście.
 */
@Injectable()
export class WnioskiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly users: UsersAdminService,
    private readonly billing: BillingService,
    private readonly anulowanieSvc: AnulowanieService,
  ) {}

  private get zaleznosci(): ZaleznosciWnioskow {
    return {
      prisma: this.prisma as unknown as ZaleznosciWnioskow['prisma'],
      uzytkownicy: this.users,
      portfel: this.billing as unknown as ZaleznosciWnioskow['portfel'],
      anulowanie: this.anulowanieSvc,
    };
  }

  private async uprawnienia(op: Operator): Promise<string[]> {
    return op.role === 'ADMIN' ? [] : uprawnieniaOperatora(this.prisma, op.userId);
  }

  private definicja(typ: string): DefinicjaWniosku<object> {
    const d = definicjaWniosku(typ);
    if (!d) throw new BadRequestException('Nieznany typ wniosku.');
    return d;
  }

  /** Payload przez klasę DTO typu (te same reguły co globalny ValidationPipe). */
  private payload(def: DefinicjaWniosku<object>, surowy: unknown): Record<string, unknown> {
    if (!surowy || typeof surowy !== 'object' || Array.isArray(surowy)) throw new BadRequestException('Brak parametrów operacji.');
    const obiekt = plainToInstance(def.dto, surowy, { enableImplicitConversion: true });
    const bledy = validateSync(obiekt, { whitelist: true, forbidNonWhitelisted: true });
    if (bledy.length) {
      const pola = bledy.map((b) => b.property).join(', ');
      throw new BadRequestException(`Nieprawidłowe parametry operacji (${pola}).`);
    }
    return { ...(obiekt as Record<string, unknown>) };
  }

  private async klient(def: DefinicjaWniosku<object>, userId: string | undefined | null): Promise<string | null> {
    if (!def.wymagaKlienta) return userId ?? null;
    if (!userId) throw new BadRequestException('Wskaż klienta, którego dotyczy wniosek.');
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, anonymizedAt: true } });
    if (!u || u.anonymizedAt) throw new NotFoundException('Klient nie istnieje.');
    if (u.role !== 'USER') throw new BadRequestException('Wniosek może dotyczyć tylko konta klienta.');
    return userId;
  }

  // ── złożenie ───────────────────────────────────────────────────────────────

  async zloz(
    op: Operator,
    dto: { typ: string; userId?: string; subscriptionId?: string; payload: unknown; uzasadnienie: string },
  ) {
    const def = this.definicja(dto.typ);
    const uzasadnienie = dto.uzasadnienie?.trim() ?? '';
    if (uzasadnienie.length < 5) throw new BadRequestException('Napisz uzasadnienie wniosku (min. 5 znaków).');
    if (op.role === 'ADMIN') {
      throw new BadRequestException({ code: 'WYKONAJ_BEZPOSREDNIO', message: 'Administrator wykonuje tę operację bezpośrednio — wniosek nie jest potrzebny.' });
    }
    const perms = await this.uprawnienia(op);
    if (mozeWykonac(def, perms)) {
      throw new BadRequestException({ code: 'WYKONAJ_BEZPOSREDNIO', message: 'Masz uprawnienie do tej operacji — wykonaj ją bezpośrednio, bez wniosku.' });
    }
    if (!perms.includes(def.doZlozenia)) throw new ForbiddenException('Twoja rola nie pozwala składać wniosków o tę operację.');

    const payload = this.payload(def, dto.payload);
    const klientId = await this.klient(def, dto.userId);
    await def.sprawdzPrzyZlozeniu?.(payload, klientId, this.zaleznosci);
    // Usługa (kontekst na liście wniosków) musi należeć do klienta wniosku — w tabeli nie ma klucza obcego.
    if (dto.subscriptionId) {
      const usluga = await this.prisma.subscription.findUnique({ where: { id: dto.subscriptionId }, select: { userId: true } });
      if (!usluga || usluga.userId !== klientId) throw new NotFoundException('Usługa nie istnieje na koncie tego klienta.');
    }
    // Ten sam wniosek drugi raz (np. po odświeżeniu karty) — każdy ma własny klucz idempotencji, więc dwie
    // akceptacje u różnych osób wykonałyby operację dwa razy (np. podwójne zasilenie portfela).
    const oczekujace = await this.prisma.operatorRequest.findMany({
      where: { type: dto.typ, customerId: klientId, requestedById: op.userId, status: 'PENDING' },
      select: { id: true, payload: true },
    });
    if (oczekujace.some((o) => kanoniczny(o.payload) === kanoniczny(payload))) {
      throw new ConflictException('Taki sam wniosek już czeka na decyzję — znajdziesz go w „Moje wnioski”.');
    }

    const w = await this.prisma.operatorRequest.create({
      data: {
        type: dto.typ,
        customerId: klientId,
        subscriptionId: dto.subscriptionId ?? null,
        payload: payload as Prisma.InputJsonValue,
        justification: uzasadnienie,
        requestedById: op.userId,
      },
      ...WIERSZ,
    });
    await this.audit.record({
      action: OperatorRequestActions.OPERATOR_REQUEST_SUBMITTED,
      userId: klientId,
      actorUserId: op.userId,
      details: { wniosekId: w.id, typ: w.type, payload: payload as Prisma.InputJsonValue, uzasadnienie },
    });
    await this.powiadomDecydujacych(w, def);
    return this.widok(w);
  }

  /** Nowy wniosek → dzwonek u adminów i operatorów, którzy mogą go zaakceptować (bez wnioskującego). */
  private async powiadomDecydujacych(w: Wiersz, def: DefinicjaWniosku<object>) {
    const kandydaci = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'STAFF'] }, id: { not: w.requestedById }, anonymizedAt: null },
      select: {
        id: true,
        role: true,
        staffRole: { select: { id: true, name: true, permissions: true } },
        staffRoleAssignments: { select: { role: { select: { id: true, name: true, permissions: true } } } },
      },
    });
    const odbiorcy = kandydaci.filter((k) => {
      if (k.role === 'ADMIN') return true;
      const p = sumaUprawnien(roleZWiersza(k));
      return p.includes('REQUESTS_APPROVE') && mozeWykonac(def, p);
    });
    const kto = nazwa(w.requestedBy) ?? 'Pracownik';
    const dla = w.customer ? ` · klient ${w.customer.email}` : '';
    for (const o of odbiorcy) {
      await this.notifications.create({
        userId: o.id,
        category: 'SYSTEM',
        severity: 'warning',
        title: `Wniosek do decyzji: ${def.etykieta}`,
        body: `${kto} prosi o: ${def.opis(w.payload as object)}${dla}. Uzasadnienie: ${w.justification}`,
        link: '/wnioski',
      });
    }
  }

  private async powiadomWnioskujacego(w: Wiersz, def: DefinicjaWniosku<object>, tytul: string, tresc: string) {
    await this.notifications.create({
      userId: w.requestedById,
      category: 'SYSTEM',
      severity: w.status === 'APPROVED' ? 'info' : 'warning',
      title: `${tytul}: ${def.etykieta}`,
      body: tresc,
      link: '/wnioski?zakladka=moje',
    });
  }

  // ── decyzje ────────────────────────────────────────────────────────────────

  /** Wspólne warunki decyzji: wniosek istnieje, czeka, nie jest własny, decydujący ma uprawnienia teraz. */
  private async doDecyzji(id: string, op: Operator): Promise<{ w: Wiersz; def: DefinicjaWniosku<object> }> {
    const w = await this.prisma.operatorRequest.findUnique({ where: { id }, ...WIERSZ });
    if (!w) throw new NotFoundException('Wniosek nie istnieje.');
    if (w.requestedById === op.userId) throw new ForbiddenException('Nie możesz rozpatrzyć własnego wniosku.');
    const def = this.definicja(w.type);
    if (!typyDoDecyzji(op.role, await this.uprawnienia(op)).includes(w.type as never)) {
      throw new ForbiddenException(`Decyzja wymaga uprawnień „Akceptacja wniosków o operację” i tych, których wymaga sama operacja (${wymaganeUprawnienia(def).join(', ')}).`);
    }
    if (w.status !== 'PENDING') throw new ConflictException('Wniosek został już rozpatrzony.');
    return { w, def };
  }

  async akceptuj(id: string, op: Operator, uwaga?: string) {
    const { w, def } = await this.doDecyzji(id, op);
    // Payload ponownie przez DTO (mógł zostać zapisany przed zmianą reguł).
    let payload: Record<string, unknown>;
    try {
      payload = this.payload(def, w.payload);
    } catch (err) {
      return this.zakonczNiepowodzeniem(w, def, op, komunikatBledu(err), { przejmij: true });
    }

    // Atomowo: tylko jeden decydujący przejmuje wniosek.
    const teraz = new Date();
    const { count } = await this.prisma.operatorRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: op.userId, decidedAt: teraz, decisionReason: uwaga?.trim() || null },
    });
    if (count === 0) throw new ConflictException('Wniosek został już rozpatrzony.');

    let wynik: Record<string, unknown>;
    try {
      const bezZmian = await def.bezZmian?.(payload, w.customerId, this.zaleznosci);
      if (bezZmian) {
        wynik = { komunikat: bezZmian, bezZmian: true };
      } else {
        const magazyn = { ...(kontekstZadania.getStore() ?? {}), wniosek: { wniosekId: w.id, wnioskujacyUserId: w.requestedById } };
        wynik = await kontekstZadania.run(magazyn, () =>
          def.wykonaj(payload, { wniosekId: w.id, klientId: w.customerId, decydujacy: { userId: op.userId, role: op.role } }, this.zaleznosci),
        );
      }
    } catch (err) {
      return this.zakonczNiepowodzeniem(w, def, op, komunikatBledu(err), { przejmij: false });
    }

    const po = await this.prisma.operatorRequest.update({
      where: { id },
      data: { result: wynik as Prisma.InputJsonValue },
      ...WIERSZ,
    });
    await this.audit.record({
      action: OperatorRequestActions.OPERATOR_REQUEST_APPROVED,
      userId: w.customerId,
      actorUserId: op.userId,
      details: {
        wniosekId: w.id,
        typ: w.type,
        wnioskujacyUserId: w.requestedById,
        payload: payload as Prisma.InputJsonValue,
        wynik: wynik as Prisma.InputJsonValue,
      },
    });
    await this.powiadomWnioskujacego(po, def, 'Wniosek zaakceptowany', `${nazwa(po.decidedBy) ?? 'Akceptujący'}: ${String(wynik.komunikat ?? 'wykonano.')}`);
    return this.widok(po);
  }

  /** FAILED z komunikatem. `przejmij` — wniosek jeszcze PENDING (błąd przed przejęciem). */
  private async zakonczNiepowodzeniem(w: Wiersz, def: DefinicjaWniosku<object>, op: Operator, blad: string, o: { przejmij: boolean }) {
    const { count } = await this.prisma.operatorRequest.updateMany({
      where: { id: w.id, status: o.przejmij ? 'PENDING' : 'APPROVED', ...(o.przejmij ? {} : { decidedById: op.userId }) },
      data: { status: 'FAILED', result: { blad }, ...(o.przejmij ? { decidedById: op.userId, decidedAt: new Date() } : {}) },
    });
    if (count === 0) throw new ConflictException('Wniosek został już rozpatrzony.');
    await this.audit.record({
      action: OperatorRequestActions.OPERATOR_REQUEST_FAILED,
      userId: w.customerId,
      actorUserId: op.userId,
      details: { wniosekId: w.id, typ: w.type, wnioskujacyUserId: w.requestedById, blad },
    });
    const po = await this.prisma.operatorRequest.findUniqueOrThrow({ where: { id: w.id }, ...WIERSZ });
    await this.powiadomWnioskujacego(po, def, 'Wniosek nie został wykonany', blad);
    return this.widok(po);
  }

  async odrzuc(id: string, op: Operator, powod: string | undefined) {
    const p = powod?.trim() ?? '';
    if (p.length < 3) throw new BadRequestException('Podaj powód odrzucenia (min. 3 znaki).');
    const { w, def } = await this.doDecyzji(id, op);
    const { count } = await this.prisma.operatorRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', decidedById: op.userId, decidedAt: new Date(), decisionReason: p },
    });
    if (count === 0) throw new ConflictException('Wniosek został już rozpatrzony.');
    await this.audit.record({
      action: OperatorRequestActions.OPERATOR_REQUEST_REJECTED,
      userId: w.customerId,
      actorUserId: op.userId,
      details: { wniosekId: w.id, typ: w.type, wnioskujacyUserId: w.requestedById, powod: p },
    });
    const po = await this.prisma.operatorRequest.findUniqueOrThrow({ where: { id }, ...WIERSZ });
    await this.powiadomWnioskujacego(po, def, 'Wniosek odrzucony', `${nazwa(po.decidedBy) ?? 'Decydujący'}: ${p}`);
    return this.widok(po);
  }

  async anuluj(id: string, op: Operator) {
    const w = await this.prisma.operatorRequest.findUnique({ where: { id }, select: { id: true, type: true, customerId: true, requestedById: true, status: true } });
    if (!w) throw new NotFoundException('Wniosek nie istnieje.');
    if (w.requestedById !== op.userId) throw new ForbiddenException('Wycofać może tylko osoba, która złożyła wniosek.');
    const { count } = await this.prisma.operatorRequest.updateMany({
      where: { id, status: 'PENDING', requestedById: op.userId },
      data: { status: 'CANCELLED' },
    });
    if (count === 0) throw new ConflictException('Wniosek został już rozpatrzony.');
    await this.audit.record({
      action: OperatorRequestActions.OPERATOR_REQUEST_CANCELLED,
      userId: w.customerId,
      actorUserId: op.userId,
      details: { wniosekId: w.id, typ: w.type },
    });
    return this.widok(await this.prisma.operatorRequest.findUniqueOrThrow({ where: { id }, ...WIERSZ }));
  }

  // ── listy ──────────────────────────────────────────────────────────────────

  async moje(op: Operator) {
    const rows = await this.prisma.operatorRequest.findMany({
      where: { requestedById: op.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      ...WIERSZ,
    });
    return rows.map((r) => this.widok(r));
  }

  /** Oczekujące, o których ten operator może zdecydować (bez własnych). */
  async doDecyzjiLista(op: Operator) {
    const typy = typyDoDecyzji(op.role, await this.uprawnienia(op));
    if (!typy.length) return [];
    const rows = await this.prisma.operatorRequest.findMany({
      where: { status: 'PENDING', type: { in: typy }, requestedById: { not: op.userId } },
      orderBy: { createdAt: 'asc' },
      take: 200,
      ...WIERSZ,
    });
    return rows.map((r) => this.widok(r));
  }

  /** Historia (ADMIN — wszystkie typy; STAFF z REQUESTS_APPROVE — typy, o których może decydować). */
  async historia(op: Operator, q: { status?: string; userId?: string }) {
    const typy = typyDoDecyzji(op.role, await this.uprawnienia(op));
    if (!typy.length) return [];
    if (q.status && !STATUSY.includes(q.status as Status)) throw new BadRequestException('Nieznany status wniosku.');
    const rows = await this.prisma.operatorRequest.findMany({
      where: {
        type: { in: typy },
        ...(q.status ? { status: q.status as Status } : {}),
        ...(q.userId ? { customerId: q.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      ...WIERSZ,
    });
    return rows.map((r) => this.widok(r));
  }

  private widok(r: Wiersz) {
    const def = definicjaWniosku(r.type);
    return {
      id: r.id,
      typ: r.type,
      etykieta: def?.etykieta ?? r.type,
      opis: def ? def.opis(r.payload as object) : '',
      uprawnienie: def?.uprawnienie ?? null,
      status: r.status,
      payload: r.payload,
      uzasadnienie: r.justification,
      klient: r.customer ? { id: r.customer.id, email: r.customer.email, nazwa: nazwa(r.customer) } : null,
      subscriptionId: r.subscriptionId,
      wnioskujacy: r.requestedBy ? { id: r.requestedBy.id, nazwa: nazwa(r.requestedBy) } : { id: r.requestedById, nazwa: null },
      decydujacy: r.decidedBy ? { id: r.decidedBy.id, nazwa: nazwa(r.decidedBy) } : null,
      powodDecyzji: r.decisionReason,
      wynik: r.result,
      utworzono: r.createdAt.toISOString(),
      rozstrzygnieto: r.decidedAt?.toISOString() ?? null,
    };
  }
}
