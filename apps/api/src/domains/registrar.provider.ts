import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RegistrarAvailability {
  domain: string;
  available: boolean;
  premium?: boolean;
  priceAmount?: string | null;
  currency?: string;
  /** Rejestrator nie odpowiedział dla tej końcówki — nie wiemy, czy wolna (nie „zajęta”). */
  unknown?: boolean;
}

export interface RegistrarPrice {
  amount: string;
  currency: string;
}

export type RegistrarOperation = 'register' | 'renew' | 'transfer';

export interface RegistrarOrderResult {
  provider: string;
  providerOrderId: string;
  externalDomainId?: string | null;
  expiresAt?: string | null;
}

export interface RegistrarProvider {
  readonly id: string;
  availability(domain: string): Promise<RegistrarAvailability>;
  /** Jedno żądanie do rejestratora — wiele TLD dla tej samej etykiety. */
  batchAvailability(name: string, extensions: string[]): Promise<RegistrarAvailability[]>;
  /** Wholesale/reseller price for an operation; used to bill the customer wallet. */
  price(input: { domain: string; years: number; operation: RegistrarOperation }): Promise<RegistrarPrice>;
  register(input: { domain: string; years: number; nameservers: string[]; ownerHandle: string }): Promise<RegistrarOrderResult>;
  transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string; ownerHandle: string }): Promise<RegistrarOrderResult>;
  renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult>;
  /** A-13 — abonent domeny to klient: jego uchwyt (kontakt) u rejestratora. */
  createRegistrant(r: Registrant): Promise<string>;
  getRegistrant(handle: string): Promise<Registrant>;
  /** Bez imienia, nazwiska i firmy — tych rejestrator nie zmienia (to cesja, nie korekta danych). */
  updateRegistrant(handle: string, r: Registrant): Promise<void>;
  /** state: stan domeny u rejestratora — po nim domykamy transfer (aktywna = przeniesiona do nas). */
  domainInfo(externalId: string): Promise<DomainInfo>;
  /** A-15 */
  setTransferLock(externalId: string, locked: boolean): Promise<void>;
  /** A-14 — ukrycie danych abonenta w WHOIS (WPP). */
  setWhoisPrivacy(externalId: string, enabled: boolean): Promise<void>;
  /** A-09 — kod do transferu domeny do innego rejestratora. */
  authCode(externalId: string): Promise<string>;
  /** Uchwyt operatora (admin/tech/billing). Abonent nim NIE jest — patrz A-13. */
  readonly operatorHandle?: string;
}

/** G-08 — produkt SSL u resellera (tylko to, czego potrzebuje cennik i zamówienie). */
export interface SslProduct {
  id: number;
  name: string;
  brand: string;
  /** domain_validation | organization_validation | extended_validation */
  category: string;
  wildcard: boolean;
  /** Jedna nazwa w cenie (included_domains_count = 1) — bez multi-domain. */
  singleDomain: boolean;
  /** Koszt zakupu na 1 rok (cena resellera); null — reseller nie podał ceny. */
  cost: RegistrarPrice | null;
}

export type SslWalidacja = 'dns' | 'email';

export interface SslOrderInfo {
  state: 'pending' | 'issued' | 'failed';
  certificate: string | null;
  caBundle: string | null;
  /** Rekord DNS do weryfikacji domeny (additional_data.dns_record / dns_value). */
  dns: { record: string; value: string } | null;
}

/** G-08 — certyfikaty SSL u resellera rejestratora (dziś: OpenProvider /v1/ssl). */
export interface SslReseller {
  sslProducts(): Promise<SslProduct[]>;
  sslCreateOrder(input: {
    productId: number;
    years: number;
    csr: string;
    hostName: string;
    validation: SslWalidacja;
    approverEmail?: string | null;
  }): Promise<string>;
  sslOrder(id: string): Promise<SslOrderInfo>;
}

export interface DomainInfo {
  ownerHandle: string | null;
  locked: boolean | null;
  /** A-14 — czy rejestrator ma włączone ukrycie danych w WHOIS; null = nie podał. */
  privateWhois?: boolean | null;
  state?: 'active' | 'pending' | 'failed' | null;
  expiresAt?: string | null;
}

export interface Registrant {
  firstName: string;
  lastName: string;
  companyName?: string | null;
  vat?: string | null;
  street: string;
  houseNumber: string;
  zipcode: string;
  city: string;
  /** ISO 3166-1 alfa-2 */
  country: string;
  /** np. "+48" */
  phoneCountryCode: string;
  /** same cyfry, bez kodu kraju */
  phone: string;
  email: string;
}

