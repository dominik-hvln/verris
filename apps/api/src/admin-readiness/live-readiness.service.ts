import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServerStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service.js';
import { LegalDocumentsService } from '../compliance/legal-documents.service.js';
import { ocenProby, type ProbaOdtworzenia } from './proba-odtworzenia.js';
import type { CertyfikatKsefDto, KsefSettingsDto } from '../platform-settings/platform-settings.service.js';

/**
 * KSeF 07.11 — ocena poświadczeń KSeF do go/no-go. Bez sekretów: tylko metoda i daty certyfikatów.
 * Certyfikat do uwierzytelnienia wygasły = automat nie zaloguje się do KSeF; brak certyfikatu Offline =
 * faktury wystawione w trybie offline bez KODU II (kody-qr.md). Tokeny KSeF mają przestać działać przed
 * startem sprzedaży (11.01.2027) — przy metodzie „token” ostrzegamy.
 */
export function ocenPoswiadczenKsef(
  ksef: Pick<KsefSettingsDto, 'enabled' | 'metoda' | 'tokenSet' | 'certyfikatUwierzytelniania' | 'certyfikatOffline'>,
): Array<{ key: string; label: string; status: ReadinessStatus; detail: string }> {
  if (!ksef.enabled) return [];
  const ocenCert = (c: CertyfikatKsefDto | null, brak: string): { status: ReadinessStatus; detail: string } => {
    if (!c) return { status: 'fail', detail: brak };
    if (c.dniDoWygasniecia < 0) return { status: 'fail', detail: `Certyfikat ${c.numerSeryjny} wygasł ${c.waznyDo.slice(0, 10)} – wgraj nowy.` };
    if (c.dniDoWygasniecia < 30) return { status: 'warn', detail: `Certyfikat ${c.numerSeryjny} wygasa ${c.waznyDo.slice(0, 10)} (za ${c.dniDoWygasniecia} dni).` };
    return { status: 'ok', detail: `Certyfikat ${c.numerSeryjny} ważny do ${c.waznyDo.slice(0, 10)}.` };
  };
  const wynik: Array<{ key: string; label: string; status: ReadinessStatus; detail: string }> = [];
  if (ksef.metoda === 'certyfikat') {
    wynik.push({ key: 'ksef_uwierzytelnienie', label: 'KSeF – certyfikat do uwierzytelnienia', ...ocenCert(ksef.certyfikatUwierzytelniania, 'Brak certyfikatu KSeF (Authentication) – automat nie zaloguje się do KSeF.') });
  } else {
    wynik.push({
      key: 'ksef_uwierzytelnienie',
      label: 'KSeF – uwierzytelnienie',
      status: 'warn',
      detail: ksef.tokenSet
        ? 'Logowanie tokenem KSeF – tokeny mają przestać działać przed startem sprzedaży; wgraj certyfikat KSeF i przełącz metodę na „certyfikat”.'
        : 'Brak tokenu i certyfikatu – wgraj certyfikat KSeF (Authentication).',
    });
  }
  wynik.push({ key: 'ksef_offline', label: 'KSeF – certyfikat Offline (KOD II)', ...ocenCert(ksef.certyfikatOffline, 'Brak certyfikatu KSeF typu Offline – faktury wystawione w trybie offline nie będą miały KODU II.') });
  return wynik;
}

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
      kms.length >= 32 ? 'Ustawiony (≥32 znaki).' : 'Brak lub za krótki – sekrety at-rest niezabezpieczone.',
    );
    const jwt = this.config.get<string>('jwtSecret') ?? process.env.JWT_SECRET ?? '';
    add(
      'jwt',
      'Sekret JWT',
      jwt.length >= 16 ? 'ok' : 'fail',
      jwt.length >= 16 ? 'Ustawiony.' : 'Brak – logowanie niebezpieczne.',
    );

    // --- payments (blocking) ---
    const stripeKey = this.config.get<string>('stripeSecretKey') ?? process.env.STRIPE_SECRET_KEY ?? '';
    const stripeHook =
      this.config.get<string>('stripeWebhookSecret') ?? process.env.STRIPE_WEBHOOK_SECRET ?? '';
    const stripeLive = stripeKey.startsWith('sk_live_');
    add(
      'stripe_key',
      'Stripe – klucz API',
      stripeKey ? (stripeLive ? 'ok' : 'warn') : 'fail',
      stripeKey
        ? stripeLive
          ? 'Klucz produkcyjny (sk_live_).'
          : 'Ustawiony, ale to klucz testowy (sk_test_) – przełącz na produkcyjny przed LIVE.'
        : 'Brak STRIPE_SECRET_KEY – płatności kartą nie działają.',
    );
    add(
      'stripe_webhook',
      'Stripe – sekret webhooka',
      stripeHook ? 'ok' : 'fail',
      stripeHook
        ? 'Ustawiony (weryfikacja podpisu zdarzeń).'
        : 'Brak STRIPE_WEBHOOK_SECRET – aktywacje/odnowienia ze Stripe nie będą potwierdzane.',
    );

    // --- transactional mail (blocking: users can't verify e-mail otherwise) ---
    const smtpHost = process.env.SMTP_HOST ?? '';
    add(
      'smtp',
      'Poczta transakcyjna (SMTP)',
      smtpHost ? 'ok' : 'fail',
      smtpHost
        ? `Skonfigurowana (${smtpHost}). Upewnij się, że SPF/DKIM/DMARC dla domeny nadawczej są ustawione.`
        : 'Brak SMTP_HOST – maile weryfikacyjne/resetu nie wyjdą (blokuje onboarding).',
    );

    // --- N-16: regulamin §15 ust. 3 obiecuje rekompensaty automatyczne ---
    const sla = await this.settings.getSlaCreditPolicy();
    add(
      'sla_credits',
      'Rekompensaty SLA (automatyczne)',
      sla.enabled ? 'ok' : 'fail',
      sla.enabled
        ? 'Włączone – naliczane po zamknięciu miesiąca według progów z §15.'
        : 'Wyłączone, a regulamin §15 ust. 3 obiecuje rekompensatę bez wniosku. Sprawdź podgląd (Ustawienia platformy → Podgląd kredytów SLA) i włącz.',
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
        : 'Uzupełnij dane firmy (nazwa, NIP, adres) – wymagane na fakturach.',
    );

    // --- fleet: at least one ACTIVE node (blocking) ---
    const activeNodes = await this.prisma.server.count({ where: { status: ServerStatus.ACTIVE } });
    add(
      'nodes',
      'Węzły hostingowe (ACTIVE)',
      activeNodes > 0 ? 'ok' : 'fail',
      activeNodes > 0
        ? `${activeNodes} aktywny(ch) węzeł/ów.`
        : 'Brak aktywnych węzłów – nie ma gdzie stawiać kont.',
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
        : 'Brak opublikowanego Regulaminu lub Polityki prywatności – rejestracja będzie blokowana.',
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
      ksef.enabled ? (ksef.env === 'prod' ? 'ok' : 'warn') : 'warn',
      ksef.enabled
        ? ksef.env === 'prod'
          ? 'Włączony (prod).'
          : `Włączony na środowisku ${ksef.env} – przed sprzedażą przełącz na produkcyjne.`
        : 'Wyłączony – włącz po smoke na środowisku testowym.',
      false,
    );
    // KSeF 07.11 — poświadczenia: metoda, ważność certyfikatów (uwierzytelnienie i Offline dla KODU II).
    for (const ocena of ocenPoswiadczenKsef(ksef)) add(ocena.key, ocena.label, ocena.status, ocena.detail, false);
    const webmail = (await this.settings.getClientConfig()).webmailUrl;
    add(
      'webmail',
      'Webmail (Roundcube)',
      webmail ? 'ok' : 'warn',
      webmail ? webmail : 'Brak WEBMAIL_URL – produkt e-mail bez dostępu do webmaila.',
      false,
    );
    const op = Boolean(process.env.OPENPROVIDER_USERNAME && process.env.OPENPROVIDER_PASSWORD);
    add(
      'registrar',
      'Rejestrator domen (OpenProvider)',
      op ? 'ok' : 'warn',
      op ? 'Skonfigurowany.' : 'Brak danych OpenProvider – rejestracja domen w checkoucie nieczynna.',
      false,
    );
    const backupNodes = await this.prisma.server.count({
      where: { status: ServerStatus.ACTIVE, lastOffsiteBackupOk: true },
    });
    add(
      'offsite_backup',
      'Backupy off-node',
      activeNodes === 0 ? 'warn' : backupNodes >= activeNodes ? 'ok' : 'fail',
      activeNodes === 0
        ? 'Brak węzłów do oceny.'
        : `${backupNodes}/${activeNodes} węzłów z udanym backupem offsite.`,
      // H-19: węzeł z klientami bez kopii poza serwerem blokuje start (było: tylko ostrzeżenie).
      activeNodes > 0,
    );

    // --- H-20 — próba odtworzenia z kopii (BLOKUJĄCA) ---
    //
    // Blokująca, nie ostrzegawcza. Ostrzeżenie zamiast bramki to ten sam
    // mechanizm, który macierz wytknęła przy H-19 i który naprawiałem w X-23
    // przy jobie bezpieczeństwa: alarm, który nie zatrzymuje, przestaje być
    // czytany. Backup bez potwierdzonego odtworzenia to założenie, nie
    // zabezpieczenie — a założenie nie może przepuścić startu sprzedaży.
    const [ostatniaProba, ostatniaUdanaProba] = await Promise.all([
      this.prisma.restoreDrill.findFirst({ orderBy: { finishedAt: 'desc' } }),
      this.prisma.restoreDrill.findFirst({
        where: { result: 'OK' },
        orderBy: { finishedAt: 'desc' },
      }),
    ]);
    const ocena = ocenProby(
      ostatniaProba as ProbaOdtworzenia | null,
      ostatniaUdanaProba as ProbaOdtworzenia | null,
      new Date(),
    );
    add(
      'restore_drill',
      'Próba odtworzenia z kopii (D4)',
      ocena.stan === 'aktualna' ? 'ok' : ocena.blokuje ? 'fail' : 'warn',
      ocena.komunikat,
      true,
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
        : 'Brak WEBAUTHN_RP_ID / WEBAUTHN_ORIGINS – logowanie passkey nie zadziała (przycisk ukryty).',
      false,
    );

    const hetzner = Boolean(process.env.HETZNER_API_TOKEN);
    add(
      'vps',
      'VPS/Cloud (Hetzner)',
      hetzner ? 'ok' : 'warn',
      hetzner ? 'Token Hetzner ustawiony – sprzedaż VPS aktywna.' : 'Brak HETZNER_API_TOKEN – sprzedaż VPS nieczynna.',
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
