import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  DiagnosticArea,
  DiagnosticFindingDto,
  ServiceDiagnosticsDto,
  ServiceHealthCheckKey,
} from '@verris/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { ServiceHealthService } from './service-health.service';

/** Węzeł uznajemy za offline, gdy nie raportował telemetrii ponad 10 minut. */
const NODE_OFFLINE_MS = 10 * 60 * 1000;

const CHECK_AREA: Record<ServiceHealthCheckKey, DiagnosticArea> = {
  dnsOk: 'DNS',
  tlsOk: 'SSL',
  mailOk: 'MAIL',
  backupFresh: 'BACKUP',
  lveOk: 'PERFORMANCE',
  panelTlsOk: 'NODE',
};

/**
 * ADM-2 — autorski silnik diagnostyki usługi dla panelu admin/staff. Składa w
 * jedną listę ustaleń sygnały, które platforma już wylicza (subskrypcja, konto
 * DA, węzeł, health-checki DNS/SSL/poczty/backupu/CPU) wraz z sugerowaną akcją.
 * Bez słowa „AI" — to deterministyczne reguły na realnych danych.
 */
@Injectable()
export class DiagnosticsService {
  private readonly logger = new Logger(DiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly health: ServiceHealthService,
  ) {}

  async forSubscription(subscriptionId: string): Promise<ServiceDiagnosticsDto> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: { account: { include: { server: true } }, plan: true, user: true },
    });
    if (!sub) throw new NotFoundException('Subskrypcja nie istnieje.');

    const findings: DiagnosticFindingDto[] = [];

    // 1) Subskrypcja
    if (sub.status === 'SUSPENDED') {
      findings.push({
        area: 'SUBSCRIPTION',
        status: 'critical',
        title: 'Usługa zawieszona',
        detail: 'Subskrypcja ma status SUSPENDED — usługa nie działa do czasu wznowienia.',
        action: 'Sprawdź powód zawieszenia (płatność/nadużycie) i wznów usługę po jego ustąpieniu.',
      });
    } else if (sub.status === 'PENDING_PAYMENT' || sub.status === 'PAST_DUE') {
      findings.push({
        area: 'BILLING',
        status: 'warn',
        title: 'Oczekiwanie na płatność',
        detail: `Subskrypcja ma status ${sub.status}.`,
        action: 'Zweryfikuj saldo portfela klienta i status ostatniej płatności / odnowienia.',
      });
    }
    if (sub.provisioningStage === 'failed') {
      findings.push({
        area: 'ACCOUNT',
        status: 'critical',
        title: 'Provisioning nie powiódł się',
        detail: sub.provisioningLastError
          ? `Ostatni błąd: ${sub.provisioningLastError}`
          : 'Tworzenie konta na węźle zakończyło się błędem.',
        action: 'Sprawdź kolejkę provisioningu i ponów; zweryfikuj dostępność węzła i pakietu DA.',
      });
    }

    // 2) Konto DA
    if (!sub.account) {
      if (sub.status === 'ACTIVE') {
        findings.push({
          area: 'ACCOUNT',
          status: 'warn',
          title: 'Brak konta hostingowego',
          detail: 'Subskrypcja jest aktywna, ale nie ma powiązanego konta DirectAdmin.',
          action: 'Uruchom provisioning dla tej usługi.',
        });
      }
    } else if (sub.account.status !== 'ACTIVE') {
      findings.push({
        area: 'ACCOUNT',
        status: 'critical',
        title: `Konto DA w stanie ${sub.account.status}`,
        detail: `Konto ${sub.account.daUsername} (${sub.account.domain}) nie jest aktywne na węźle.`,
        action: 'Wznów/odblokuj konto w DirectAdmin lub sprawdź przyczynę dezaktywacji.',
      });
    }

    // 3) Węzeł
    const server = sub.account?.server ?? null;
    if (server) {
      const last = server.lastHeartbeatAt?.getTime() ?? 0;
      const offlineFor = Date.now() - last;
      if (!server.lastHeartbeatAt || offlineFor > NODE_OFFLINE_MS) {
        findings.push({
          area: 'NODE',
          status: 'critical',
          title: 'Węzeł nie raportuje telemetrii',
          detail: server.lastHeartbeatAt
            ? `Ostatni sygnał z ${server.name}: ${server.lastHeartbeatAt.toISOString()}.`
            : `Brak jakiejkolwiek telemetrii z węzła ${server.name}.`,
          action: 'Sprawdź agenta verris-lve i dostępność węzła (SSH/panel). Może być offline.',
        });
      }
      if (server.status && server.status !== 'ACTIVE') {
        findings.push({
          area: 'NODE',
          status: 'warn',
          title: `Węzeł w stanie ${server.status}`,
          detail: `Węzeł ${server.name} nie jest w stanie ACTIVE (np. cordon/maintenance).`,
          action: 'Zweryfikuj, czy węzeł jest celowo wyłączony z ruchu (drain/cordon).',
        });
      }
    }

    // 4) Health-checki (DNS/SSL/poczta/backup/CPU/panel) — świeży przebieg.
    try {
      const health = await this.health.computeAndPersist(subscriptionId);
      const details = health.checkDetails ?? {};
      (Object.keys(CHECK_AREA) as ServiceHealthCheckKey[]).forEach((key) => {
        const d = details[key];
        if (!d || d.status === 'ok') return;
        findings.push({
          area: CHECK_AREA[key],
          status: d.status === 'warn' ? 'warn' : 'critical',
          title: d.label,
          detail: d.explanation,
          action: d.whatToDo ?? null,
        });
      });
    } catch (err) {
      this.logger.warn(
        `diagnostics health compute failed sub=${subscriptionId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      findings.push({
        area: 'NODE',
        status: 'warn',
        title: 'Nie udało się odświeżyć health-checków',
        detail: 'Diagnostyka DNS/SSL/poczty nie wykonała się (węzeł lub DA mogą być niedostępne).',
        action: 'Sprawdź łączność z węzłem i DirectAdmin, potem ponów diagnostykę.',
      });
    }

    const hasCritical = findings.some((f) => f.status === 'critical');
    const hasWarn = findings.some((f) => f.status === 'warn');
    const overall = hasCritical ? 'critical' : hasWarn ? 'attention' : 'ok';
    const summary =
      findings.length === 0
        ? 'Nie wykryto problemów — subskrypcja, konto, węzeł i parametry usługi wyglądają poprawnie.'
        : `${findings.length} ustaleń: ${findings.filter((f) => f.status === 'critical').length} krytycznych, ${
            findings.filter((f) => f.status === 'warn').length
          } ostrzeżeń.`;

    return {
      subscriptionId,
      generatedAt: new Date().toISOString(),
      overall,
      summary,
      findings,
    };
  }
}
