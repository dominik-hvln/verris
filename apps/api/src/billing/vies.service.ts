import { Injectable, Logger } from '@nestjs/common';

/** Wynik sprawdzenia VIES; `wazny: null` = serwis niedostępny, nie wiemy. */
export interface WynikVies {
  wazny: boolean | null;
  kodKraju: string;
  numer: string;
  nazwa: string | null;
  data: string;
  /** Numer konsultacji — dowód sprawdzenia, gdy podaliśmy własny numer VAT. */
  identyfikator: string | null;
  blad: string | null;
}

const URL_VIES = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number';
const TIMEOUT_MS = 8_000;
const CACHE_MS = 24 * 3600 * 1000;

/**
 * M-09 — sprawdzenie numeru VAT-UE w VIES (Komisja Europejska, REST).
 *
 * Adres jest stały (żadnego URL-a od klienta — bez SSRF), host musi być na liście
 * egress (`ops/etc/verris/security/egress-allow-hostnames.txt`). Wynik ważny
 * trzymamy dobę; wyniku „niedostępny” nie trzymamy wcale.
 */
@Injectable()
export class ViesService {
  private readonly logger = new Logger(ViesService.name);
  private readonly cache = new Map<string, { wynik: WynikVies; do: number }>();

  async sprawdz(
    kodKraju: string,
    numer: string,
    pytajacy?: { kodKraju: string; numer: string } | null,
  ): Promise<WynikVies> {
    const klucz = `${kodKraju}${numer}`;
    const c = this.cache.get(klucz);
    if (c && c.do > Date.now()) return c.wynik;

    const data = new Date().toISOString();
    const pusty = (blad: string): WynikVies => ({
      wazny: null, kodKraju, numer, nazwa: null, data, identyfikator: null, blad,
    });
    try {
      const res = await fetch(URL_VIES, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          countryCode: kodKraju,
          vatNumber: numer,
          ...(pytajacy ? { requesterMemberStateCode: pytajacy.kodKraju, requesterNumber: pytajacy.numer } : {}),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return pusty(`HTTP ${res.status}`);
      const j = (await res.json()) as {
        valid?: boolean;
        name?: string | null;
        requestIdentifier?: string | null;
        requestDate?: string;
        userError?: string;
        actionSucceed?: boolean;
      };
      // VIES zgłasza awarie w odpowiedzi 200 (MS_UNAVAILABLE, TIMEOUT…) — to nie jest „nieważny”.
      if (j.actionSucceed === false || (j.userError && j.userError !== 'VALID' && j.userError !== 'INVALID')) {
        return pusty(j.userError ?? 'VIES_ERROR');
      }
      if (typeof j.valid !== 'boolean') return pusty('BRAK_POLA_VALID');
      const wynik: WynikVies = {
        wazny: j.valid,
        kodKraju,
        numer,
        nazwa: j.name && j.name !== '---' ? j.name : null,
        data: j.requestDate ?? data,
        identyfikator: j.requestIdentifier || null,
        blad: null,
      };
      this.cache.set(klucz, { wynik, do: Date.now() + CACHE_MS });
      return wynik;
    } catch (e) {
      this.logger.warn(`VIES ${kodKraju}${numer}: ${(e as Error).message}`);
      return pusty('NIEDOSTEPNY');
    }
  }
}
