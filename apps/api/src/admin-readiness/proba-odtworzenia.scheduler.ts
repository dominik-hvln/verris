import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { probaOdtworzeniaTemplate } from '../mail/templates/ops-notifications';
import { ocenProby, type ProbaOdtworzenia } from './proba-odtworzenia';

/**
 * H-20 — przypominanie o próbie odtworzenia.
 *
 * Bramka w gotowości do startu zatrzymuje sprzedaż, ale nikt na nią nie patrzy
 * codziennie. Dowód z odtworzenia starzeje się cicho: nic się nie psuje, nic
 * nie krzyczy, a po miesiącu warstwa DR jest znów niepotwierdzona.
 *
 * Dlatego przypomnienie idzie SAMO, siedem dni przed terminem — czyli wtedy,
 * gdy da się jeszcze zaplanować, a nie wtedy, gdy trzeba rzucić wszystko.
 */
@Injectable()
export class ProbaOdtworzeniaScheduler {
  private readonly logger = new Logger(ProbaOdtworzeniaScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (
      this.config.get<string>('adminPanelUrl') ??
      process.env.ADMIN_PANEL_URL ??
      'https://admin.verris.pl'
    ).replace(/\/$/, '');
  }

  /** Codziennie 08:30, po porannym podsumowaniu ops. */
  @Cron('30 8 * * *', { name: 'proba-odtworzenia-przypomnienie' })
  async przypomnij(): Promise<void> {
    const [ostatnia, ostatniaUdana] = await Promise.all([
      this.prisma.restoreDrill.findFirst({ orderBy: { finishedAt: 'desc' } }),
      this.prisma.restoreDrill.findFirst({
        where: { result: 'OK' },
        orderBy: { finishedAt: 'desc' },
      }),
    ]);
    const ocena = ocenProby(
      ostatnia as ProbaOdtworzenia | null,
      ostatniaUdana as ProbaOdtworzenia | null,
      new Date(),
    );

    // Stan „aktualna" nie generuje maila. Alert wysyłany codziennie, także gdy
    // wszystko jest w porządku, po tygodniu przestaje być czytany — a wtedy
    // przestaje działać także ten, który coś znaczy.
    if (ocena.stan === 'aktualna') return;

    const admini = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null },
      select: { email: true, firstName: true },
    });
    if (admini.length === 0) {
      this.logger.error(
        `Próba odtworzenia wymaga uwagi (${ocena.stan}), a w bazie nie ma administratora do powiadomienia`,
      );
      return;
    }

    for (const a of admini) {
      await this.mailer
        .send(
          probaOdtworzeniaTemplate({
            to: a.email,
            firstName: a.firstName,
            stan: ocena.stan as 'brak' | 'nieudana' | 'przeterminowana' | 'wkrotce',
            komunikat: ocena.komunikat,
            wiekDni: ocena.wiekDni,
            blokuje: ocena.blokuje,
            panelUrl: this.panelUrl(),
          }),
        )
        .catch((err) =>
          this.logger.error(
            `Nie udało się wysłać przypomnienia o próbie odtworzenia do ${a.email}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }

    await this.audit.record({
      action: 'PROBA_ODTWORZENIA_PRZYPOMNIENIE',
      details: {
        stan: ocena.stan,
        blokuje: ocena.blokuje,
        wiekDni: ocena.wiekDni,
        powiadomionych: admini.length,
      },
    });
    this.logger[ocena.blokuje ? 'error' : 'warn'](
      `Próba odtworzenia: ${ocena.stan} — ${ocena.komunikat}`,
    );
  }
}
