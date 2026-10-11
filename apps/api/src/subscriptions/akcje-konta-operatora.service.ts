import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions, SupportActions } from '../common/audit/audit.actions.js';
import { kontekstZadania } from '../common/audit/kontekst-magazyn.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { hasloResetowaneTemplate, type HasloResetowaneRodzaj } from '../mail/templates/hosting-notifications.js';
import { PhpService } from './php.service.js';
import { MalwareScanService } from './malware-scan.service.js';
import { ZawieszenieOperatoraService } from './zawieszenie-operatora.service.js';
import { losoweHaslo } from './losowe-haslo.js';

export type AkcjaKonta =
  | 'haslo-skrzynki'
  | 'haslo-ftp'
  | 'haslo-bazy'
  | 'ssl'
  | 'php'
  | 'kopia'
  | 'skan'
  | 'dns-dodaj'
  | 'dns-zmien'
  | 'dns-usun'
  // F3.1 (D4) — poczta konta (poczta-konta-operatora.service.ts).
  | 'blokada-wysylki'
  | 'zwolnienie-wysylki'
  | 'kolejka-usun'
  | 'limit-wysylki'
  // F3.2 — bezpieczeństwo konta: odblokowanie IP (blokady-ip-konta.service.ts), kwarantanna malware (G-12).
  | 'odblokowanie-ip'
  | 'kwarantanna'
  | 'przywrocenie-z-kwarantanny';

/** Kto i dlaczego (D2): powód obowiązkowy, numer zgłoszenia klienta opcjonalny. */
export interface ZlecenieOperatora {
  subscriptionId: string;
  operatorUserId: string;
  /** Rola operatora z tokenu (ADMIN | STAFF) — STAFF działa tylko na kontach klientów (jak wejście na konto). */
  operatorRole: string;
  powod: string;
  zgloszenie?: string | null;
}

type RekordDns = { domain: string; name: string; type: string; value: string; ttl?: number };
type Szczegoly = Record<string, string | number | boolean | null | undefined>;

export interface Wlasciciel {
  userId: string;
  email: string;
  firstName: string | null;
  domena: string;
  zgloszenieId: string | null;
  konto: { id: string; daUsername: string; serverId: string };
}

export const MIN_POWOD = 10;

/**
 * F2.2 — pasek akcji konta na karcie usługi: operatorskie lustro tras klienta, bez impersonacji.
 *
 * Każda akcja woła TĘ SAMĄ metodę co panel klienta (directadmin.service.ts, php.service.ts, malware-scan.service.ts)
 * z id WŁAŚCICIELA usługi — węzeł widzi konto klienta, nie operatora, a reguły (własność domeny, konto aktywne,
 * jedna zmiana PHP naraz) są te same. Nie ma tu nowych wywołań węzła ani nowych kanałów.
 *
 * Dziennik (D2/D3):
 * - OPERATOR_ACCOUNT_CHANGED — dziennik zespołu: akcja, powód, zgłoszenie, cel i wynik (także błąd węzła — w eksporcie
 *   RODO klienta zamieniony na komunikat ogólny, data-export.service.ts dziennikBialaEtykieta);
 * - wpis HOSTING_* na koncie klienta — z autorem = operator (kontekst `operator` w AuditService), więc klient
 *   widzi „obsługa Verris (zgłoszenie #…)”, bez nazwiska; gdy serwis sam takiego wpisu nie robi (SSL, kopia, PHP,
 *   DNS), dopisuje go ta klasa.
 * Hasła (D3): operator ustawia losowe hasło, którego nikt nie zna (nie wraca w odpowiedzi ani w mailu); klient
 * dostaje mail z linkiem do zakładki panelu, w której ustawia własne.
 */
