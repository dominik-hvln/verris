import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { parseDomainPricingConfig } from './domain-pricing.util';

export interface NbpFxSnapshot {
  usdPln: number;
  eurPln: number;
  source: 'nbp' | 'env';
  nbpTableNo: string | null;
  nbpEffectiveDate: string | null;
  fetchedAt: string;
}

interface NbpTableAResponse {
  table: string;
  no: string;
  effectiveDate: string;
  rates: Array<{ code: string; mid: number }>;
}

const NBP_TABLE_A_URL = 'https://api.nbp.pl/api/exchangerates/tables/a/last/?format=json';
const DEFAULT_MAX_AGE_MS = 4 * 60 * 60 * 1000;

@Injectable()
export class NbpFxService {
  private readonly logger = new Logger(NbpFxService.name);
  private cache: NbpFxSnapshot | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Rates for domain billing — NBP table A when enabled, env fallback on failure. */
  async getRates(): Promise<NbpFxSnapshot> {
    if (!this.isNbpEnabled()) {
      return this.envFallback('env');
    }

    const maxAgeMs = this.maxAgeMs();
    if (this.cache && Date.now() - Date.parse(this.cache.fetchedAt) < maxAgeMs) {
      return this.cache;
    }

    try {
      const snapshot = await this.fetchFromNbp();
      this.cache = snapshot;
      return snapshot;
    } catch (err) {
      this.logger.warn(
        `NBP FX fetch failed, using env fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      if (this.cache) {
        return this.cache;
      }
      return this.envFallback('env');
    }
  }

  /** NBP publikuje tabelę A w dni robocze ok. 12:15 — odświeżamy w tle. */
  @Cron('15 11-14 * * 1-5', { name: 'domains:nbp-fx-refresh' })
  async refreshScheduled(): Promise<void> {
    if (!this.isNbpEnabled()) return;
    try {
      this.cache = await this.fetchFromNbp();
      this.logger.log(
        `NBP FX refreshed USD=${this.cache.usdPln} EUR=${this.cache.eurPln} (${this.cache.nbpEffectiveDate})`,
      );
    } catch (err) {
      this.logger.warn(
        `Scheduled NBP FX refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private isNbpEnabled(): boolean {
    const raw = (this.config.get<string>('DOMAIN_FX_NBP_ENABLED') ?? 'true').trim().toLowerCase();
    return raw !== '0' && raw !== 'false' && raw !== 'no';
  }

  private maxAgeMs(): number {
    const raw = Number.parseInt(this.config.get<string>('DOMAIN_FX_NBP_MAX_AGE_MS') ?? '', 10);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_MS;
  }

  private envFallback(source: 'env'): NbpFxSnapshot {
    const cfg = parseDomainPricingConfig((key) => this.config.get<string>(key));
    return {
      usdPln: cfg.usdPln,
      eurPln: cfg.eurPln,
      source,
      nbpTableNo: null,
      nbpEffectiveDate: null,
      fetchedAt: new Date().toISOString(),
    };
  }

  private async fetchFromNbp(): Promise<NbpFxSnapshot> {
    const res = await fetch(NBP_TABLE_A_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`NBP HTTP ${res.status}`);
    }

    const json = (await res.json()) as NbpTableAResponse[];
    const table = json[0];
    if (!table?.rates?.length) {
      throw new Error('NBP: empty table A response');
    }

    const usd = table.rates.find((r) => r.code === 'USD')?.mid;
    const eur = table.rates.find((r) => r.code === 'EUR')?.mid;
    if (!usd || !eur) {
      throw new Error('NBP: missing USD or EUR in table A');
    }

    return {
      usdPln: usd,
      eurPln: eur,
      source: 'nbp',
      nbpTableNo: table.no ?? null,
      nbpEffectiveDate: table.effectiveDate ?? null,
      fetchedAt: new Date().toISOString(),
    };
  }
}
