import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { OvhClient } from './ovh.client.js';
import {
  adresTechniczny,
  etykietaWStrefie,
  konfiguracjaDomenyTechnicznej,
  losowyIdentyfikator,
  wDomenieTechnicznej,
} from './adres-techniczny.js';

/**
 * Strefa DNS domeny technicznej – abstrakcja nad dostawcą DNS. Każde konto stoi na innym węźle, więc rekord
 * wieloznaczny `*.<domena>` na jeden adres nie wystarczy: każdy adres techniczny dostaje własny rekord A → IP węzła
 * konta, przepinany przy przeniesieniu konta (H-16) i zdejmowany przy usunięciu konta.
 */
export interface StrefaDnsTechniczna {
  /** Czy dostawca DNS ma dane dostępowe (bez nich funkcja „bez domeny” jest wyłączona). */
  skonfigurowana(): boolean;
  /** Rekord A `<etykieta>.<strefa>` → ipv4 (utworzenie albo zmiana istniejącego). */
  ustawA(strefa: string, etykieta: string, ipv4: string): Promise<'utworzono' | 'zmieniono' | 'bez-zmian'>;
  /** Usuwa rekordy A `<etykieta>.<strefa>` (brak rekordu = nic do zrobienia). */
  usunA(strefa: string, etykieta: string): Promise<number>;
}

/** TTL rekordów technicznych: krótki, żeby przeniesienie konta na inny węzeł szybko było widać w DNS. */
export const TTL_ADRESU_TECHNICZNEGO = 300;

/**
 * Strefa w OVH – ten sam klient i te same dane dostępowe co rekordy NS i nazw węzłów (NodeDnsService,
 * ops/docs/OVH_NODE_NS_AUTOMATION.md). API OVH: GET/POST /domain/zone/{zone}/record, PUT/DELETE
 * /domain/zone/{zone}/record/{id}, POST /domain/zone/{zone}/refresh (https://eu.api.ovh.com/console/#/domain/zone).
 * Klucz OVH (OVH_CONSUMER_KEY) musi mieć prawa także do /domain/zone/<domena techniczna>/*.
 */
export class StrefaDnsOvh implements StrefaDnsTechniczna {
  constructor(private readonly ovh: OvhClient) {}

  skonfigurowana(): boolean {
    return this.ovh.isConfigured();
  }

  private sciezka(strefa: string) {
    return `/domain/zone/${encodeURIComponent(strefa)}`;
  }

  async ustawA(strefa: string, etykieta: string, ipv4: string) {
    const z = this.sciezka(strefa);
    const ids = await this.ovh.request<number[]>('GET', `${z}/record?fieldType=A&subDomain=${encodeURIComponent(etykieta)}`);
    let wynik: 'utworzono' | 'zmieniono' | 'bez-zmian';
    if (Array.isArray(ids) && ids.length > 0) {
      const obecny = await this.ovh.request<{ target: string; ttl?: number }>('GET', `${z}/record/${ids[0]}`);
      if (obecny?.target === ipv4 && ids.length === 1) return 'bez-zmian';
      await this.ovh.request('PUT', `${z}/record/${ids[0]}`, { target: ipv4, ttl: TTL_ADRESU_TECHNICZNEGO });
      // Nadmiarowe rekordy A tej nazwy (ręczne dopiski) kierowałyby część ruchu na stary węzeł.
      for (const id of ids.slice(1)) await this.ovh.request('DELETE', `${z}/record/${id}`);
      wynik = 'zmieniono';
    } else {
      await this.ovh.request('POST', `${z}/record`, { fieldType: 'A', subDomain: etykieta, target: ipv4, ttl: TTL_ADRESU_TECHNICZNEGO });
      wynik = 'utworzono';
    }
    await this.ovh.request('POST', `${z}/refresh`);
    return wynik;
  }

  async usunA(strefa: string, etykieta: string) {
    const z = this.sciezka(strefa);
    const ids = await this.ovh.request<number[]>('GET', `${z}/record?fieldType=A&subDomain=${encodeURIComponent(etykieta)}`);
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    for (const id of ids) await this.ovh.request('DELETE', `${z}/record/${id}`);
    await this.ovh.request('POST', `${z}/refresh`);
    return ids.length;
  }
}

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;

/**
 * Paczka 129 – adres techniczny usługi hostingowej (`<identyfikator>.<HOSTING_TECH_DOMAIN>`).
 * Bezpieczeństwo domeny technicznej (osobna domena, nie poddomena verris.pl) – opis w `adres-techniczny.ts`.
 */
