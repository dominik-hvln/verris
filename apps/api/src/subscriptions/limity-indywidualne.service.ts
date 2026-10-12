import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AccountStatus, Prisma, SubscriptionStatus } from '@verris/database';
import { MIN_POWOD_LIMITOW, walidujLimityIndywidualne, type LimityIndywidualne } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CyklZyciaUslugiActions, SupportActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { buildDaPackageSpecFromPlan, planResourceFields } from '../servers/da-package-spec.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';
import { deltaJestZerowa, deltaKsiegi, ksiegaUpdateData } from './node-capacity.js';
import {
  limityKontaNaWezle,
  nadpisaniaDoZapisu,
  nadpisaniaZBazy,
  opisLimitow,
  planZNadpisaniami,
  takieSame,
} from './limity-indywidualne.js';

export interface ZlecenieLimitow {
  subscriptionId: string;
  operator: { userId: string; role: string };
  powod: string;
  zgloszenie?: string | null;
  /** Nadpisania (puste pole = jak w planie). Pusty obiekt = przywrócenie limitów planu. */
  limity: unknown;
}

const ZAKONCZONE: SubscriptionStatus[] = [SubscriptionStatus.CANCELED, SubscriptionStatus.EXPIRED];
const blad = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

/**
 * K3 (PB-53.5, F3.5 „limity custom”) — administrator nadpisuje limity planu dla JEDNEJ usługi (dysk, transfer, domeny,
 * skrzynki, bazy) albo wraca do limitów planu. Wariant minimalny (decyzja 12.10).
 *
 * Kolejność: walidacja → zapis na węźle (CMD_API_MODIFY_USER action=customize, pełny zestaw liczb z planu
 * + nadpisań) → zapis w bazie. Błąd węzła = błąd operacji, w bazie nic się nie zmienia. Błąd zapisu w bazie po
 * udanym zapisie na węźle — kompensacja: węzeł dostaje z powrotem poprzednie limity (wynik w dzienniku zespołu).
 *
 * Tylko ADMIN (kontroler): to darmowe zasoby ponad cennik i zmiana zobowiązań węzła (księga dysku) — tak jak
 * zakończenie usługi (D1) i bez odpowiednika w katalogu uprawnień personelu.
 */
@Injectable()
export class LimityIndywidualneService {
  private readonly logger = new Logger(LimityIndywidualneService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
  ) {}

