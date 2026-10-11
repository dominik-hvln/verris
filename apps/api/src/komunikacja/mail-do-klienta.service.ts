import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { szablonMailaObslugi } from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { SupportActions } from '../common/audit/audit.actions.js';
import { MailerService } from '../mail/mailer.service.js';
import { mailObslugiTemplate } from '../mail/templates/obsluga-notifications.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';
import { sprawdzTrescSerwisowa } from './tresc-serwisowa.js';

/**
 * F3.8 (ON-03) — mail do klienta z szablonu z karty klienta (L1+: CUSTOMERS_VIEW + TICKETS_MANAGE). Poczta serwisowa:
 * TRANSACTIONAL, nadawca obsługa (odpowiedź wraca do zgłoszeń przez skrzynkę zespołu), bez nazwiska operatora (D3).
 * Ślad: EmailLog z userId klienta (historia maili na karcie) i dziennik zespołu OPERATOR_CUSTOMER_MAILED.
 * Błąd wysyłki = błąd dla operatora (nie „wysłano”).
 */
@Injectable()
export class MailDoKlientaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  async wyslij(
    klientId: string,
    operatorUserId: string,
    dto: { szablon: string; temat: string; tresc: string; zgloszenie?: string | null },
  ): Promise<{ wyslany: true; emailLogId: string | null }> {
    const s = szablonMailaObslugi(dto.szablon);
    if (!s) throw new BadRequestException('Wybierz szablon z listy.');
    const klient = await this.prisma.user.findUnique({
      where: { id: klientId },
      select: { id: true, role: true, email: true, anonymizedAt: true },
    });
    if (!klient) throw new NotFoundException('Klient nie istnieje.');
    if (klient.role !== 'USER') throw new ForbiddenException('Mail z szablonu wysyłamy tylko do klientów.');
    if (klient.anonymizedAt) throw new BadRequestException('Konto klienta jest zanonimizowane — nie ma adresu.');
    const { temat, tresc } = sprawdzTrescSerwisowa(dto.temat, dto.tresc);
    const zgloszenieId = await zgloszenieKlienta(this.prisma, klient.id, dto.zgloszenie);

    const r = await this.mailer.send(
      mailObslugiTemplate({
        to: klient.email,
        userId: klient.id,
        temat,
        tresc,
        panelUrl: this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl',
        zgloszenieId,
        tag: `obsluga.mail.${s.id}`,
      }),
    );
    await this.audit.record({
      action: SupportActions.OPERATOR_CUSTOMER_MAILED,
      userId: klient.id,
      actorUserId: operatorUserId,
      details: { szablon: s.id, temat, zgloszenieId, emailLogId: r.emailLogId, wynik: r.delivered ? 'wyslany' : (r.suppressedReason ?? 'blad') },
    });
    if (!r.delivered) {
      if (r.suppressedReason) throw new BadRequestException('Mail nie wyszedł — klient nie ma aktywnego adresu.');
      throw new BadGatewayException('Mail nie wyszedł — serwer poczty odrzucił wysyłkę. Spróbuj ponownie za chwilę.');
    }
    return { wyslany: true, emailLogId: r.emailLogId };
  }
}
