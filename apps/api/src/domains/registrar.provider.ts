import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RegistrarAvailability {
  domain: string;
  available: boolean;
  premium?: boolean;
  priceAmount?: string | null;
  currency?: string;
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
  domainInfo(externalId: string): Promise<{ ownerHandle: string | null; locked: boolean | null }>;
  /** A-15 */
  setTransferLock(externalId: string, locked: boolean): Promise<void>;
  /** A-09 — kod do transferu domeny do innego rejestratora. */
  authCode(externalId: string): Promise<string>;
  /** Uchwyt operatora (admin/tech/billing). Abonent nim NIE jest — patrz A-13. */
  readonly operatorHandle?: string;
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

    if (providerId === 'openprovider') {
      const username = this.config.get<string>('OPENPROVIDER_USERNAME');
      const password = this.config.get<string>('OPENPROVIDER_PASSWORD');
      const ownerHandle = this.config.get<string>('OPENPROVIDER_OWNER_HANDLE');
      if (!username || !password || !ownerHandle) {
        throw new ServiceUnavailableException(
          'OpenProvider is not configured (OPENPROVIDER_USERNAME / OPENPROVIDER_PASSWORD / OPENPROVIDER_OWNER_HANDLE).',
        );
      }
      const baseUrl =
        this.config.get<string>('OPENPROVIDER_API_BASE_URL') ?? 'https://api.openprovider.eu';
      return new OpenProviderRegistrarProvider(baseUrl, username, password, ownerHandle);
    }

    const baseUrl = this.config.get<string>('REGISTRAR_API_BASE_URL');
    const token = this.config.get<string>('REGISTRAR_API_TOKEN');
    if (!providerId || !baseUrl || !token) {
      throw new ServiceUnavailableException('Registrar provider is not configured.');
    }
    return new HttpRegistrarProvider(providerId, baseUrl, token);
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

  domainInfo(externalId: string): Promise<{ ownerHandle: string | null; locked: boolean | null }> {
    return this.request(`/domains/${encodeURIComponent(externalId)}`, { method: 'GET' });
  }

  async setTransferLock(externalId: string, locked: boolean): Promise<void> {
    await this.request(`/domains/${encodeURIComponent(externalId)}/lock`, { method: 'POST', body: JSON.stringify({ locked }) });
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
class OpenProviderRegistrarProvider implements RegistrarProvider {
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
    const domains = fqdns.map((fqdn) => {
      const { name, extension } = splitDomain(fqdn);
      return { name, extension };
    });
    const res = await this.request<{ data: { results: OpReachableResult[] } }>(
      '/v1/domains/check',
      { domains, with_price: true },
    );
    const results = res.data?.results ?? [];
    return fqdns.map((fqdn, i) => {
      const result = results[i];
      const price = result?.price?.reseller ?? result?.price?.product;
      return {
        domain: fqdn,
        available: result?.status === 'free',
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
    );
    const price = res.data?.price?.reseller ?? res.data?.price?.product;
    if (!price) {
      throw new ServiceUnavailableException('OpenProvider: brak ceny dla domeny.');
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
      throw new ServiceUnavailableException('OpenProvider: brak ID domeny do odnowienia.');
    }
    const res = await this.request<{ data: { expiration_date?: string } }>(
      `/v1/domains/${encodeURIComponent(input.externalId)}/renew`,
      { period: input.years },
    );
    return {
      provider: this.id,
      providerOrderId: input.externalId,
      externalDomainId: input.externalId,
      expiresAt: res.data?.expiration_date ?? null,
    };
  }

  async createRegistrant(r: Registrant): Promise<string> {
    const res = await this.request<{ data: { handle?: string } }>('/v1/customers', {
      name: { first_name: r.firstName, last_name: r.lastName },
      ...(r.companyName ? { company_name: r.companyName } : {}),
      ...opKontakt(r),
    });
    if (!res.data?.handle) throw new ServiceUnavailableException('OpenProvider: nie zwrócił uchwytu abonenta.');
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

  async domainInfo(externalId: string): Promise<{ ownerHandle: string | null; locked: boolean | null }> {
    const res = await this.request<{ data: { owner_handle?: string; is_locked?: boolean } }>(
      `/v1/domains/${encodeURIComponent(externalId)}`, null, 'GET');
    return { ownerHandle: res.data?.owner_handle ?? null, locked: res.data?.is_locked ?? null };
  }

  async setTransferLock(externalId: string, locked: boolean): Promise<void> {
    await this.request(`/v1/domains/${encodeURIComponent(externalId)}`, { is_locked: locked }, 'PUT');
  }

  async authCode(externalId: string): Promise<string> {
    const res = await this.request<{ data: { auth_code?: string } }>(
      `/v1/domains/${encodeURIComponent(externalId)}/authcode`, null, 'GET');
    if (!res.data?.auth_code) throw new ServiceUnavailableException('OpenProvider: brak kodu transferu.');
    return res.data.auth_code;
  }

  private async ensureToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: this.username, password: this.password }),
    });
    const body = (await res.json().catch(() => null)) as { data?: { token?: string }; desc?: string } | null;
    if (!res.ok || !body?.data?.token) {
      throw new ServiceUnavailableException(`OpenProvider auth failed: ${body?.desc ?? res.status}`);
    }
    this.token = body.data.token;
    this.tokenExpiresAt = Date.now() + 50 * 60 * 1000;
    return this.token;
  }

  private async request<T>(path: string, payload: unknown, method = 'POST'): Promise<T> {
    const token = await this.ensureToken();
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${token}`,
      },
      body: method === 'GET' || payload == null ? undefined : JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as
      | { data?: T; code?: number; desc?: string }
      | null;
    if (!res.ok || (body && typeof body.code === 'number' && body.code !== 0)) {
      const msg = body?.desc ?? `OpenProvider API ${res.status}`;
      this.logger.warn(`OpenProvider ${path} failed: ${msg}`);
      throw new ServiceUnavailableException(`OpenProvider: ${msg}`);
    }
    return body as unknown as T;
  }
}

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

function splitDomain(domain: string): { name: string; extension: string } {
  const idx = domain.indexOf('.');
  if (idx <= 0) return { name: domain, extension: '' };
  return { name: domain.slice(0, idx), extension: domain.slice(idx + 1) };
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
