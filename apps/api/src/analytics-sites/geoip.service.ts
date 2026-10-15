import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { gunzipSync } from 'zlib';
import { krajDlaIp, liczbaZakresow, zbudujTablice, type TablicaKrajow } from './geoip-dbip.js';

/** Pełna baza ma kilkaset tysięcy zakresów — mniej to uszkodzony plik; zostaje poprzednia tablica. */
export const MIN_ZAKRESOW = 100_000;

/** Plik miesięczny DB-IP Lite (https://db-ip.com/db/download/ip-to-country-lite) — CSV skompresowany gzip. */
export function adresPlikuDbip(d: Date): string {
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `https://download.db-ip.com/free/dbip-country-lite-${d.getUTCFullYear()}-${m}.csv.gz`;
}

/**
 * Decyzja 15.10 (#16) — kraj odwiedzającego z DB-IP Lite, w pamięci API. Plik pobierany przy starcie (z pamięci
 * podręcznej na dysku, jeśli jest) i raz w miesiącu; na początku miesiąca, zanim DB-IP opublikuje nowy plik —
 * plik z poprzedniego miesiąca. Bez bazy (błąd pobrania, GEOIP_DBIP=0) kraj zostaje pusty, jak dotąd.
 * Ruch wychodzący: download.db-ip.com (ops/etc/verris/security/egress-allow-hostnames.txt).
 */
@Injectable()
export class GeoIpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GeoIpService.name);
  private tablica: TablicaKrajow | null = null;

  constructor(private readonly config: ConfigService) {}

  private wlaczone(): boolean {
    return (this.config.get<string>('GEOIP_DBIP') ?? '1') !== '0';
  }

  onApplicationBootstrap(): void {
    if (!this.wlaczone() || process.env.NODE_ENV === 'test') return;
    void this.odswiez();
  }

  /** Kod kraju (ISO-2) albo null — bez bazy, dla adresu prywatnego albo spoza bazy. */
  kraj(ip: string | null | undefined): string | null {
    return this.tablica && ip ? krajDlaIp(this.tablica, ip) : null;
  }

  /** 3. dnia miesiąca 04:17 UTC (DB-IP publikuje plik na początku miesiąca). */
  @Cron('17 4 3 * *', { name: 'geoip:dbip' })
  async odswiez(teraz: Date = new Date()): Promise<number | null> {
    if (!this.wlaczone()) return null;
    const poprzedni = new Date(Date.UTC(teraz.getUTCFullYear(), teraz.getUTCMonth() - 1, 1));
    for (const miesiac of [teraz, poprzedni]) {
      try {
        const gz = await this.plik(adresPlikuDbip(miesiac));
        if (!gz) continue;
        const t = zbudujTablice(gunzipSync(gz).toString('utf8'));
        const n = liczbaZakresow(t);
        if (n < MIN_ZAKRESOW) {
          this.logger.warn(`GeoIP DB-IP: tylko ${n} zakresów w ${adresPlikuDbip(miesiac)} — pomijam`);
          continue;
        }
        this.tablica = t;
        this.logger.log(`GeoIP DB-IP: ${n} zakresów (${adresPlikuDbip(miesiac).split('/').pop()})`);
        return n;
      } catch (e) {
        this.logger.warn(`GeoIP DB-IP (${adresPlikuDbip(miesiac)}): ${(e as Error).message}`);
      }
    }
    return null;
  }

  /** Plik z pamięci podręcznej na dysku albo pobrany (i zapisany do pamięci podręcznej, best-effort). */
  private async plik(url: string): Promise<Buffer | null> {
    const katalog = this.config.get<string>('GEOIP_KATALOG') || join(tmpdir(), 'verris-geoip');
    const sciezka = join(katalog, url.split('/').pop()!);
    const zDysku = await readFile(sciezka).catch(() => null);
    if (zDysku?.length) return zDysku;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      if (res.status !== 404) this.logger.warn(`GeoIP DB-IP: HTTP ${res.status} dla ${url}`);
      return null;
    }
    const gz = Buffer.from(await res.arrayBuffer());
    await mkdir(katalog, { recursive: true })
      .then(() => writeFile(sciezka, gz))
      .catch((e: Error) => this.logger.warn(`GeoIP DB-IP: pamięć podręczna ${sciezka}: ${e.message}`));
    return gz;
  }
}