@Injectable()
export class RegistrarProviderFactory {
  constructor(private readonly config: ConfigService) {}

  get(): RegistrarProvider {
    const providerId = (this.config.get<string>('REGISTRAR_PROVIDER') ?? '').toLowerCase();

    if (providerId === 'openprovider') return this.openProvider('Rejestracja domen jest chwilowo niedostępna.');

    const baseUrl = this.config.get<string>('REGISTRAR_API_BASE_URL');
    const token = this.config.get<string>('REGISTRAR_API_TOKEN');
    if (!providerId || !baseUrl || !token) {
      throw new ServiceUnavailableException('Registrar provider is not configured.');
    }
    return new HttpRegistrarProvider(providerId, baseUrl, token);
  }

  /** G-08 — certyfikaty SSL sprzedajemy tylko przez OpenProvidera (ten sam login i uchwyt operatora co domeny). */
  getSsl(): SslReseller {
    if ((this.config.get<string>('REGISTRAR_PROVIDER') ?? '').toLowerCase() !== 'openprovider') {
      throw new ServiceUnavailableException('Sprzedaż certyfikatów SSL jest chwilowo niedostępna.');
    }
    return this.openProvider('Sprzedaż certyfikatów SSL jest chwilowo niedostępna.');
  }

  private openProvider(niedostepne: string): OpenProviderRegistrarProvider {
    const username = this.config.get<string>('OPENPROVIDER_USERNAME');
    const password = this.config.get<string>('OPENPROVIDER_PASSWORD');
    const ownerHandle = this.config.get<string>('OPENPROVIDER_OWNER_HANDLE');
    if (!username || !password || !ownerHandle) {
      // Brak OPENPROVIDER_USERNAME / _PASSWORD / _OWNER_HANDLE — preflight GO-LIVE to zgłasza adminowi.
      throw new ServiceUnavailableException(niedostepne);
    }
    const baseUrl = this.config.get<string>('OPENPROVIDER_API_BASE_URL') ?? 'https://api.openprovider.eu';
    return new OpenProviderRegistrarProvider(baseUrl, username, password, ownerHandle);
  }
}

/** Generic JSON registrar adapter (kept as a fallback / for self-hosted gateways). */
class HttpRegistrarProvider implements RegistrarProvider {
  constructor(
    readonly id: string,
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  availability(domain: string): Promise<RegistrarAvailability> {
    return this.request(`/availability?domain=${encodeURIComponent(domain)}`, { method: 'GET' });
  }

  async batchAvailability(name: string, extensions: string[]): Promise<RegistrarAvailability[]> {
    const results: RegistrarAvailability[] = [];
    for (const extension of extensions) {
      results.push(await this.availability(`${name}.${extension}`));
    }
    return results;
  }

  async price(input: { domain: string; years: number; operation: RegistrarOperation }): Promise<RegistrarPrice> {
    return this.request(
      `/price?domain=${encodeURIComponent(input.domain)}&years=${input.years}&operation=${input.operation}`,
      { method: 'GET' },
    );
  }

  register(input: { domain: string; years: number; nameservers: string[]; ownerHandle: string }): Promise<RegistrarOrderResult> {
    return this.request('/domains/register', { method: 'POST', body: JSON.stringify(input) });
  }

  transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string; ownerHandle: string }): Promise<RegistrarOrderResult> {
    return this.request('/domains/transfer', { method: 'POST', body: JSON.stringify(input) });
  }

  renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult> {
    return this.request('/domains/renew', { method: 'POST', body: JSON.stringify(input) });
  }

  async createRegistrant(r: Registrant): Promise<string> {
    return (await this.request<{ handle: string }>('/contacts', { method: 'POST', body: JSON.stringify(r) })).handle;
  }

  getRegistrant(handle: string): Promise<Registrant> {
    return this.request(`/contacts/${encodeURIComponent(handle)}`, { method: 'GET' });
  }

  async updateRegistrant(handle: string, r: Registrant): Promise<void> {
    await this.request(`/contacts/${encodeURIComponent(handle)}`, { method: 'PUT', body: JSON.stringify(r) });
  }

  domainInfo(externalId: string): Promise<DomainInfo> {
    return this.request(`/domains/${encodeURIComponent(externalId)}`, { method: 'GET' });
  }

  async setTransferLock(externalId: string, locked: boolean): Promise<void> {
    await this.request(`/domains/${encodeURIComponent(externalId)}/lock`, { method: 'POST', body: JSON.stringify({ locked }) });
  }

  async setWhoisPrivacy(externalId: string, enabled: boolean): Promise<void> {
    await this.request(`/domains/${encodeURIComponent(externalId)}/whois-privacy`, { method: 'POST', body: JSON.stringify({ enabled }) });
  }

  async authCode(externalId: string): Promise<string> {
    return (await this.request<{ authCode: string }>(`/domains/${encodeURIComponent(externalId)}/authcode`, { method: 'GET' })).authCode;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
        ...(init.headers ?? {}),
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && typeof body === 'object' && 'message' in body ? String(body.message) : `Registrar API ${response.status}`;
      throw new ServiceUnavailableException(message);
    }
    return body as T;
  }
}

