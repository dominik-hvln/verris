import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/**
 * C-21 / C-22 — SSH w klatce CloudLinux CageFS i klucze SSH konta hostingowego.
 * Zmiany robi węzeł (zadanie SSH_ACCESS, `ops/scripts/node-ssh-access.sh`): bez CageFS powłoka
 * nie zostaje włączona; klucze trafiają do bloku Verris w ~/.ssh/authorized_keys (zapis jako klient).
 * Stan „włączony” czytamy z DirectAdmina (ssh w konfiguracji konta), listę kluczy — z ostatniego
 * zakończonego zadania (klucze publiczne nie są tajne).
 */
const TYPY = '(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp256|ecdsa-sha2-nistp384|ecdsa-sha2-nistp521|sk-ssh-ed25519@openssh\\.com|sk-ecdsa-sha2-nistp256@openssh\\.com)';
// Bez opcji na początku (command=, from=…): klucz z panelu to zwykłe logowanie, nic więcej.
const KLUCZ_RE = new RegExp(`^${TYPY} [A-Za-z0-9+/=]{16,}( [^\\u0000-\\u001f\\u007f]{0,200})?$`);
const MAKS_KLUCZY = 20;

@Injectable()
export class SshAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(sub.account.id);
  }

  async przelacz(subscriptionId: string, userId: string, wlacz: boolean) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const task = await this.zlec(sub.account, userId, { mode: wlacz ? 'enable' : 'disable' });
    await this.audit.record({
      action: wlacz ? HostingResourceActions.HOSTING_SSH_ENABLE_QUEUED : HostingResourceActions.HOSTING_SSH_DISABLE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, taskId: task.id },
    });
    return this.opis(sub.account.id);
  }

  async ustawKlucze(subscriptionId: string, userId: string, klucze: string[]) {
    const sub = await this.wymagajKonta(subscriptionId, userId);
    const lista = sprawdzKlucze(klucze);
    const task = await this.zlec(sub.account, userId, {
      mode: 'keys',
      keys: lista,
      keysB64: Buffer.from(lista.join('\n'), 'utf8').toString('base64'),
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_SSH_KEYS_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, taskId: task.id, liczba: lista.length },
    });
    return this.opis(sub.account.id);
  }

  private async zlec(
    account: { id: string; serverId: string; status: string; daUsername: string | null },
    actorUserId: string,
    payload: Record<string, unknown>,
  ) {
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.SSH_ACCESS, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Zmiana dostępu SSH jest już w toku — poczekaj na wynik.');
    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.SSH_ACCESS,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: { ...payload, daUser: account.daUsername },
      },
    });
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.SSH_ACCESS },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const p = (z: (typeof zadania)[number]) => (z.payload ?? {}) as { mode?: string; keys?: string[] };
    const ostatnieKlucze = zadania.find((z) => p(z).mode === 'keys' && z.status === NodeTaskStatus.COMPLETED);
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      klucze: ostatnieKlucze ? (p(ostatnieKlucze).keys ?? []) : [],
      ostatnie: ostatnie
        ? {
            tryb: p(ostatnie).mode ?? null,
            status: ostatnie.status,
            utworzone: ostatnie.createdAt.toISOString(),
            blad: ostatnie.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
          }
        : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { ...sub, account: sub.account };
  }
}

/** Klucze publiczne OpenSSH, bez opcji i duplikatów, najwyżej 20. */
export function sprawdzKlucze(klucze: string[]): string[] {
  const lista = [...new Set((klucze ?? []).map((k) => String(k).trim().replace(/[ \t]+/g, ' ')).filter(Boolean))];
  if (lista.length > MAKS_KLUCZY) throw new BadRequestException(`Najwyżej ${MAKS_KLUCZY} kluczy.`);
  lista.forEach((k, i) => {
    if (!KLUCZ_RE.test(k)) {
      throw new BadRequestException(`Klucz ${i + 1}: wklej klucz publiczny (np. ssh-ed25519 AAAA… opis), bez opcji na początku.`);
    }
  });
  return lista;
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[ssh-access] BŁĄD: '));
  return l ? l.slice('[ssh-access] BŁĄD: '.length).slice(0, 300) : 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}
