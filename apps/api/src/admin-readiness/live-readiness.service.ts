import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { LegalDocumentsService } from '../compliance/legal-documents.service';

export type ReadinessStatus = 'ok' | 'warn' | 'fail';

export interface ReadinessCheck {
  key: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** When true, a 'fail' here is a hard go-live blocker. */
  blocking: boolean;
}

export interface ReadinessReport {
  generatedAt: string;
  /** GO only when there are no blocking failures. */
  go: boolean;
  counts: { ok: number; warn: number; fail: number };
  checks: ReadinessCheck[];
}

/**
 * Aggregated go/no-go readiness for a 100% LIVE start. Inspects critical config
 * (secrets, payments, mail), platform data (seller/NIP, nameservers, webmail),
 * fleet (≥1 ACTIVE node) and legal (published TERMS+PRIVACY). Read-only.
 */
@Injectable()
export class LiveReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly settings: PlatformSettingsService,
    private readonly legal: LegalDocumentsService,
  ) {}

  async report(): Promise<ReadinessReport> {
    const checks: ReadinessCheck[] = [];
    const add = (
      key: string,
      label: string,
      status: ReadinessStatus,
      detail: string,
      blocking = true,
    ) => checks.push({ key, label, status, detail, blocking });

    // --- secrets / core config (blocking) ---
    const kms = this.config.get<string>('appKmsKey') ?? process.env.APP_KMS_KEY ?? '';
    add(
      'kms',
      'Klucz szyfrowania (APP_KMS_KEY)',
      kms.length >= 32 ? 'ok' : 'fail',
      kms.length >= 32 ? 'Ustawiony (≥32 znaki).' : 'Brak lub za krótki — sekrety at-rest niezabezpieczone.',
    );
    const jwt = this.config.get<string>('jwtSecret') ?? process.env.JWT_SECRET ?? '';
    add(
      'jwt',
      'Sekret JWT',
      jwt.length >= 16 ? 'ok' : 'fail',
      jwt.length >= 16 ? 'Ustawiony.' : 'Brak — logowanie niebezpieczne.',
    );

    // --- payments (blocking) ---
    const stripeKey = this.config.get<string>('stripeSecretKey') ?? process.env.STRIPE_SECRET_KEY ?? '';
    const stripeHook =
      this.config.get<string>('stripeWebhookSecret') ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const stripeLive = stripeKey.startsWith('sk_live_');
    add(
      'stripe_key',
      'Stripe — klucz API',
      stripeKey ? (stripeLive ? 'ok' : 'warn') : 'fail',
      stripeKey
        ? stripeLive
          ? 'Klucz produkcyjny (sk_live_).'
          : 'Ustawiony, ale to klucz testowy (sk_test_) — przełącz na produkcyjny przed LIVE.'
        : 'Brak STRIPE_SECRET_KEY — płatności kartą nie działają.',
    );
    add(
      'stripe_webhook',
      'Stripe — sekret webhooka',
      stripeHook ? 'ok' : 'fail',
      stripeHook
        ? 'Ustawiony (weryfikacja podpisu zdarzeń).'
        : 'Brak STRIPE_WEBHOOK_SECRET — aktywacje/odnowienia ze Stripe nie będą potwierdzane.',
    );

    // --- transactional mail (blocking: users can't verify e-mail otherwise) ---
    const smtpHost = process.env.SMTP_HOST ?? '';
    add(
      'smtp',
      'Poczta transakcyjna (SMTP)',
      smtpHost ? 'ok' : 'fail',
      smtpHost
        ? `Skonfigurowana (${smtpHost}). Upewnij się, że SPF/DKIM/DMARC dla domeny nadawczej są ustawione.`
        : 'Brak SMTP_HOST — maile weryfikacyjne/resetu nie wyjdą (blokuje onboarding).',
    );

    // --- seller data for invoices (blocking for legal invoicing) ---
    const company = await this.settings.getSellerCompany();
    const companyOk = Boolean(company.name && company.nip && company.address && company.city);
    add(
      'company',
      'Dane sprzedawcy (faktury)',
      companyOk ? 'ok' : 'fail',
      companyOk
        ? `${company.name}, NIP ${company.nip}.`
        : 'Uzupełnij dane firmy (nazwa, NIP, adres) — wymagane na fakturach.',
    );

    // --- fleet: at least one ACTIVE node (blocking) ---
    const activeNodes = await this.prisma.server.count({ where: { status: ServerStatus.ACTIVE } });
    add(
      'nodes',
      'Węzły hostingowe (ACTIVE)',
      activeNodes > 0 ? 'ok' : 'fail',
      activeNodes > 0
        ? `${activeNodes} aktywny(ch) węzeł/ów.`
        : 'Brak aktywnych węzłów — nie ma gdzie stawiać kont.',
    );

    // --- legal: published TERMS + PRIVACY (blocking — registration needs them) ---
    const legalMap = await this.legal.getCurrentMap('pl');
    const legalOk = Boolean(legalMap.TERMS && legalMap.PRIVACY);
    add(
      'legal',
      'Dokumenty prawne (Regulamin + Polityka)',
      legalOk ? 'ok' : 'fail',
      legalOk
        ? 'Opublikowane aktualne wersje TERMS i PRIVACY.'
        : 'Brak opublikowanego Regulaminu lub Polityki prywatności — rejestracja będzie blokowana.',
    );

    // --- nameservers (blocking for hosting DNS) ---
    const ns = await this.settings.getHostingNameservers();
    add(
      'nameservers',
      'Nameservery platformy',
      ns.ns1 && ns.ns2 ? 'ok' : 'fail',
      ns.ns1 && ns.ns2 ? `${ns.ns1}, ${ns.ns2}` : 'Ustaw co najmniej ns1 i ns2 (HOSTING_NS*).',
    );

    // --- non-blocking warnings ---
    const ksef = await this.settings.getKsefSettings();
    add(
      'ksef',
      'KSeF (e-faktury)',
      ksef.enabled ? 'ok' : 'warn',
      ksef.enabled ? `Włączony (${ksef.env}).` : 'Wyłączony — włącz po smoke na środowisku testowym.',
      false,
    );
    const webmail = (await this.settings.getClientConfig()).webmailUrl;
    add(
      'webmail',
      'Webmail (Roundcube)',
      webmail ? 'ok' : 'warn',
      webmail ? webmail : 'Brak WEBMAIL_URL — produkt e-mail bez dostępu do webmaila.',
      false,
    );
    const op = Boolean(process.env.OPENPROVIDER_USERNAME && process.env.OPENPROVIDER_PASSWORD);
    add(
      'registrar',
      'Rejestrator domen (OpenProvider)',
      op ? 'ok' : 'warn',
      op ? 'Skonfigurowany.' : 'Brak danych OpenProvider — rejestracja domen w checkoucie nieczynna.',
      false,
    );
    const backupNodes = await this.prisma.server.count({
      where: { status: ServerStatus.ACTIVE, lastOffsiteBackupOk: true },
    });
    add(
      'offsite_backup',
      'Backupy off-node',
      activeNodes === 0 ? 'warn' : backupNodes >= activeNodes ? 'ok' : 'warn',
      activeNodes === 0
        ? 'Brak węzłów do oceny.'
        : `${backupNodes}/${activeNodes} węzłów z udanym backupem offsite.`,
      false,
    );

    const webauthnOk = Boolean(
      (process.env.WEBAUTHN_RP_ID ?? '').trim() && (process.env.WEBAUTHN_ORIGINS ?? '').trim(),
    );
    add(
      'webauthn',
      'Passkey (WebAuthn RP)',
      webauthnOk ? 'ok' : 'warn',
      webauthnOk
        ? 'Skonfigurowane (RP ID + origins).'
        : 'Brak WEBAUTHN_RP_ID / WEBAUTHN_ORIGINS — logowanie passkey nie zadziała (przycisk ukryty).',
      false,
    );

    const hetzner = Boolean(process.env.HETZNER_API_TOKEN);
    add(
      'vps',
      'VPS/Cloud (Hetzner)',
      hetzner ? 'ok' : 'warn',
      hetzner ? 'Token Hetzner ustawiony — sprzedaż VPS aktywna.' : 'Brak HETZNER_API_TOKEN — sprzedaż VPS nieczynna.',
      false,
    );

    const counts = {
      ok: checks.filter((c) => c.status === 'ok').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
    };
    const go = !checks.some((c) => c.blocking && c.status === 'fail');

    return { generatedAt: new Date().toISOString(), go, counts, checks };
  }
}