/**
 * OpenProvider reseller adapter (REST /v1).
 *
 * /v1beta jest wycofywane (OpenProvider: bez nowych integracji, wyłączenie 2027-06-30);
 * /v1 jest „funkcjonalnie identyczne”, zmienia się tylko prefiks ścieżki.
 *
 * Auth: POST /v1/auth/login → bearer token (cached ~50 min).
 * Availability + price: POST /v1/domains/check (with_price).
 * Register/Renew/Transfer: POST /v1/domains[...].
 *
 * DECYZJA WŁAŚCICIELA 2026-09-23 (A-13): abonentem (owner) jest KLIENT — dostaje własny uchwyt
 * (POST /v1/customers) z danymi podanymi przy zamówieniu. Wcześniej każda domena szła na uchwyt
 * operatora, czyli formalnie należała do Verris. OPENPROVIDER_OWNER_HANDLE zostaje jako
 * admin/tech/billing — klient nadal nie ma kontaktu z OpenProviderem.
 */
class OpenProviderRegistrarProvider implements RegistrarProvider, SslReseller {
  readonly id = 'openprovider';
  private readonly logger = new Logger(OpenProviderRegistrarProvider.name);
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string,
    readonly operatorHandle: string,
  ) {}

  async availability(domain: string): Promise<RegistrarAvailability> {
    const [row] = await this.batchAvailabilityByFqdn([domain]);
    return row ?? { domain, available: false, priceAmount: null, currency: 'EUR' };
  }

  async batchAvailability(name: string, extensions: string[]): Promise<RegistrarAvailability[]> {
    const fqdns = extensions.map((extension) => `${name}.${extension}`);
    return this.batchAvailabilityByFqdn(fqdns);
  }

  private async batchAvailabilityByFqdn(fqdns: string[]): Promise<RegistrarAvailability[]> {
    // Paczki po 15: przy 35 końcówkach w jednym zapytaniu panel dostawał same „zajęte” (27.09),
    // a pojedyncze zapytanie o 2 domeny odpowiadało poprawnie.
    // ponytail: 15 dobrane ostrożnie, bez potwierdzonego limitu w dokumentacji — podnieść, jeśli OpenProvider go poda.
    const paczki: string[][] = [];
    for (let i = 0; i < fqdns.length; i += 15) paczki.push(fqdns.slice(i, i + 15));
    // Token raz, potem paczki równolegle: t1 04.10 (sandbox) paczka z rejestrem bez środowiska testowego
    // wisiała do 504 OpenProvidera, a kolejna czekała za nią — panel kończył się „nie udało się sprawdzić”.
    // Błąd jednej paczki nie gasi całej wyszukiwarki — tylko gdy padną wszystkie.
    // Paczka jest „wszystko albo nic”: jedna wisząca końcówka (sandbox: .online/.shop >40 s) gubiła .pl i .com
    // z tej samej paczki — wtedy jej domeny pytamy pojedynczo (też równolegle, z tym samym limitem).
    await this.ensureToken();
    type Odp = { data: { results: OpReachableResult[] } };
    const sprawdz = (lista: string[]) =>
      this.request<Odp>('/v1/domains/check', { domains: lista.map((fqdn) => splitDomain(fqdn)), with_price: true }, 'POST', OP_CHECK_TIMEOUT_MS);
    const odp = await Promise.allSettled(
      paczki.map((p) =>
        sprawdz(p).catch(async (e: unknown) => {
          if (p.length === 1) throw e;
          const pojedyncze = await Promise.allSettled(p.map((fqdn) => sprawdz([fqdn])));
          const ok = pojedyncze.flatMap((o) => (o.status === 'fulfilled' ? (o.value.data?.results ?? []) : []));
          if (!ok.length) throw e;
          return { data: { results: ok } } as Odp;
        }),
      ),
    );
    const wyniki = odp.flatMap((o) => (o.status === 'fulfilled' ? [o.value] : []));
    const blad = odp.find((o): o is PromiseRejectedResult => o.status === 'rejected');
    if (!wyniki.length && blad) throw blad.reason;
    // OpenProvider NIE zachowuje kolejności zapytania (27.09: google.com wrócił przed domeną podaną jako
    // pierwsza) — dopasowanie po nazwie domeny, nie po indeksie.
    const wgDomeny = new Map(
      wyniki.flatMap((r) => r.data?.results ?? []).map((r) => [String(r.domain ?? '').toLowerCase(), r]),
    );
    const brak = fqdns.filter((f) => !wgDomeny.has(f.toLowerCase()));
    if (brak.length) this.logger.warn(`OpenProvider check: brak wyniku dla ${brak.join(', ')}`);
    return fqdns.map((fqdn) => {
      const result = wgDomeny.get(fqdn.toLowerCase());
      const price = result?.price?.reseller ?? result?.price?.product;
      return {
        domain: fqdn,
        available: result?.status === 'free',
        unknown: !result,
        premium: Boolean(result?.is_premium),
        priceAmount: price ? String(price.price) : null,
        currency: price?.currency ?? 'USD',
      };
    });
  }

  async price(input: {
    domain: string;
    years: number;
    operation: RegistrarOperation;
  }): Promise<RegistrarPrice> {
    const { name, extension } = splitDomain(input.domain);
    const operation =
      input.operation === 'renew' ? 'renew' : input.operation === 'transfer' ? 'transfer' : 'create';
    const period = Math.min(10, Math.max(1, Math.trunc(input.years)));
    const qs = new URLSearchParams({
      'domain.name': name,
      'domain.extension': extension,
      operation,
      period: String(period),
    });
    const res = await this.request<{ data: { price?: { reseller?: OpPrice; product?: OpPrice } } }>(
      `/v1/domains/prices?${qs.toString()}`,
      null,
      'GET',
      OP_CHECK_TIMEOUT_MS,
    );
    const price = res.data?.price?.reseller ?? res.data?.price?.product;
    if (!price) {
      throw new ServiceUnavailableException('Rejestr domen nie podał ceny dla tej domeny.');
    }
    return { amount: String(price.price), currency: price.currency ?? 'EUR' };
  }

  async register(input: { domain: string; years: number; nameservers: string[]; ownerHandle: string }): Promise<RegistrarOrderResult> {
    const { name, extension } = splitDomain(input.domain);
    const res = await this.request<{ data: { id: number | string; expiration_date?: string } }>(
      '/v1/domains',
      {
        domain: { name, extension },
        period: input.years,
        name_servers: input.nameservers.map((ns) => ({ name: ns })),
        owner_handle: input.ownerHandle,
        admin_handle: this.operatorHandle,
        tech_handle: this.operatorHandle,
        billing_handle: this.operatorHandle,
        autorenew: 'off',
      },
    );
    return {
      provider: this.id,
      providerOrderId: String(res.data?.id ?? ''),
      externalDomainId: res.data?.id != null ? String(res.data.id) : null,
      expiresAt: res.data?.expiration_date ?? null,
    };
  }

  async transfer(input: { domain: string; years: number; nameservers: string[]; authCode: string; ownerHandle: string }): Promise<RegistrarOrderResult> {
    const { name, extension } = splitDomain(input.domain);
    const res = await this.request<{ data: { id: number | string } }>('/v1/domains/transfer', {
      domain: { name, extension },
      period: input.years,
      authcode: input.authCode,
      name_servers: input.nameservers.map((ns) => ({ name: ns })),
      owner_handle: input.ownerHandle,
      admin_handle: this.operatorHandle,
      tech_handle: this.operatorHandle,
      billing_handle: this.operatorHandle,
    });
    return {
      provider: this.id,
      providerOrderId: String(res.data?.id ?? ''),
      externalDomainId: res.data?.id != null ? String(res.data.id) : null,
    };
  }

  async renew(input: { domain: string; years: number; externalId?: string | null }): Promise<RegistrarOrderResult> {
    if (!input.externalId) {
      throw new ServiceUnavailableException('Rejestr domen nie zwrócił identyfikatora domeny do odnowienia.');
    }
    const res = await this.request<{ data: { expiration_date?: string } }>(
      `/v1/domains/${encodeURIComponent(input.externalId)}/renew`,
      { period: input.years },
    );
    // t1 04.10 (sandbox): odpowiedź na renew bez expiration_date — panel zostawał przy starej dacie ważności,
    // choć opłata zeszła i domena była odnowiona. Wtedy czytamy datę z domeny u rejestratora.
    const expiresAt =
      res.data?.expiration_date ?? (await this.domainInfo(input.externalId).then((d) => d.expiresAt).catch(() => null));
    return {
      provider: this.id,
      providerOrderId: input.externalId,
      externalDomainId: input.externalId,
      expiresAt,
    };
  }

  async createRegistrant(r: Registrant): Promise<string> {
    const res = await this.request<{ data: { handle?: string } }>('/v1/customers', {
      name: { first_name: r.firstName, last_name: r.lastName },
      ...(r.companyName ? { company_name: r.companyName } : {}),
      ...opKontakt(r),
    });
    if (!res.data?.handle) throw new ServiceUnavailableException('Rejestr domen nie zwrócił danych abonenta.');
    return res.data.handle;
  }

  async getRegistrant(handle: string): Promise<Registrant> {
    const res = await this.request<{ data: OpCustomer }>(`/v1/customers/${encodeURIComponent(handle)}`, null, 'GET');
    const c = res.data ?? ({} as OpCustomer);
    return {
      firstName: c.name?.first_name ?? '',
      lastName: c.name?.last_name ?? '',
      companyName: c.company_name || null,
      vat: c.vat || null,
      street: c.address?.street ?? '',
      houseNumber: c.address?.number ?? '',
      zipcode: c.address?.zipcode ?? '',
      city: c.address?.city ?? '',
      country: c.address?.country ?? '',
      phoneCountryCode: c.phone?.country_code ?? '',
      phone: `${c.phone?.area_code ?? ''}${c.phone?.subscriber_number ?? ''}`,
      email: c.email ?? '',
    };
  }

  async updateRegistrant(handle: string, r: Registrant): Promise<void> {
    await this.request(`/v1/customers/${encodeURIComponent(handle)}`, opKontakt(r), 'PUT');
  }

  async domainInfo(externalId: string): Promise<DomainInfo> {
    const res = await this.request<{
      data: { owner_handle?: string; is_locked?: boolean; is_private_whois_enabled?: boolean; status?: string; expiration_date?: string };
    }>(`/v1/domains/${encodeURIComponent(externalId)}`, null, 'GET');
    return {
      ownerHandle: res.data?.owner_handle ?? null,
      locked: res.data?.is_locked ?? null,
      privateWhois: res.data?.is_private_whois_enabled ?? null,
      state: stanOpenProvider(res.data?.status),
      expiresAt: res.data?.expiration_date ?? null,
    };
  }

  async setTransferLock(externalId: string, locked: boolean): Promise<void> {
    await this.request(`/v1/domains/${encodeURIComponent(externalId)}`, { is_locked: locked }, 'PUT');
  }

  /**
   * A-14 — WHOIS privacy protection (WPP): pole `is_private_whois_enabled` domeny, ta sama aktualizacja
   * PUT /v1/domains/{id} co blokada transferu.
   * Dokumentacja: https://doc.openprovider.eu/API_Format_isPrivateWhoisEnabled
   * („Enables or disables whois privacy protection (WPP) on domain”), REST: https://developer.openprovider.com
   * Rejestry, które nie pozwalają ukryć danych (wiele ccTLD, np. .pl), kończą się błędem OpenProvidera.
   */
  async setWhoisPrivacy(externalId: string, enabled: boolean): Promise<void> {
    await this.request(`/v1/domains/${encodeURIComponent(externalId)}`, { is_private_whois_enabled: enabled }, 'PUT');
  }

  async authCode(externalId: string): Promise<string> {
    const res = await this.request<{ data: { auth_code?: string } }>(
      `/v1/domains/${encodeURIComponent(externalId)}/authcode`, null, 'GET');
    if (!res.data?.auth_code) throw new ServiceUnavailableException('Rejestr domen nie zwrócił kodu transferu.');
    return res.data.auth_code;
  }

  /**
   * G-08 — SSL wg dokumentacji OpenProvidera (REST /v1, grupa SSL):
   * https://developer.openprovider.com/reference.html?group=SSL (swagger: /v1/ssl/products, /v1/ssl/orders,
   * /v1/ssl/orders/{id}; opis pól w „SSL Quickstart”: https://docs.openprovider.com/doc/all#tag/descSSLQuickstart).
   * Cena: prices[].price.reseller (koszt resellera) dla period = 1, jak przy domenach.
   */
  async sslProducts(): Promise<SslProduct[]> {
    const res = await this.request<{ data: { results?: OpSslProduct[] } }>(
      '/v1/ssl/products?with_price=true&limit=1000',
      null,
      'GET',
    );
    return (res.data?.results ?? []).map((p) => {
      const rok = (p.prices ?? []).find((c) => c.period === 1)?.price;
      const cena = rok?.reseller ?? rok?.product;
      return {
        id: p.id,
        name: p.name ?? `#${p.id}`,
        brand: p.brand_name ?? '',
        category: p.category ?? '',
        wildcard: Boolean(p.is_wildcard_supported),
        singleDomain: p.included_domains_count === 1,
        cost: cena ? { amount: String(cena.price), currency: cena.currency ?? 'EUR' } : null,
      };
    });
  }

  /**
   * POST /v1/ssl/orders. start_provision = true — zamówienie idzie od razu do wystawcy (false zostawia je w PAI).
   * software_id „linux” — instalujemy na serwerze Linux. Uchwyty: operator (jak admin/tech domen) — przy DV
   * dane organizacji nie trafiają do certyfikatu. Metody weryfikacji z przykładów dokumentacji: „dns”, „email”.
   */
  async sslCreateOrder(input: {
    productId: number;
    years: number;
    csr: string;
    hostName: string;
    validation: SslWalidacja;
    approverEmail?: string | null;
  }): Promise<string> {
    const res = await this.request<{ data: { id?: number | string } }>('/v1/ssl/orders', {
      product_id: input.productId,
      period: input.years,
      csr: input.csr,
      software_id: 'linux',
      start_provision: true,
      autorenew: 'off',
      signature_hash_algorithm: 'sha2',
      domain_validation_methods: [{ host_name: input.hostName, method: input.validation }],
      ...(input.validation === 'email' && input.approverEmail ? { approver_email: input.approverEmail } : {}),
      organization_handle: this.operatorHandle,
      technical_handle: this.operatorHandle,
    });
    if (res.data?.id == null) throw new ServiceUnavailableException('Wystawca nie zwrócił numeru zamówienia.');
    return String(res.data.id);
  }

  /** GET /v1/ssl/orders/{id}. Statusy z dokumentacji: ACT, PAI, REQ, REJ, FAI, EXP. */
  async sslOrder(id: string): Promise<SslOrderInfo> {
    const res = await this.request<{ data: OpSslOrder }>(`/v1/ssl/orders/${encodeURIComponent(id)}`, null, 'GET');
    const o = res.data ?? ({} as OpSslOrder);
    const status = (o.status ?? '').toUpperCase();
    const dane = (o.additional_data ?? []).find((d) => d.dns_record && d.dns_value);
    return {
      state: status === 'ACT' && o.certificate ? 'issued' : ['REJ', 'FAI', 'EXP'].includes(status) ? 'failed' : 'pending',
      certificate: o.certificate || null,
      caBundle: o.intermediate_certificate || null,
      dns: dane ? { record: dane.dns_record!, value: dane.dns_value! } : null,
    };
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
      signal: AbortSignal.timeout(OP_TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => null)) as { data?: { token?: string }; desc?: string } | null;
    if (!res.ok || !body?.data?.token) {
      this.logger.warn(`OpenProvider auth failed: ${body?.desc ?? res.status}`);
      throw new ServiceUnavailableException('Rejestr domen jest chwilowo niedostępny — spróbuj za chwilę.');
    }
    this.token = body.data.token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return this.token;
  }

  private async request<T>(path: string, payload: unknown, method = 'POST', timeoutMs = OP_TIMEOUT_MS): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
      },
      body: method === 'GET' || payload == null ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    }).catch((e: unknown) => {
      this.logger.warn(`OpenProvider ${path} failed: ${(e as Error).name === 'TimeoutError' ? 'timeout' : (e as Error).message}`);
      throw new ServiceUnavailableException('Rejestr domen nie odpowiada — spróbuj za chwilę.');
    });
    const body = (await res.json().catch(() => null)) as
      | { data?: T; code?: number; desc?: string }
      | null;
    if (!res.ok || (body && typeof body.code === 'number' && body.code !== 0)) {
      // Przy błędzie OpenProvider daje ogólne `desc` („…see the details below:”), a przyczynę w `data`
      // (odpowiedź API: code, desc, data — https://docs.openprovider.com/doc/all). Bez niej log i audyt były bezużyteczne (D3 06.10, SSL).
      const szczegoly = body?.data == null ? '' : typeof body.data === 'string' ? body.data : JSON.stringify(body.data);
      const msg = `${body?.desc ?? `OpenProvider API ${res.status}`}${szczegoly ? ` ${szczegoly}` : ''}`.slice(0, 800);
      this.logger.warn(`OpenProvider ${path} failed: ${msg}`);
      throw new ServiceUnavailableException(`OpenProvider: ${msg}`);
    }
    return body as unknown as T;
  }
}

