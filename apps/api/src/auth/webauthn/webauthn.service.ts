import { createHash, randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { PrismaService } from '../../prisma/prisma.service';
import { EcoPointsService } from '../../eco/eco-points.service';
import { MailerService } from '../../mail/mailer.service';
import {
  passkeyAddedTemplate,
  passkeyRemovedTemplate,
} from '../../mail/templates/security-notifications';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class WebAuthnService {
  private readonly logger = new Logger(WebAuthnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ecoPoints: EcoPointsService,
    private readonly mailer: MailerService,
  ) {}

  isConfigured(): boolean {
    return Boolean(this.rpID && this.origins.length > 0);
  }

  async registrationOptions(userId: string) {
    this.assertConfigured();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { webauthnCredentials: true },
    });
    if (!user) throw new NotFoundException('User not found');

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userName: user.email,
      userDisplayName:
        [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email,
      userID: this.userIdToBytes(userId) as Uint8Array<ArrayBuffer>,
      attestationType: 'none',
      excludeCredentials: user.webauthnCredentials.map((cred) => ({
        id: cred.credentialId,
        transports: this.parseTransports(cred.transports),
      })),
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'preferred',
      },
    });

    await this.storeRegistrationChallenge(userId, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    deviceName?: string,
  ) {
    this.assertConfigured();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) => this.matchesRegistrationChallenge(user, challenge),
      expectedOrigin: this.origins,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Rejestracja passkey nie powiodła się.');
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credential.id;

    const existingCount = await this.prisma.webAuthnCredential.count({ where: { userId } });

    await this.prisma.$transaction([
      this.prisma.webAuthnCredential.create({
        data: {
          userId,
          credentialId,
          publicKey: isoBase64URL.fromBuffer(registrationInfo.credential.publicKey),
          counter: BigInt(registrationInfo.credential.counter),
          transports: registrationInfo.credential.transports?.join(',') ?? null,
          deviceType: registrationInfo.credentialDeviceType,
          backedUp: registrationInfo.credentialBackedUp,
          name: deviceName?.trim() || null,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { webauthnChallenge: null, webauthnChallengeExpires: null },
      }),
    ]);

    if (existingCount === 0) {
      void this.ecoPoints.safeAward(`passkey:${credentialId}`, async () => {
        await this.ecoPoints.awardPasskeyRegistered(this.prisma, userId, credentialId);
      });
    }

    // SEC-7 — alert bezpieczeństwa o dodaniu passkey (ATO persistence vector).
    void this.notifyPasskeyChange(user, 'added', deviceName?.trim() || null).catch((err) =>
      this.logger.warn(`notifyPasskey(added) failed user=${userId}: ${(err as Error).message}`),
    );

    return { ok: true as const };
  }

  /**
   * Opcje logowania passkey. Bez e-mail → discoverable credentials (passkey z urządzenia).
   * Z e-mailem → zawęża listę (opcjonalnie, kompatybilność wsteczna).
   */
  async authenticationOptions(email?: string) {
    this.assertConfigured();
    const normalized = email?.trim().toLowerCase();
    const user = normalized
      ? await this.prisma.user.findUnique({
          where: { email: normalized },
          include: { webauthnCredentials: true },
        })
      : null;

    const hasKnownCredentials = Boolean(user && user.webauthnCredentials.length > 0);

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      // undefined = discoverable (przeglądarka pokazuje passkeys zapisane dla tej domeny)
      allowCredentials: hasKnownCredentials
        ? user!.webauthnCredentials.map((cred) => ({
            id: cred.credentialId,
            transports: this.parseTransports(cred.transports),
          }))
        : undefined,
    });

    await this.storeLoginChallenge(options.challenge, user?.id ?? null);
    return options;
  }

  async verifyAuthentication(response: AuthenticationResponseJSON): Promise<{ userId: string }> {
    this.assertConfigured();
    const credentialId = response.id;
    const stored = await this.prisma.webAuthnCredential.findUnique({
      where: { credentialId },
      include: { user: true },
    });
    if (!stored) {
      throw new UnauthorizedException('Logowanie passkey nie powiodło się.');
    }

    let matchedChallenge: string | null = null;

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (challenge) => {
        const ok = await this.matchesLoginChallenge(challenge, stored.userId);
        if (ok) matchedChallenge = challenge;
        return ok;
      },
      expectedOrigin: this.origins,
      expectedRPID: this.rpID,
      credential: {
        id: stored.credentialId,
        publicKey: isoBase64URL.toBuffer(stored.publicKey),
        counter: Number(stored.counter),
        transports: this.parseTransports(stored.transports),
      },
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new UnauthorizedException('Logowanie passkey nie powiodło się.');
    }

    await this.prisma.$transaction([
      this.prisma.webAuthnCredential.update({
        where: { id: stored.id },
        data: {
          counter: BigInt(verification.authenticationInfo.newCounter),
          lastUsedAt: new Date(),
        },
      }),
      ...(matchedChallenge
        ? [
            this.prisma.webAuthnLoginChallenge.deleteMany({
              where: { challenge: matchedChallenge },
            }),
          ]
        : []),
    ]);

    void this.prisma.webAuthnLoginChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);

    return { userId: stored.userId };
  }

  async listCredentials(userId: string) {
    const rows = await this.prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      deviceType: row.deviceType,
      backedUp: row.backedUp,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async deleteCredential(userId: string, id: string) {
    const row = await this.prisma.webAuthnCredential.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Passkey not found');
    await this.prisma.webAuthnCredential.delete({ where: { id } });

    // SEC-7 — alert bezpieczeństwa o usunięciu passkey.
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, firstName: true },
    });
    if (user) {
      void this.notifyPasskeyChange(user, 'removed', row.name ?? null).catch((err) =>
        this.logger.warn(`notifyPasskey(removed) failed user=${userId}: ${(err as Error).message}`),
      );
    }
    return { ok: true as const };
  }

  private async notifyPasskeyChange(
    user: { email: string; firstName: string | null },
    kind: 'added' | 'removed',
    deviceName: string | null,
  ): Promise<void> {
    const panelUrl =
      this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const ctx = { to: user.email, firstName: user.firstName, at: new Date(), deviceName, panelUrl };
    const message =
      kind === 'added' ? passkeyAddedTemplate(ctx) : passkeyRemovedTemplate(ctx);
    await this.mailer.send({ ...message, category: 'TRANSACTIONAL', fromRole: 'SECURITY' });
  }

  private get rpID(): string {
    return (this.config.get<string>('WEBAUTHN_RP_ID') ?? '').trim();
  }

  private get rpName(): string {
    return (this.config.get<string>('WEBAUTHN_RP_NAME') ?? 'Verris').trim() || 'Verris';
  }

  private get origins(): string[] {
    const raw = (this.config.get<string>('WEBAUTHN_ORIGINS') ?? '').trim();
    if (!raw) return [];
    return raw
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new BadRequestException('Passkeys nie są skonfigurowane na tym środowisku.');
    }
  }

  private userIdToBytes(userId: string): Uint8Array {
    return new Uint8Array(createHash('sha256').update(userId).digest());
  }

  private parseTransports(
    raw: string | null | undefined,
  ): AuthenticatorTransportFuture[] | undefined {
    if (!raw) return undefined;
    const values = raw.split(',').map((item) => item.trim()).filter(Boolean);
    return values.length ? (values as AuthenticatorTransportFuture[]) : undefined;
  }

  private async storeRegistrationChallenge(userId: string, challenge: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        webauthnChallenge: challenge,
        webauthnChallengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
  }

  private matchesRegistrationChallenge(
    user: { webauthnChallenge: string | null; webauthnChallengeExpires: Date | null },
    challenge: string,
  ): boolean {
    if (!user.webauthnChallenge || !user.webauthnChallengeExpires) return false;
    if (user.webauthnChallengeExpires.getTime() < Date.now()) return false;
    return user.webauthnChallenge === challenge;
  }

  private async storeLoginChallenge(challenge: string, userId: string | null): Promise<void> {
    await this.prisma.webAuthnLoginChallenge.create({
      data: {
        id: randomUUID(),
        challenge,
        userId,
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
    void this.prisma.webAuthnLoginChallenge
      .deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .catch(() => undefined);
  }

  private async matchesLoginChallenge(challenge: string, userId: string): Promise<boolean> {
    const row = await this.prisma.webAuthnLoginChallenge.findUnique({
      where: { challenge },
    });
    if (!row || row.expiresAt.getTime() < Date.now()) return false;
    if (row.userId && row.userId !== userId) return false;
    return true;
  }
}
