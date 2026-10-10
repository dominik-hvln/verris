import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { OutboundAbuseGuard } from '../deliverability/outbound-abuse.guard.js';
import { AkcjeKontaOperatoraService, type ZlecenieOperatora } from './akcje-konta-operatora.service.js';

/** Początek powodu kordonu nałożonego razem z blokadą obsługi — zwolnienie zdejmuje tylko taki kordon. */
export const KORDON_Z_BLOKADY = 'Blokada wysyłki konta przez obsługę';

/**
 * F3.1 (D4, 10.10) — poczta konta w panelu operatora: blokada i zwolnienie wysyłki.
 *
 * Blokada działa na węźle: konto trafia na listę `blacklist_usernames` exima DirectAdmina (directadmin.service.ts
 * ustawBlokadeWysylki → SDK setEmailSendBlocked, dokumentacja DA w komentarzu SDK) — exim odrzuca wtedy wysyłkę
 * SMTP z logowaniem i z PHP (mail()), a wiadomość nie trafia do kolejki. Limit dobowy konta nie jest zmieniany,
 * więc zwolnienie przywraca dokładnie poprzedni stan. Do tego kordon w Redis (outbound-abuse.guard.ts), który
 * zatrzymuje wysyłkę z modułu marketingu tego klienta.
 *
 * Reguły D2/D3 z paska akcji konta (AkcjeKontaOperatoraService.wykonaj): powód obowiązkowy, zgłoszenie klienta
 * opcjonalne, STAFF tylko na kontach klientów, dziennik zespołu z wynikiem (także błąd węzła), a klient widzi wpis
 * „obsługa Verris (zgłoszenie #…)”. Stan blokady (kto, kiedy, powód) w Account.mailBlocked*.
 */
@Injectable()
export class PocztaKontaOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly akcje: AkcjeKontaOperatoraService,
    private readonly kordon: OutboundAbuseGuard,
  ) {}

  /**
   * Stan blokady: z bazy (kto, kiedy, powód) i z węzła. Rozjazd (np. węzeł odtworzony z kopii) widać od razu —
   * ponowne „Zablokuj” go naprawia. Błąd odczytu z węzła nie ukrywa stanu z bazy.
   */
  async stan(subscriptionId: string) {
    const a = await this.prisma.account.findUnique({
      where: { subscriptionId },
      select: { daUsername: true, serverId: true, mailBlockedAt: true, mailBlockedById: true, mailBlockedReason: true },
    });
    if (!a) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    let naWezle: boolean | null = null;
    let obslugiwana: boolean | null = null;
    let bladWezla: string | null = null;
    try {
      const w = await this.directAdmin.blokadaWysylkiNaWezle(a.serverId, a.daUsername);
      naWezle = w.zablokowana;
      obslugiwana = w.obslugiwana;
    } catch (err) {
      bladWezla = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }
    const przez = a.mailBlockedById
      ? await this.prisma.user.findUnique({ where: { id: a.mailBlockedById }, select: { email: true } })
      : null;
    return {
      zablokowana: a.mailBlockedAt !== null,
      od: a.mailBlockedAt?.toISOString() ?? null,
      przez: przez?.email ?? null,
      powod: a.mailBlockedReason,
      naWezle,
      obslugiwana,
      bladWezla,
    };
  }

  /** Idempotentne: konto już zablokowane zostaje z pierwotnym „kto, kiedy, powód”, węzeł jest wyrównany. */
  async zablokuj(z: ZlecenieOperatora) {
    return this.akcje.wykonaj(
      z,
      'blokada-wysylki',
      {},
      async (w) => {
        const { zmieniono } = await this.directAdmin.ustawBlokadeWysylki(w.konto.serverId, w.konto.daUsername, true);
        const juz = await this.prisma.account.updateMany({
          where: { id: w.konto.id, mailBlockedAt: null },
          data: { mailBlockedAt: new Date(), mailBlockedById: z.operatorUserId, mailBlockedReason: z.powod.trim().slice(0, 500) },
        });
        await this.kordon.cordon(w.userId, `${KORDON_Z_BLOKADY}: ${z.powod.trim()}`.slice(0, 300), {
          subscriptionId: z.subscriptionId,
          source: 'operator',
        });
        return { ok: true as const, zablokowana: true, juzByla: juz.count === 0, zmienionoNaWezle: zmieniono };
      },
      { action: HostingResourceActions.HOSTING_MAIL_SENDING_BLOCKED, details: {} },
    );
  }

  /**
   * Zdejmuje blokadę na węźle i w bazie. Kordon marketingu zdejmuje tylko, gdy pochodził z blokady obsługi
   * i żadne inne konto klienta nie jest zablokowane — kordon nałożony automatycznie (skok wysyłki) zostaje.
   */
  async zwolnij(z: ZlecenieOperatora) {
    return this.akcje.wykonaj(
      z,
      'zwolnienie-wysylki',
      {},
      async (w) => {
        const { zmieniono } = await this.directAdmin.ustawBlokadeWysylki(w.konto.serverId, w.konto.daUsername, false);
        await this.prisma.account.update({
          where: { id: w.konto.id },
          data: { mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null },
        });
        const inne = await this.prisma.account.count({ where: { userId: w.userId, id: { not: w.konto.id }, mailBlockedAt: { not: null } } });
        const powod = await this.kordon.powodKordonu(w.userId);
        const kordonZdjety = inne === 0 && !!powod?.startsWith(KORDON_Z_BLOKADY);
        if (kordonZdjety) await this.kordon.release(w.userId, z.operatorUserId);
        return { ok: true as const, zablokowana: false, zmienionoNaWezle: zmieniono, kordonZdjety };
      },
      { action: HostingResourceActions.HOSTING_MAIL_SENDING_UNBLOCKED, details: {} },
    );
  }
}
