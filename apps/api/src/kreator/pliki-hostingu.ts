import { Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus, ProductKind, SubscriptionStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { wProbie } from '../subscriptions/okres-probny.js';
import type { WpisKatalogu } from './publikacja.js';

/**
 * Pliki na koncie hostingu klienta dla publikacji kreatora (paczka 121). Ten sam mechanizm co menedżer plików panelu
 * (files.service.ts): klient serwera węzła działający jako użytkownik konta (`asUser`) i operacje menedżera plików
 * z @verris/directadmin-sdk (listDir, downloadFile, writeFile, uploadFile, makeDir, transferEntries, deleteEntries).
 * Ścieżki – względem katalogu domowego konta (/domains/<domena>/public_html…), generowane przez serwis publikacji
 * z renderu i sprawdzone (publikacja.ts: bladSciezki), nigdy z danych od klienta.
 *
 * Interfejs + token DI: serwis i testy programują względem `PlikiHostingu`, testy podstawiają atrapę.
 */
export const PLIKI_HOSTINGU_KREATORA = Symbol('PLIKI_HOSTINGU_KREATORA');

export interface DomenaKlienta {
  domena: string;
  subskrypcjaId: string;
  /** Lista domen konta nie wczytała się – domena główna z bazy, stan katalogu nieznany. */
  niepewna?: boolean;
}

export interface KatalogDomeny {
  /** Katalog strony względem katalogu domowego, np. /domains/x.pl/public_html albo …/public_html/public. */
  katalog: string;
  /** Katalog nadrzędny domeny (/domains/x.pl) – tam trafia kopia, poza katalogiem serwowanym przez WWW. */
  katalogDomeny: string;
  /** Podkatalogi poddomen w katalogu strony (serwer trzyma poddomeny w public_html/<poddomena>) – nie ruszamy. */
  chronione: string[];
}

export interface SesjaPlikow {
  katalogDomeny(domena: string): Promise<KatalogDomeny>;
  lista(sciezka: string): Promise<WpisKatalogu[]>;
  /** Odczyt małego pliku (znacznik, index.html zaślepki); null = brak pliku. */
  czytaj(sciezka: string, maks: number): Promise<string | null>;
  zapiszTekst(katalog: string, nazwa: string, tresc: string): Promise<void>;
  wgraj(katalog: string, nazwa: string, dane: Buffer): Promise<void>;
  utworzKatalog(katalog: string, nazwa: string): Promise<void>;
  przenies(katalog: string, nazwy: string[], cel: string): Promise<void>;
  usun(katalog: string, nazwy: string[]): Promise<void>;
}

export interface PlikiHostingu {
  /** Domeny klienta na działających, opłaconych (nie w okresie próbnym) usługach hostingu z aktywnym kontem. */
  domenyKlienta(userId: string): Promise<DomenaKlienta[]>;
  /** Sesja plików konta usługi klienta; usługa cudza, w próbie albo bez aktywnego konta = 404. */
  sesja(userId: string, subskrypcjaId: string): Promise<SesjaPlikow>;
}

const DZIALAJACE = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING, SubscriptionStatus.PAST_DUE];
const MAKS_DOMEN = 20;

@Injectable()
export class PlikiHostinguDa implements PlikiHostingu {
  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
  ) {}

  private uslugi(userId: string, subskrypcjaId?: string) {
    return this.prisma.subscription.findMany({
      where: {
        userId,
        ...(subskrypcjaId ? { id: subskrypcjaId } : {}),
        status: { in: DZIALAJACE },
        plan: { productKind: ProductKind.HOSTING },
        account: { status: AccountStatus.ACTIVE },
      },
      select: { id: true, isTrial: true, trialConvertedAt: true, account: { select: { id: true, domain: true, serverId: true, daUsername: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async domenyKlienta(userId: string): Promise<DomenaKlienta[]> {
    const wynik: DomenaKlienta[] = [];
    for (const s of (await this.uslugi(userId)).filter((u) => !wProbie(u) && u.account)) {
      const d = await this.da.listHostingDomainsForSubscription(s.id, userId);
      if (d.fetchError || !d.domains.length) {
        wynik.push({ domena: s.account!.domain.toLowerCase(), subskrypcjaId: s.id, niepewna: true });
        continue;
      }
      for (const x of d.domains) wynik.push({ domena: x.name.toLowerCase(), subskrypcjaId: s.id });
    }
    return wynik.slice(0, MAKS_DOMEN);
  }

  async sesja(userId: string, subskrypcjaId: string): Promise<SesjaPlikow> {
    const s = (await this.uslugi(userId, subskrypcjaId))[0];
    if (!s?.account || wProbie(s)) throw new NotFoundException('Nie znaleziono usługi hostingu dla tej domeny.');
    const konto = s.account;
    // Jak FilesService.clientFor: klucz serwera węzła + impersonacja użytkownika konta.
    const klient = (await this.da.getClientForServer(konto.serverId)).asUser(konto.daUsername);
    const da = this.da;
    return {
      async katalogDomeny(domena) {
        // getHostingDocroot sprawdza, że domena należy do tej usługi (assertDomainOwnedBySubscription), i czyta
        // katalog główny strony ustawiony przez klienta (A-06) – publikujemy tam, skąd domena serwuje stronę.
        const { domain, katalog } = await da.getHostingDocroot(subskrypcjaId, userId, domena);
        const pod = await da.listHostingSubdomains(subskrypcjaId, userId);
        if (pod.fetchError) throw new Error(`poddomeny: ${pod.fetchError}`);
        return {
          katalog: `/domains/${domain}/public_html${katalog ? `/${katalog}` : ''}`,
          katalogDomeny: `/domains/${domain}`,
          chronione: katalog ? [] : pod.rows.filter((r) => r.domain.toLowerCase() === domain).map((r) => r.subdomain),
        };
      },
      async lista(sciezka) {
        return (await klient.listDir(sciezka)).map((e) => ({ name: e.name, type: e.type }));
      },
      async czytaj(sciezka, maks) {
        const kat = sciezka.slice(0, sciezka.lastIndexOf('/')) || '/';
        const n = sciezka.slice(sciezka.lastIndexOf('/') + 1);
        const wpis = (await klient.listDir(kat)).find((e) => e.name === n && e.type === 'file');
        if (!wpis) return null;
        if (wpis.sizeBytes > maks) return '';
        return (await klient.downloadFile(sciezka, maks)).toString('utf8');
      },
      zapiszTekst: (katalog, nazwa, tresc) => klient.writeFile(katalog, nazwa, tresc),
      wgraj: (katalog, nazwa, dane) => klient.uploadFile(katalog, nazwa, dane),
      utworzKatalog: (katalog, nazwa) => klient.makeDir(katalog, nazwa),
      przenies: (katalog, nazwy, cel) => klient.transferEntries(katalog, nazwy, cel, 'move'),
      usun: (katalog, nazwy) => klient.deleteEntries(katalog, nazwy),
    };
  }
}
