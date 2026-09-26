import { BadRequestException, Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import * as dns from 'dns';
import { createHmac, timingSafeEqual } from 'crypto';
import * as tls from 'tls';
import { PrismaService } from '../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import { DomainChecklistStatus, DomainStatus } from '@verris/database';
import { CreateDomainDto } from './dto/create-domain.dto.js';

/** A-16 — rekord wyzwania: TXT pod `_verris-challenge.<domena>`. */
export const VERIFY_RECORD_PREFIX = '_verris-challenge';
/** Niezweryfikowana domena blokuje nazwę dla innych najwyżej tyle dni (anty-squatting). */
export const UNVERIFIED_CLAIM_DAYS = 7;

@Injectable()
export class DomainsService {
  private readonly logger = new Logger(DomainsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async create(userId: string, createDomainDto: CreateDomainDto) {
    const existing = await this.prisma.domain.findUnique({
      where: { name: createDomainDto.name },
    });

    if (existing) {
      // A-16 — cudza, niezweryfikowana i przeterminowana rezerwacja nie blokuje prawdziwego właściciela.
      const staleClaim =
        existing.userId !== userId &&
        existing.status === DomainStatus.PENDING &&
        !existing.registrarProvider &&
        existing.createdAt.getTime() < Date.now() - UNVERIFIED_CLAIM_DAYS * 86400000;
      if (!staleClaim) throw new ConflictException('Domena jest już zarejestrowana w systemie');
      await this.prisma.domain.delete({ where: { id: existing.id } });
      this.logger.log(`released stale unverified claim for ${existing.name}`);
    }

    return this.prisma.domain.create({
      data: {
        name: createDomainDto.name,
        userId,
        status: DomainStatus.PENDING,
      },
    });
  }

  async findAllByUser(userId: string) {
    // Registered/added domains (the `Domain` table) PLUS the primary domains of
    // hosting accounts (`Account.domain`), which otherwise wouldn't appear in the
    // "Domeny" tile because provisioning stores them only on the account.
    const [registered, accounts] = await Promise.all([
      this.prisma.domain.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.account.findMany({
        where: { userId },
        select: {
          id: true,
          domain: true,
          status: true,
          createdAt: true,
          subscriptionId: true,
        },
      }),
    ]);

    const known = new Set(registered.map((d) => d.name.toLowerCase()));
    const hostingDomains = accounts
      .filter((a) => a.domain && !known.has(a.domain.toLowerCase()))
      .map((a) => ({
        id: `hosting:${a.id}`,
        name: a.domain,
        status: a.status === 'ACTIVE' ? DomainStatus.ACTIVE : DomainStatus.PENDING,
        createdAt: a.createdAt,
        updatedAt: a.createdAt,
        // Marks a domain managed via a hosting account (not independently deletable).
        kind: 'HOSTING' as const,
        serviceId: a.subscriptionId,
      }));

    const registeredOut = registered.map((d) => ({
      ...d,
      kind: 'REGISTERED' as const,
      serviceId: null as string | null,
    }));

    return [...registeredOut, ...hostingDomains];
  }

  async findOne(id: string, userId: string) {
    const domain = await this.prisma.domain.findFirst({
      where: { id, userId },
    });

    if (!domain) {
      throw new NotFoundException(`Domena nie została znaleziona.`);
    }

    return domain;
  }

  /**
   * A-16 — wartość TXT liczona z id domeny i właściciela (HMAC), więc nie trzeba jej
   * przechowywać. ponytail: rotacja JWT_SECRET zmienia wartość dla niezweryfikowanych domen
   * (klient wklei nową); osobny sekret, jeśli rotacje staną się częste.
   */
  verificationRecord(domain: { id: string; name: string; userId: string }) {
    const secret = this.configService.get<string>('jwtSecret') ?? process.env.JWT_SECRET ?? '';
    const mac = createHmac('sha256', secret).update(`domain-verify:${domain.id}:${domain.userId}`).digest('hex').slice(0, 40);
    return { recordName: `${VERIFY_RECORD_PREFIX}.${domain.name}`, recordValue: `verris-verify=${mac}` };
  }

  /** Szczegóły domeny dla właściciela: niezweryfikowana dostaje instrukcję rekordu TXT. */
  async findOneForOwner(id: string, userId: string) {
    const domain = await this.findOne(id, userId);
    return {
      ...domain,
      verification: domain.status === DomainStatus.PENDING ? this.verificationRecord(domain) : null,
    };
  }

  /**
   * A-16 — domena staje się ACTIVE dopiero, gdy właściciel opublikuje nasz rekord TXT.
   * Wcześniej wystarczał poprawny A/NS/TLS, czyli dowolna cudza, działająca domena.
   */
  async verifyDomain(id: string, userId: string) {
    const domain = await this.findOne(id, userId);
    if (domain.status === DomainStatus.ACTIVE) return domain;

    const { recordName, recordValue } = this.verificationRecord(domain);
    const txt = await resolveList(() => dns.promises.resolveTxt(recordName));
    const found = txt.map((chunks) => chunks.join('').trim()).some((v) => sameString(v, recordValue));
    if (!found) {
      throw new BadRequestException(
        `Nie widzimy jeszcze rekordu TXT ${recordName} o wartości ${recordValue}. ` +
          'Dodaj go u operatora DNS domeny; propagacja trwa zwykle kilka minut, czasem do kilku godzin.',
      );
    }
    this.logger.log(`domain ${domain.name} verified by TXT for user ${userId}`);
    return this.prisma.domain.update({
      where: { id: domain.id },
      data: { status: DomainStatus.ACTIVE },
    });
  }

  async runChecklist(id: string, userId: string) {
    const domain = await this.findOne(id, userId);
    const [aRecords, aaaaRecords, nsRecords, mxRecords, tlsResult] = await Promise.all([
      resolveList(() => dns.promises.resolve4(domain.name)),
      resolveList(() => dns.promises.resolve6(domain.name)),
      resolveList(() => dns.promises.resolveNs(domain.name)),
      resolveList(() => dns.promises.resolveMx(domain.name)),
      probeTls(domain.name),
    ]);

    const issues: string[] = [];
    if (aRecords.length === 0 && aaaaRecords.length === 0) {
      issues.push('Brak rekordu A/AAAA dla domeny głównej.');
    }
    if (nsRecords.length === 0) {
      issues.push('Nie udało się odczytać rekordów NS.');
    }
    if (!tlsResult.ok) {
      issues.push(tlsResult.error ?? 'Certyfikat TLS nie jest jeszcze gotowy.');
    }

    const status =
      issues.length === 0
        ? DomainChecklistStatus.OK
        : aRecords.length > 0 || aaaaRecords.length > 0
          ? DomainChecklistStatus.WARNING
          : DomainChecklistStatus.FAILED;

    return this.prisma.domainChecklist.create({
      data: {
        domainId: domain.id,
        hostname: domain.name,
        status,
        requiredRecords: {
          root: ['A or AAAA'],
          optional: ['MX for mail', 'valid TLS certificate'],
        },
        observedRecords: {
          a: aRecords,
          aaaa: aaaaRecords,
          ns: nsRecords,
          mx: mxRecords.map((mx) => `${mx.priority} ${mx.exchange}`),
          tls: tlsResult,
        },
        issues,
        checkedAt: new Date(),
      },
    });
  }

  async listChecklists(id: string, userId: string) {
    const domain = await this.findOne(id, userId);
    return this.prisma.domainChecklist.findMany({
      where: { domainId: domain.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  async remove(id: string, userId: string) {
    const domain = await this.findOne(id, userId);

    return this.prisma.domain.delete({
      where: { id: domain.id },
    });
  }
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function resolveList<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function probeTls(hostname: string): Promise<{ ok: boolean; error: string | null; validTo: string | null }> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      {
        host: hostname,
        port: 443,
        servername: hostname,
        rejectUnauthorized: false,
        timeout: 5000,
      },
      () => {
        const cert = socket.getPeerCertificate();
        const authError = socket.authorizationError;
        socket.end();
        resolve({
          ok: socket.authorized,
          error: authError ? String(authError) : null,
          validTo: cert && typeof cert.valid_to === 'string' ? new Date(cert.valid_to).toISOString() : null,
        });
      },
    );
    socket.on('timeout', () => {
      socket.destroy();
      resolve({ ok: false, error: 'Timeout połączenia TLS :443.', validTo: null });
    });
    socket.on('error', (err) => {
      resolve({ ok: false, error: err.message, validTo: null });
    });
  });
}