@Injectable()
export class AdresTechnicznyService implements OnModuleInit {
  private readonly logger = new Logger(AdresTechnicznyService.name);
  private readonly strefa: StrefaDnsTechniczna;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    ovh: OvhClient,
  ) {
    this.strefa = new StrefaDnsOvh(ovh);
  }

  private konfiguracja() {
    const z = (k: string) => this.config.get<string>(k) ?? undefined;
    return konfiguracjaDomenyTechnicznej({
      HOSTING_TECH_DOMAIN: z('HOSTING_TECH_DOMAIN'),
      CLIENT_PANEL_URL: z('CLIENT_PANEL_URL'),
      STAFF_PANEL_URL: z('STAFF_PANEL_URL'),
      ADMIN_PANEL_URL: z('ADMIN_PANEL_URL'),
      AUTH_COOKIE_DOMAIN: z('AUTH_COOKIE_DOMAIN'),
    });
  }

  /** Start API: domena techniczna w domenie paneli (wspólne ciasteczka) albo bez dostawcy DNS – wyraźnie w logu. */
  onModuleInit(): void {
    const k = this.konfiguracja();
    if (k.blad) this.logger.error(k.blad);
    else if (k.domena && !this.strefa.skonfigurowana()) {
      this.logger.error(
        `HOSTING_TECH_DOMAIN=${k.domena}, ale dostawca DNS strefy technicznej (OVH_APP_KEY/OVH_APP_SECRET/OVH_CONSUMER_KEY) nie jest skonfigurowany – zamówienia bez domeny wyłączone.`,
      );
    }
  }

  /** Domena techniczna (po walidacji) albo null – wtedy adresów technicznych nie nadajemy. */
  domena(): string | null {
    return this.konfiguracja().domena;
  }

  /** Zamówienie hostingu bez domeny dostępne: domena techniczna poprawna i strefa DNS obsługiwana. */
  dostepny(): boolean {
    return this.domena() !== null && this.strefa.skonfigurowana();
  }

  /** Domena klienta leży w domenie technicznej (zarezerwowanej) – takiej nie wolno dodać ani zamówić. */
  zarezerwowana(domenaKlienta: string): boolean {
    return wDomenieTechnicznej(domenaKlienta, this.domena());
  }

  /**
   * Nadaje usłudze adres techniczny (raz – potem zawsze ten sam). Null, gdy funkcja wyłączona. Unikalność pilnuje
   * indeks w bazie; zderzenie losowania (36^7) = kolejna próba.
   */
  async nadaj(subscriptionId: string): Promise<string | null> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { adresTechniczny: true } });
    if (sub?.adresTechniczny) return sub.adresTechniczny;
    const domena = this.domena();
    if (!sub || !domena || !this.dostepny()) return null;
    for (let proba = 0; proba < 6; proba++) {
      const adres = adresTechniczny(losowyIdentyfikator(), domena);
      try {
        const r = await this.prisma.subscription.updateMany({ where: { id: subscriptionId, adresTechniczny: null }, data: { adresTechniczny: adres } });
        if (r.count === 1) return adres;
        // Równoległe nadanie wygrało – bierzemy jego wynik.
        const teraz = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { adresTechniczny: true } });
        return teraz?.adresTechniczny ?? null;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') continue;
        throw err;
      }
    }
    throw new Error('Nie udało się nadać unikalnego adresu technicznego.');
  }

  /** Rekord A adresu technicznego → IP węzła. Błąd dostawcy DNS = wyjątek (wołający decyduje o skutkach). */
  async ustawRekord(adres: string, ipv4: string | null | undefined): Promise<'utworzono' | 'zmieniono' | 'bez-zmian'> {
    const domena = this.domena();
    if (!domena || !this.strefa.skonfigurowana()) throw new Error('Strefa domeny technicznej nie jest skonfigurowana.');
    const etykieta = etykietaWStrefie(adres, domena);
    if (!etykieta) throw new Error(`Adres ${adres} nie należy do strefy technicznej ${domena}.`);
    const ip = (ipv4 ?? '').trim();
    if (!IPV4.test(ip) || ip === '0.0.0.0') throw new Error(`Węzeł nie ma publicznego adresu IPv4 (${ip || 'brak'}).`);
    return this.strefa.ustawA(domena, etykieta, ip);
  }

  /**
   * H-16 – konto przeniesione na inny węzeł: rekord A adresu technicznego na IP nowego węzła. Bez adresu
   * technicznego – nic do zrobienia (null). Błąd = wyjątek (wołający podnosi alarm porządku po przeniesieniu).
   */
  async poPrzeniesieniu(accountId: string): Promise<string | null> {
    const konto = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { userId: true, subscription: { select: { id: true, adresTechniczny: true } }, server: { select: { ipAddress: true } } },
    });
    const adres = konto?.subscription?.adresTechniczny;
    if (!konto || !adres) return null;
    const wynik = await this.ustawRekord(adres, konto.server?.ipAddress);
    await this.audit.record({
      action: 'ADRES_TECHNICZNY_DNS_PRZEPIETY',
      userId: konto.userId,
      actorUserId: null,
      details: { subscriptionId: konto.subscription!.id, accountId, adres, wynik },
    });
    return adres;
  }

  /** Konto usunięte – rekord A adresu technicznego znika (nie zostaje nazwa wskazująca na cudzy/wolny węzeł). */
  async poUsunieciuKonta(subscriptionId: string): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({ where: { id: subscriptionId }, select: { adresTechniczny: true } });
    const domena = this.domena();
    if (!sub?.adresTechniczny || !domena || !this.strefa.skonfigurowana()) return;
    const etykieta = etykietaWStrefie(sub.adresTechniczny, domena);
    if (!etykieta) return;
    await this.strefa.usunA(domena, etykieta);
  }
}