  async ustaw(z: ZlecenieLimitow) {
    if (z.operator.role !== 'ADMIN') throw new ForbiddenException('Limity indywidualne ustawia administrator.');
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD_LIMITOW) {
      throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_LIMITOW} znaków) — zapisze się w dzienniku.`);
    }
    const w = walidujLimityIndywidualne(z.limity);
    if (!w.ok) throw new BadRequestException(w.blad);

    const s = await this.prisma.subscription.findUnique({
      where: { id: z.subscriptionId },
      include: { plan: true, account: true },
    });
    if (!s) throw new NotFoundException('Usługa nie istnieje.');
    if (ZAKONCZONE.includes(s.status)) throw new BadRequestException('Usługa jest zakończona — limitów nie zmienia się.');
    const konto = s.account;
    if (!konto || (konto.status !== AccountStatus.ACTIVE && konto.status !== AccountStatus.SUSPENDED)) {
      throw new BadRequestException('Usługa nie ma konta hostingowego na serwerze — limity ustawisz po jego założeniu.');
    }
    if (s.plan.productKind !== 'HOSTING') {
      throw new BadRequestException('Limity indywidualne dotyczą usługi hostingowej.');
    }
    const zgloszenieId = await zgloszenieKlienta(this.prisma, s.userId, z.zgloszenie);

    const plan = planResourceFields(s.plan);
    const przed = nadpisaniaZBazy(s.limitOverrides);
    const po = nadpisaniaDoZapisu(plan, w.limity);
    if (takieSame(przed, po)) {
      return { bezZmian: true, komunikat: 'Usługa ma już te limity.', limity: opisLimitow(plan, s.limitOverrides) };
    }

    const bazaPrzed = planZNadpisaniami(s.plan, przed).diskLimitMb;
    const bazaPo = planZNadpisaniami(s.plan, po).diskLimitMb;
    if (bazaPo < bazaPrzed) {
      const szczyt = await this.szczytDyskuMb(s.id, konto.id);
      if (szczyt > bazaPo + konto.scaledDiskMb) {
        throw new BadRequestException(
          `Zajęte miejsce na koncie (${Math.ceil(szczyt)} MB w ostatnich 48 h) przekracza nowy limit dysku (${bazaPo + konto.scaledDiskMb} MB) — strona i poczta przestałyby zapisywać pliki.`,
        );
      }
    }

    // 1) Węzeł. Błąd = błąd operacji, baza bez zmian.
    const klient = await this.da.getClientForServer(konto.serverId);
    try {
      // Powrót do planu bez nadwyżki autoskalowania = z powrotem pakiet planu. Samo „customize” wartościami planu
      // zostawiało w DA `package=custom` (t1 12.10) i konto nie dostawało już zmian pakietu planu. Przy nadwyżce
      // autoskalowania quota jest większa niż w pakiecie, więc konto i tak musi mieć ustawienia indywidualne.
      if (Object.keys(po).length === 0 && konto.scaledDiskMb <= 0) {
        await klient.assignUserPackage(konto.daUsername, buildDaPackageSpecFromPlan(plan).name);
      } else {
        await klient.customizeUserLimits(konto.daUsername, limityKontaNaWezle(plan, po, konto.scaledDiskMb));
      }
    } catch (err) {
      throw new ConflictException(`Serwer nie przyjął zmiany limitów — nic nie zmieniono: ${blad(err)}`);
    }

    // 2) Baza: nadpisania, quota konta (baza + nadwyżka autoskalowania) i księga dysku węzła o różnicę bazy.
    const roznica = bazaPo - bazaPrzed;
    const pusto = Object.keys(po).length === 0;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: s.id },
          data: { limitOverrides: pusto ? Prisma.DbNull : (po as Prisma.InputJsonValue) },
        });
        if (roznica !== 0) {
          // increment — równoległe autoskalowanie zmienia nadwyżkę, nie bazę; obie zmiany się sumują.
          await tx.account.update({ where: { id: konto.id }, data: { diskLimitMb: { increment: roznica } } });
          const delta = deltaKsiegi({ cpu: 0, ramMb: 0, diskMb: bazaPrzed }, { cpu: 0, ramMb: 0, diskMb: bazaPo });
          if (!deltaJestZerowa(delta)) await tx.server.update({ where: { id: konto.serverId }, data: ksiegaUpdateData(delta) });
        }
        // Oś „Co się działo” klienta: bez powodu i bez operatora (D3).
        await tx.subscriptionEvent.create({
          data: pusto
            ? { subscriptionId: s.id, type: 'LIMITS_RESET', details: { source: 'OPERATOR' } }
            : { subscriptionId: s.id, type: 'LIMITS_CUSTOMIZED', details: { source: 'OPERATOR', limity: po } as Prisma.InputJsonValue },
        });
      });
    } catch (err) {
      await this.kompensuj(z, { klient, daUsername: konto.daUsername, plan, przed, scaledDiskMb: konto.scaledDiskMb, userId: s.userId, subscriptionId: s.id, domain: konto.domain, zgloszenieId, powod, blad: blad(err) });
      throw new ConflictException('Zapis w panelu nie powiódł się — limity na serwerze przywrócone do poprzednich. Spróbuj ponownie.');
    }

    const wspolne = { subscriptionId: s.id, domain: konto.domain, ...(zgloszenieId ? { zgloszenieId } : {}) };
    await this.audit.record({
      action: pusto ? CyklZyciaUslugiActions.SUBSCRIPTION_LIMITS_RESET : CyklZyciaUslugiActions.SUBSCRIPTION_LIMITS_CUSTOMIZED,
      userId: s.userId,
      actorUserId: z.operator.userId,
      details: { ...wspolne, przed, po } as Prisma.InputJsonValue,
    });
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
      userId: s.userId,
      actorUserId: z.operator.userId,
      details: { ...wspolne, akcja: pusto ? 'limity-planu' : 'limity-indywidualne', przed, po, powod, wynik: 'ok' } as Prisma.InputJsonValue,
    });

    return {
      bezZmian: false,
      komunikat: pusto ? 'Przywrócono limity planu.' : 'Zapisano limity indywidualne — obowiązują na serwerze.',
      limity: opisLimitow(plan, po),
    };
  }

  /** Zapis w bazie padł po zmianie na węźle — węzeł wraca do poprzednich limitów; każdy wynik w dzienniku zespołu. */
  private async kompensuj(
    z: ZlecenieLimitow,
    o: {
      klient: Awaited<ReturnType<DirectAdminService['getClientForServer']>>;
      daUsername: string;
      plan: ReturnType<typeof planResourceFields>;
      przed: LimityIndywidualne;
      scaledDiskMb: number;
      userId: string;
      subscriptionId: string;
      domain: string;
      zgloszenieId: string | null;
      powod: string;
      blad: string;
    },
  ) {
    let wynik = 'baza-blad-wezel-przywrocony';
    try {
      await o.klient.customizeUserLimits(o.daUsername, limityKontaNaWezle(o.plan, o.przed, o.scaledDiskMb));
    } catch (err) {
      wynik = 'baza-blad-wezel-rozjechany';
      this.logger.error(`K3: limity konta ${o.daUsername} na serwerze inne niż w bazie (kompensacja nieudana): ${blad(err)}`);
    }
    await this.audit
      .record({
        action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
        userId: o.userId,
        actorUserId: z.operator.userId,
        details: {
          subscriptionId: o.subscriptionId,
          domain: o.domain,
          ...(o.zgloszenieId ? { zgloszenieId: o.zgloszenieId } : {}),
          akcja: 'limity-indywidualne',
          powod: o.powod,
          wynik,
          blad: o.blad,
        },
      })
      .catch(() => undefined);
  }

  private async szczytDyskuMb(subscriptionId: string, accountId: string): Promise<number> {
    const od = new Date(Date.now() - 48 * 3_600_000);
    const r = await this.prisma.usageMetric.aggregate({
      where: { bucketStart: { gte: od }, OR: [{ subscriptionId }, { accountId }] },
      _max: { diskUsageMb: true },
    });
    return r._max.diskUsageMb ?? 0;
  }
}