/** Bez limitu zawieszone zapytanie trzymało wyszukiwarkę do 504 bramki OpenProvidera (~60 s). */
const OP_TIMEOUT_MS = 30_000;
/**
 * Odczyty (dostępność, ceny): zdrowa odpowiedź ~1,3 s (sandbox 04.10). Paczka + pojedyncze + ceny odnowienia
 * mieszczą się w ~18 s — poniżej budżetu wyszukiwarki w panelu (t1 04.10: przy 8 s panel ucinał po 20 s).
 */
const OP_CHECK_TIMEOUT_MS = 6_000;

interface OpPrice {
  price: number;
  currency: string;
}

interface OpReachableResult {
  domain: string;
  status: string;
  is_premium?: boolean;
  price?: { reseller?: OpPrice; product?: OpPrice };
}

/**
 * Kody stanu domeny OpenProvidera: ACT — aktywna u nas; FAI — nieudana, DEL — usunięta;
 * REQ/PEN/SCH i inne — w toku. Nieznany kod = w toku: lepiej poczekać niż zwrócić pieniądze za
 * transfer, który się udał.
 */
export function stanOpenProvider(kod?: string | null): DomainInfo['state'] {
  const k = (kod ?? '').toUpperCase();
  if (!k) return null;
  if (k === 'ACT') return 'active';
  if (k === 'FAI' || k === 'DEL') return 'failed';
  return 'pending';
}

