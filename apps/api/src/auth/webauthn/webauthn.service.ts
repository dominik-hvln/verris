import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
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

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class WebAuthnService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await this.storeChallenge(userId, options.challenge);
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
      expectedChallenge: (challenge) => this.matchesStoredChallenge(user, challenge),
      expectedOrigin: this.origins,
      expectedRPID: this.rpID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('Rejestracja passkey nie powiodła się.');
    }

    const { registrationInfo } = verification;
    const credentialId = registrationInfo.credential.id;

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

    return { ok: true as const };
  }

  async authenticationOptions(email: string) {
    this.assertConfigured();
    const normalized = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { webauthnCredentials: true },
    });

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      userVerification: 'preferred',
      allowCredentials:
        user?.webauthnCredentials.map((cred) => ({
          id: cred.credentialId,
          transports: this.parseTransports(cred.transports),
        })) ?? [],
    });

    if (user && user.webauthnCredentials.length > 0) {
      await this.storeChallenge(user.id, options.challenge);
    }

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

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) =>
        this.matchesStoredChallenge(stored.user, challenge),
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
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { webauthnChallenge: null, webauthnChallengeExpires: null },
      }),
    ]);

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
    return { ok: true as const };
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

  private async storeChallenge(userId: string, challenge: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        webauthnChallenge: challenge,
        webauthnChallengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });
  }

  private matchesStoredChallenge(
    user: { webauthnChallenge: string | null; webauthnChallengeExpires: Date | null },
    challenge: string,
  ): boolean {
    if (!user.webauthnChallenge || !user.webauthnChallengeExpires) return false;
    if (user.webauthnChallengeExpires.getTime() < Date.now()) return false;
    return user.webauthnChallenge === challenge;
  }
}