@Injectable()
export class AkcjeKontaOperatoraService {
  private readonly logger = new Logger(AkcjeKontaOperatoraService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly php: PhpService,
    private readonly malware: MalwareScanService,
    private readonly audit: AuditService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly zgloszenia: ZawieszenieOperatoraService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  /**
   * Wspólny przebieg: usługa z kontem (404 bez wpisu), powód, zgłoszenie klienta, operacja w kontekście operatora,
   * wpis klienta i wpis zespołu. Błąd węzła = błąd dla operatora (z treścią) i wpis „blad” w dzienniku zespołu.
   * Publiczne dla akcji poczty konta (F3.1, poczta-konta-operatora.service.ts) — te same reguły D2/D3.
   */
  async wykonaj<T>(
    z: ZlecenieOperatora,
    akcja: AkcjaKonta,
    cel: Szczegoly,
    operacja: (w: Wlasciciel) => Promise<T>,
    wpisKlienta?: { action: string; details: Szczegoly },
  ): Promise<T> {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: z.subscriptionId },
      select: { userId: true, user: { select: { email: true, firstName: true, role: true } }, account: { select: { id: true, domain: true, daUsername: true, serverId: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    // Przegląd F2.2 — ta sama twarda reguła co wejście na konto (users.admin.service.ts impersonate): STAFF działa
    // tylko na usługach klientów (USER). Inaczej L3 zmieniłby MX/A domeny administratora i przejął jego pocztę
    // (np. reset hasła do panelu admina), a L2 zresetowałby hasła skrzynek zespołu. Usługi zespołu — tylko ADMIN.
    if (z.operatorRole !== 'ADMIN' && sub.user.role !== 'USER') {
      throw new ForbiddenException('Personel może zmieniać wyłącznie usługi klientów — usługę konta zespołu zmienia administrator.');
    }
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD} znaków) — zapisze się w dzienniku.`);
    const zgloszenieId = await this.zgloszenia.zgloszenieKlienta(sub.userId, z.zgloszenie);
    const konto = { id: sub.account.id, daUsername: sub.account.daUsername, serverId: sub.account.serverId };
    const w: Wlasciciel = { userId: sub.userId, email: sub.user.email, firstName: sub.user.firstName, domena: sub.account.domain, zgloszenieId, konto };

    const dziennik = (wynik: Szczegoly) =>
      this.audit.record({
        action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
        userId: sub.userId,
        actorUserId: z.operatorUserId,
        details: bezPustych({ subscriptionId: z.subscriptionId, akcja, powod, zgloszenieId, ...cel, ...wynik }),
      });

    const magazyn = { ...(kontekstZadania.getStore() ?? {}), operator: { wlasciciel: sub.userId, operatorUserId: z.operatorUserId, zgloszenieId } };
    let wynik: T;
    try {
      wynik = await kontekstZadania.run(magazyn, async () => {
        const r = await operacja(w);
        if (wpisKlienta) {
          await this.audit.record({
            action: wpisKlienta.action,
            userId: sub.userId,
            actorUserId: z.operatorUserId,
            details: bezPustych({ subscriptionId: z.subscriptionId, ...wpisKlienta.details }),
          });
        }
        return r;
      });
    } catch (err) {
      await dziennik({ wynik: 'blad', blad: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
      throw err;
    }
    const mail = (wynik as { mailDoKlienta?: boolean } | null)?.mailDoKlienta;
    await dziennik({ wynik: 'ok', ...(mail === undefined ? {} : { mailDoKlienta: mail }) });
    return wynik;
  }

  /** Mail do klienta po resecie (bez hasła); niewysłany mail nie cofa resetu — operator widzi to w odpowiedzi. */
  private async mailOResecie(w: Wlasciciel, rodzaj: HasloResetowaneRodzaj, nazwa: string, ctaUrl: string): Promise<boolean> {
    try {
      const r = await this.mailer.send({
        ...hasloResetowaneTemplate({
          to: w.email,
          firstName: w.firstName,
          rodzaj,
          nazwa,
          zgloszenie: w.zgloszenieId ? `#${w.zgloszenieId.slice(0, 8)}` : null,
          ctaUrl,
          panelUrl: this.panelUrl(),
        }),
        userId: w.userId,
        category: 'TRANSACTIONAL',
        fromRole: 'SECURITY',
      });
      return r.delivered;
    } catch (err) {
      this.logger.warn(`mail o resecie hasła (${rodzaj}) nie wyszedł: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Zakładka usługi w panelu klienta, w której przy skrzynce / koncie FTP / użytkowniku bazy jest „Zmień hasło”
   * (MailTab, FtpTab, DatabasesTab → DbUsers). Przegląd F2.2: zakładka „Poczta” strony domeny (sites/…?tab=mail)
   * to sama lista adresów bez zmiany hasła, a usługa pocztowa nie ma stron — link prowadził tam, gdzie się nie da.
   */
  private zakladka(subscriptionId: string, tab: 'mail' | 'ftp' | 'databases'): string {
    return `${this.panelUrl()}/dashboard/services/${encodeURIComponent(subscriptionId)}?tab=${tab}`;
  }

  async resetHaslaSkrzynki(z: ZlecenieOperatora, email: string) {
    const adres = email.trim().toLowerCase();
    return this.wykonaj(z, 'haslo-skrzynki', { email: adres }, async (w) => {
      // services.controller.ts POST :id/hosting-email/password — ta sama metoda (CMD_API_POP modify, bieżący rozmiar).
      await this.directAdmin.changeHostingEmailPassword(z.subscriptionId, w.userId, { email: adres, password: losoweHaslo() });
      const mailDoKlienta = await this.mailOResecie(w, 'skrzynka', adres, this.zakladka(z.subscriptionId, 'mail'));
      return { ok: true as const, mailDoKlienta, klient: w.email };
    });
  }

  async resetHaslaFtp(z: ZlecenieOperatora, username: string) {
    const login = username.trim();
    return this.wykonaj(z, 'haslo-ftp', { username: login }, async (w) => {
      // services.controller.ts POST :id/hosting-ftp/:username/password — konto musi być na liście FTP usługi.
      await this.directAdmin.changeHostingFtpPassword(z.subscriptionId, w.userId, login, losoweHaslo());
      const mailDoKlienta = await this.mailOResecie(w, 'ftp', login, this.zakladka(z.subscriptionId, 'ftp'));
      return { ok: true as const, mailDoKlienta, klient: w.email };
    });
  }

  async resetHaslaBazy(z: ZlecenieOperatora, db: string, user: string) {
    const baza = db.trim();
    const uzytkownik = user.trim();
    return this.wykonaj(z, 'haslo-bazy', { db: baza, user: uzytkownik }, async (w) => {
      // Użytkownik musi mieć dostęp do wskazanej bazy konta — inaczej literówka zmieniałaby hasło innego użytkownika.
      const lista = await this.directAdmin.listHostingDbUsers(z.subscriptionId, w.userId, baza);
      if (lista.fetchError) throw new BadRequestException(lista.fetchError);
      if (!lista.users.includes(uzytkownik)) throw new NotFoundException('Ten użytkownik nie ma dostępu do tej bazy.');
      // services.controller.ts POST :id/hosting-db-users/password — ta sama metoda.
      await this.directAdmin.changeHostingDbUserPassword(z.subscriptionId, w.userId, { db: baza, user: uzytkownik, password: losoweHaslo() });
      const mailDoKlienta = await this.mailOResecie(w, 'baza', uzytkownik, this.zakladka(z.subscriptionId, 'databases'));
      return { ok: true as const, mailDoKlienta, klient: w.email };
    });
  }

  /** Ponowne wystawienie Let's Encrypt — services.controller.ts POST :id/hosting-ssl/letsencrypt (bez wildcard). */
  async ssl(z: ZlecenieOperatora, domain: string, includeWww: boolean) {
    const domena = domain.trim().toLowerCase();
    return this.wykonaj(
      z,
      'ssl',
      { domain: domena, www: includeWww },
      (w) => this.directAdmin.requestLetsEncryptCertificate(z.subscriptionId, w.userId, { domain: domena, includeWww, wildcard: false }),
      { action: HostingResourceActions.HOSTING_SSL_REQUESTED, details: { domain: domena } },
    );
  }

  /** Wersja PHP konta — zadanie PHP_APPLY jak services.controller.ts POST :id/hosting-php. */
  async wersjaPhp(z: ZlecenieOperatora, version: string) {
    return this.wykonaj(
      z,
      'php',
      { version },
      (w) => this.php.setVersionForSubscription(z.subscriptionId, w.userId, version),
      { action: HostingResourceActions.HOSTING_PHP_VERSION_CHANGED, details: { version } },
    );
  }

  /** Kopia konta teraz — services.controller.ts POST :id/hosting-site-backup. */
  async kopia(z: ZlecenieOperatora) {
    return this.wykonaj(z, 'kopia', {}, (w) => this.directAdmin.createHostingSiteBackupNow(z.subscriptionId, w.userId), {
      action: HostingResourceActions.HOSTING_BACKUP_CREATED,
      details: {},
    });
  }

  /** Skan malware — zadanie MALWARE_SCAN jak services.controller.ts POST :id/hosting-malware/scan; wynik w GET konto/malware. */
  async skan(z: ZlecenieOperatora) {
    return this.wykonaj(z, 'skan', {}, (w) => this.malware.zlec(z.subscriptionId, w.userId, 'scan'));
  }

  /**
   * F3.2 (G-12) — kwarantanna wykrytych plików przez obsługę: ta sama metoda co panel klienta (tylko pliki z ostatnich
   * wyników skanera; węzeł przenosi plik do ~/.verris-kwarantanna z manifestem sha256 — kopia zostaje, nic nie znika
   * bezpowrotnie). Wpis klienta HOSTING_MALWARE_QUARANTINE_QUEUED robi malware-scan.service.ts — w kontekście operatora
   * jako „obsługa Verris (zgłoszenie #…)”. Trwałe usunięcie z kwarantanny zostaje decyzją klienta.
   */
  async kwarantanna(z: ZlecenieOperatora, sciezki: string[]) {
    return this.wykonaj(z, 'kwarantanna', { pliki: sciezki.length, pierwszy: sciezki[0] }, (w) => this.malware.doKwarantanny(z.subscriptionId, w.userId, sciezki));
  }

  /** G-12 — cofnięcie kwarantanny przez obsługę (np. fałszywy alarm); plik wraca pod oryginalną ścieżkę. */
  async przywrocZKwarantanny(z: ZlecenieOperatora, wpisy: string[]) {
    return this.wykonaj(z, 'przywrocenie-z-kwarantanny', { pliki: wpisy.length, pierwszy: wpisy[0] }, (w) =>
      this.malware.wpisyKwarantanny(z.subscriptionId, w.userId, 'przywroc', wpisy),
    );
  }

  async dnsDodaj(z: ZlecenieOperatora, r: RekordDns) {
    return this.wykonaj(
      z,
      'dns-dodaj',
      { domain: r.domain, name: r.name, type: r.type, value: r.value, ttl: r.ttl },
      (w) => this.directAdmin.createHostingDnsRecord(z.subscriptionId, w.userId, r),
      { action: HostingResourceActions.HOSTING_DNS_RECORD_CREATED, details: { domain: r.domain, name: r.name, type: r.type } },
    );
  }

  async dnsZmien(z: ZlecenieOperatora, e: { domain: string; old: Omit<RekordDns, 'domain' | 'ttl'>; next: Omit<RekordDns, 'domain'> }) {
    return this.wykonaj(
      z,
      'dns-zmien',
      { domain: e.domain, name: e.old.name, type: e.old.type, value: e.old.value, nowaNazwa: e.next.name, nowyTyp: e.next.type, nowaWartosc: e.next.value, ttl: e.next.ttl },
      (w) => this.directAdmin.editHostingDnsRecord(z.subscriptionId, w.userId, e),
      { action: HostingResourceActions.HOSTING_DNS_RECORD_UPDATED, details: { domain: e.domain, name: e.next.name, type: e.next.type } },
    );
  }

  async dnsUsun(z: ZlecenieOperatora, r: Omit<RekordDns, 'ttl'>) {
    return this.wykonaj(
      z,
      'dns-usun',
      { domain: r.domain, name: r.name, type: r.type, value: r.value },
      (w) => this.directAdmin.deleteHostingDnsRecord(z.subscriptionId, w.userId, r),
      { action: HostingResourceActions.HOSTING_DNS_RECORD_DELETED, details: { domain: r.domain, name: r.name, type: r.type } },
    );
  }
}

function bezPustych(o: Szczegoly): Prisma.InputJsonObject {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}