function splitDomain(domain: string): { name: string; extension: string } {
  const idx = domain.indexOf('.');
  if (idx <= 0) return { name: domain, extension: '' };
  return { name: domain.slice(0, idx), extension: domain.slice(idx + 1) };
}

interface OpSslProduct {
  id: number;
  name?: string;
  brand_name?: string;
  category?: string;
  is_wildcard_supported?: boolean;
  included_domains_count?: number;
  prices?: { period?: number; price?: { reseller?: OpPrice; product?: OpPrice } }[];
}

interface OpSslOrder {
  status?: string;
  certificate?: string;
  intermediate_certificate?: string;
  additional_data?: { dns_record?: string; dns_value?: string }[];
}

interface OpCustomer {
  name?: { first_name?: string; last_name?: string };
  company_name?: string;
  vat?: string;
  address?: { street?: string; number?: string; zipcode?: string; city?: string; country?: string };
  phone?: { country_code?: string; area_code?: string; subscriber_number?: string };
  email?: string;
}

/** Część kontaktu wspólna dla POST i PUT /customers (PUT nie przyjmuje imienia ani firmy). */
export function opKontakt(r: Registrant) {
  const cyfry = r.phone.replace(/\D/g, '');
  return {
    ...(r.vat ? { vat: r.vat } : {}),
    address: { street: r.street, number: r.houseNumber, zipcode: r.zipcode, city: r.city, country: r.country.toUpperCase() },
    // ponytail: numer dzielony na „kierunkowy” = 3 pierwsze cyfry + resztę; OpenProvider wymaga
    // obu pól, a rejestry sklejają je z powrotem. Gdy któryś rejestr odrzuci — libphonenumber.
    phone: { country_code: r.phoneCountryCode, area_code: cyfry.slice(0, 3), subscriber_number: cyfry.slice(3) },
    email: r.email,
  };
}
