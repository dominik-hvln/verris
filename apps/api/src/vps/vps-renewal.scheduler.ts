import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { Prisma, VpsStatus, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { HetznerClient } from './hetzner.client.js';
import { vpsReadyTemplate, vpsSuspendedTemplate, vpsTerminatedTemplate } from '../mail/templates/vps-notifications.js';
import { ETYKIETA_VPS, oplataZaSnapshoty, politykaSnapshotow, usunSnapshotyVps } from './vps-snapshoty.js';

const GRACE_DAYS = 7;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_MS = 60_000;
/** Po tylu minutach zakładania bez odpowiedzi szukamy serwera u dostawcy… */
const UZGODNIJ_PO_MIN = 10;
/** …a po tylu, jeśli go nie ma, zwracamy pieniądze. */
const ZWROT_PO_MIN = 30;

/**
 * Monthly prepaid VPS billing from the wallet. Daily:
 *  - period ended → debit next month (+ Q-08 snapshots kept in the past period); success extends +30d.
 *  - insufficient funds → power off + SUSPEND (once), e-mail the customer.
 *  - unpaid > GRACE_DAYS → delete the Hetzner server + mark DELETED, e-mail.
 */
@Injectable()
export class VpsRenewalScheduler {
  private readonly logger = new Logger(VpsRenewalScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletLedgerService,
    private readonly hetzner: HetznerClient,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async tick(): Promise<void> {
    const now = Date.now();
    const due = await this.prisma.vpsInstance.findMany({
      where: {
        status: { in: [VpsStatus.RUNNING, VpsStatus.STOPPED] },
        currentPeriodEnd: { lte: new Date(now) },
      },
      include: { user: { select: { email: true, firstName: true } }, plan: { select: { name: true } } },
      take: 200,
    });
    const { cenaZaGb } = await politykaSnapshotow(this.prisma);

    for (const v of due) {
      const overdueMs = now - (v.currentPeriodEnd?.getTime() ?? now);
      let brakSrodkow = false;
      const kluczOdnowienia = `vps-${v.id}-renew-${v.currentPeriodEnd?.toISOString() ?? now}`;
      // Q-08 — snapshoty z dołu za miniony okres, w tym samym obciążeniu (jedna pozycja, jedna idempotencja).
      // Poza try z obciążeniem: błąd dostawcy (także 409 → ConflictException) nie może udawać braku środków.
      let snap: Awaited<ReturnType<typeof oplataZaSnapshoty>>;
      try {
        snap = await oplataZaSnapshoty(this.prisma, this.hetzner, v.id, v.currentPeriodEnd ?? new Date(now), cenaZaGb);
      } catch (err) {
        this.logger.error(`VPS ${v.id}: nie udało się policzyć snapshotów — odnowienie ponowimy: ${(err as Error).message}`);
        continue;
      }
      try {
        await this.wallet.debit({
          userId: v.userId,
          type: WalletTxType.CHARGE_USAGE,
          amount: new Prisma.Decimal(v.priceMonthly).add(snap.kwota),
          description: snap.kwota.gt(0)
            ? `VPS ${v.name} — odnowienie miesięczne + snapshoty (${snap.gb.toString()} GB)`
            : `VPS ${v.name} — odnowienie miesięczne`,
          idempotencyKey: kluczOdnowienia,
        });
      } catch (err) {
        // Tylko brak środków (ConflictException) uruchamia karencję. Wcześniej `catch {}` łapał
        // wszystko — także błąd bazy — i po karencji KASOWAŁ serwer klienta (deleteServer)
        // mimo pieniędzy w portfelu. Inny błąd: log i ponowienie przy następnym przebiegu.
        if (!(err instanceof ConflictException)) {
          this.logger.error(`VPS ${v.id}: odnowienie nie powiodło się (nie brak środków): ${(err as Error).message}`);
          continue;
        }
        brakSrodkow = true;
      }
      try {
        if (!brakSrodkow) {
          // Paid → extend period; auto-resume if it was suspended. Nieudane włączenie zostawia STOPPED (okres opłacony,
          // klient włączy sam) — wcześniej błąd był połykany, a VPS dostawał RUNNING, choć stał wyłączony.
          let status = v.status;
          if (v.status === VpsStatus.STOPPED && v.hetznerServerId) {
            const wlaczony = await this.hetzner.powerOn(v.hetznerServerId).then(
              () => true,
              (err: Error) => {
                this.logger.warn(`VPS ${v.id}: opłacony, ale nie udało się go włączyć: ${err.message}`);
                return false;
              },
            );
            if (wlaczony) status = VpsStatus.RUNNING;
          } else {
            status = VpsStatus.RUNNING;
          }
          // Warunkowo: jeśli w międzyczasie klient usunął VPS, przedłużenie nie może go wskrzesić — wtedy zwrot.
          const { count } = await this.prisma.vpsInstance.updateMany({
            where: {
              id: v.id,
              status: { in: [VpsStatus.RUNNING, VpsStatus.STOPPED] },
              currentPeriodEnd: v.currentPeriodEnd,
            },
            data: {
              currentPeriodEnd: new Date((v.currentPeriodEnd?.getTime() ?? now) + PERIOD_MS),
              status,
            },
          });
          if (count === 0) {
            const teraz = await this.prisma.vpsInstance.findUnique({ where: { id: v.id }, select: { status: true } });
            if (teraz && (teraz.status === VpsStatus.DELETED || teraz.status === VpsStatus.DELETING)) {
              await this.wallet.credit({
                userId: v.userId,
                type: WalletTxType.REFUND,
                amount: new Prisma.Decimal(v.priceMonthly).add(snap.kwota),
                description: `Zwrot: VPS ${v.name} usunięty w trakcie odnowienia`,
                idempotencyKey: `${kluczOdnowienia}:zwrot`,
              });
            }
            // Inaczej okres przedłużył już równoległy przebieg (to samo obciążenie, ten sam klucz) — nic do zrobienia.
            continue;
          }
          await this.audit.record({ action: 'VPS_RENEWED', userId: v.userId, details: { instanceId: v.id } });
        } else {
          // Brak środków — polityka karencji.
          if (overdueMs > GRACE_DAYS * 24 * 60 * 60 * 1000) {
            if (v.hetznerServerId) {
              try {
                await this.hetzner.deleteServer(v.hetznerServerId);
              } catch (err) {
                // 404 = serwera już nie ma. Inny błąd: serwer może dalej działać — nie oznaczamy go jako usuniętego,
                // ponowimy jutro (wcześniej błąd był połykany, a VPS znikał z ewidencji, dalej kosztując).
                if (!(err instanceof NotFoundException)) {
                  this.logger.error(`VPS ${v.id}: usunięcie po karencji nie powiodło się — ponowimy: ${(err as Error).message}`);
                  continue;
                }
              }
            }
            await usunSnapshotyVps(this.prisma, this.hetzner, v.id);
            await this.prisma.vpsInstance.update({
              where: { id: v.id },
              data: { status: VpsStatus.DELETED, deletedAt: new Date() },
            });
            await this.audit.record({
              action: 'VPS_TERMINATED_NONPAYMENT',
              userId: v.userId,
              details: { instanceId: v.id },
            });
            await this.mailer
              .send({
                ...vpsTerminatedTemplate({ to: v.user.email, firstName: v.user.firstName, name: v.name, panelUrl: this.panelUrl() }),
                userId: v.userId,
                category: 'TRANSACTIONAL',
              })
              .catch(() => undefined);
          } else if (v.status === VpsStatus.RUNNING) {
            // Nieudane wyłączenie: zostaje RUNNING i jutro próbujemy znowu. Wcześniej błąd był połykany, a VPS dostawał
            // STOPPED — dalej działał, a kolejne przebiegi już go nie wyłączały.
            if (v.hetznerServerId) await this.hetzner.powerOff(v.hetznerServerId);
            const { count } = await this.prisma.vpsInstance.updateMany({
              where: { id: v.id, status: VpsStatus.RUNNING },
              data: { status: VpsStatus.STOPPED },
            });
            if (count === 0) continue;
            await this.audit.record({
              action: 'VPS_SUSPENDED_NONPAYMENT',
              userId: v.userId,
              details: { instanceId: v.id },
            });
            await this.mailer
              .send({
                ...vpsSuspendedTemplate({ to: v.user.email, firstName: v.user.firstName, name: v.name, panelUrl: this.panelUrl() }),
                userId: v.userId,
                category: 'TRANSACTIONAL',
              })
              .catch(() => undefined);
          }
        }
      } catch (err) {
        // Jeden VPS nie zatrzymuje odnowień pozostałych.
        this.logger.error(`VPS ${v.id}: przetwarzanie odnowienia przerwane: ${(err as Error).message}`);
      }
    }
    if (due.length) this.logger.log(`VPS renewals processed: ${due.length}`);
  }
  /**
   * VPS „w budowie” bez rozstrzygnięcia: wynik zakładania u dostawcy był niepewny (brak odpowiedzi, 5xx) albo proces
   * przerwał się po założeniu serwera. Szukamy serwera po etykiecie nadanej przy zakładaniu:
   * jest → VPS działa; nie ma po ZWROT_PO_MIN minutach → zwrot do portfela i ERROR. Błąd dostawcy = ponowimy.
   */
  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'vps:zakladane' })
  async uzgodnijZakladane(): Promise<void> {
    const now = Date.now();
    const zakladane = await this.prisma.vpsInstance.findMany({
      where: { status: VpsStatus.PROVISIONING, createdAt: { lte: new Date(now - UZGODNIJ_PO_MIN * MIN_MS) } },
      include: { user: { select: { email: true, firstName: true } }, plan: { select: { location: true } } },
      take: 50,
    });
    for (const v of zakladane) {
      try {
        const oplata = await this.wallet.findByIdempotencyKey(`vps-${v.id}-initial`);
        if (!oplata) {
          // Przerwane między wierszem a obciążeniem — zakładanie idzie dopiero po obciążeniu, serwera nie ma.
          await this.prisma.vpsInstance.updateMany({
            where: { id: v.id, status: VpsStatus.PROVISIONING },
            data: { status: VpsStatus.DELETED, deletedAt: new Date(), lastError: 'Zamówienie przerwane przed płatnością.' },
          });
          continue;
        }
        const [serwer] = await this.hetzner.listServersByLabel(`${ETYKIETA_VPS}=${v.id}`);
        if (serwer) {
          const { count } = await this.prisma.vpsInstance.updateMany({
            where: { id: v.id, status: VpsStatus.PROVISIONING },
            data: {
              status: VpsStatus.RUNNING,
              hetznerServerId: String(serwer.id),
              location: serwer.datacenter?.location?.name ?? v.plan.location,
              ipv4: serwer.public_net?.ipv4?.ip ?? null,
              ipv6: serwer.public_net?.ipv6?.ip ?? null,
              lastError: null,
            },
          });
          if (count === 0) continue;
          await this.audit.record({
            action: 'VPS_PROVISIONED',
            userId: v.userId,
            details: { instanceId: v.id, hetznerServerId: String(serwer.id), uzgodniony: true },
          });
          await this.mailer
            .send({
              ...vpsReadyTemplate({ to: v.user.email, firstName: v.user.firstName, name: v.name, ipv4: serwer.public_net?.ipv4?.ip ?? null, panelUrl: this.panelUrl() }),
              userId: v.userId,
              category: 'TRANSACTIONAL',
            })
            .catch(() => undefined);
          continue;
        }
        if (v.createdAt.getTime() > now - ZWROT_PO_MIN * MIN_MS) continue;
        // Zwrot przed zmianą statusu: zwrot jest idempotentny, więc przerwanie w połowie dokończy następny przebieg.
        await this.wallet.credit({
          userId: v.userId,
          type: WalletTxType.REFUND,
          amount: new Prisma.Decimal(oplata.amount).abs(),
          description: `Zwrot: VPS ${v.name} nie powstał`,
          idempotencyKey: `vps-${v.id}-initial-refund`,
        });
        await this.prisma.vpsInstance.updateMany({
          where: { id: v.id, status: VpsStatus.PROVISIONING },
          data: { status: VpsStatus.ERROR, lastError: 'Serwer nie powstał u dostawcy — środki zwrócone do portfela.' },
        });
        await this.audit.record({ action: 'VPS_PROVISION_REFUNDED', userId: v.userId, details: { instanceId: v.id } });
      } catch (err) {
        this.logger.error(`VPS ${v.id}: uzgodnienie zakładania nie powiodło się — ponowimy: ${(err as Error).message}`);
      }
    }
  }
}
