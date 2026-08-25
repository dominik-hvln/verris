import { readFileSync } from 'fs';
import { join } from 'path';
import {
  kodBleduSieci,
  opiszBladSieci,
} from '../../../client-panel/src/lib/blad-sieci';

/**
 * Panel mówi, CO się stało — a nie „fetch failed".
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-38, wprost z awarii X-37. Przez kilka godzin jedyną informacją, jaką
 * mieliśmy, było zdanie „Usługi: fetch failed" na ekranie klienta. Logi
 * kontenera `client-panel` były w tym czasie PUSTE — `apiFetch` nie zapisywał
 * niczego, a `TypeError: fetch failed` z undici nie mówi nic poza tym, że nie
 * wyszło. Prawdziwa przyczyna, `UND_ERR_CONNECT_TIMEOUT`, leżała piętro niżej
 * w `err.cause.code` i nikt jej nie czytał.
 *
 * Diagnoza kosztowała godziny nie dlatego, że awaria była trudna — była
 * banalna, jeden zły adres bazowy — tylko dlatego, że system nie umiał
 * powiedzieć o sobie prawdy.
 *
 * Drugą połową tej samej sprawy jest brak limitu czasu. `fetch()` bez
 * `signal` dostaje od undici 300 s na same nagłówki. Tyle właśnie dzieliło
 * „jeden kafelek nie działa" od „panel klienta nie działa".
 *
 * CO STRAŻNIK PILNUJE
 * ───────────────────
 * 1. Rozpakowywania przyczyny — `cause.code` przed `name`, bo `fetch`
 *    zawsze opakowuje błąd w bezużyteczny `TypeError`.
 * 2. Tego, że użytkownik nigdy nie zobaczy `fetch failed` ani adresu
 *    wewnętrznego.
 * 3. Tego, że `apiFetch` narzuca budżet czasu, przepuszcza cudzy `signal`
 *    i łapie błąd sieciowy zamiast pozwolić mu uciec surowym.
 */

const PANEL = join(__dirname, '..', '..', '..', 'client-panel', 'src', 'lib');
const ZRODLO_API = readFileSync(join(PANEL, 'api.ts'), 'utf8');

/** Błąd w kształcie, w jakim naprawdę rzuca go undici. */
function bladUndici(kod: string): Error {
  const err = new TypeError('fetch failed');
  (err as Error & { cause?: unknown }).cause = Object.assign(new Error(kod), {
    code: kod,
  });
  return err;
}

describe('panel mówi, co się stało', () => {
  describe('rozpakowanie przyczyny', () => {
    it('schodzi do cause.code, bo TypeError z fetch nie niesie nic', () => {
      expect(kodBleduSieci(bladUndici('UND_ERR_CONNECT_TIMEOUT'))).toBe(
        'UND_ERR_CONNECT_TIMEOUT',
      );
      expect(kodBleduSieci(bladUndici('ECONNREFUSED'))).toBe('ECONNREFUSED');
      expect(kodBleduSieci(bladUndici('EAI_AGAIN'))).toBe('EAI_AGAIN');
    });

    it('czyta name, gdy przyczyny nie ma (AbortSignal.timeout)', () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      expect(kodBleduSieci(err)).toBe('TimeoutError');
    });

    it('nie udaje wiedzy, gdy nic nie wie', () => {
      expect(kodBleduSieci(new TypeError('fetch failed'))).toBe('NIEZNANY');
      expect(kodBleduSieci('cokolwiek')).toBe('NIEZNANY');
      expect(kodBleduSieci(null)).toBe('NIEZNANY');
    });
  });

  describe('komunikat dla użytkownika', () => {
    it('nigdy nie brzmi „fetch failed"', () => {
      const kody = [
        'UND_ERR_CONNECT_TIMEOUT',
        'UND_ERR_HEADERS_TIMEOUT',
        'ECONNREFUSED',
        'ENOTFOUND',
        'EAI_AGAIN',
        'ECONNRESET',
        'CERT_HAS_EXPIRED',
        'COS_CZEGO_NIE_ZNAMY',
      ];
      for (const kod of kody) {
        const { komunikat } = opiszBladSieci(bladUndici(kod));
        expect(komunikat).not.toMatch(/fetch failed/i);
        expect(komunikat.length).toBeGreaterThan(10);
      }
    });

    it('nie wypuszcza adresu wewnętrznego do użytkownika', () => {
      for (const kod of ['ECONNREFUSED', 'UND_ERR_CONNECT_TIMEOUT', 'NIEZNANY']) {
        const { komunikat } = opiszBladSieci(bladUndici(kod), 20_000);
        expect(komunikat).not.toMatch(/http:\/\/|https:\/\/|api:3000/);
      }
    });

    it('odróżnia „nie zdążyło" od „odmówiło" — to dwie różne naprawy', () => {
      const czas = opiszBladSieci(bladUndici('UND_ERR_CONNECT_TIMEOUT'), 20_000);
      expect(czas.czyPrzekroczonyCzas).toBe(true);
      expect(czas.komunikat).toContain('20 s');

      const odmowa = opiszBladSieci(bladUndici('ECONNREFUSED'));
      expect(odmowa.czyPrzekroczonyCzas).toBe(false);
      expect(odmowa.komunikat).not.toBe(czas.komunikat);
    });

    it('dokładnie ten błąd, który widzieliśmy przy X-37, czyta się sensownie', () => {
      const opis = opiszBladSieci(bladUndici('UND_ERR_CONNECT_TIMEOUT'), 20_000);
      expect(opis).toEqual({
        kod: 'UND_ERR_CONNECT_TIMEOUT',
        komunikat: 'API nie odpowiedziało w ciągu 20 s',
        czyPrzekroczonyCzas: true,
      });
    });
  });

  describe('apiFetch nie zostawia zapytania bez limitu', () => {
    it('narzuca budżet czasu', () => {
      expect(ZRODLO_API).toMatch(/AbortSignal\.timeout\(/);
      expect(ZRODLO_API).toMatch(/signal:\s*przerwanie/);
    });

    it('budżet domyślny jest skończony i dodatni', () => {
      const m = ZRODLO_API.match(/return Number\.isFinite\(surowy\).*?:\s*([\d_]+);/s);
      expect(m).not.toBeNull();
      const wartosc = Number(m![1].replace(/_/g, ''));
      expect(Number.isFinite(wartosc)).toBe(true);
      expect(wartosc).toBeGreaterThan(0);
      // Górna granica jest tu celowo: 300 s to domyślne undici, czyli dokładnie
      // to zachowanie, przed którym ten strażnik ma bronić.
      expect(wartosc).toBeLessThan(300_000);
    });

    it('nie odbiera wywołującemu jego własnego signal', () => {
      expect(ZRODLO_API).toMatch(/rest\.signal\s*\?\?/);
    });

    it('łapie błąd sieciowy zamiast pozwolić mu uciec surowym', () => {
      const fetchWTry = /try\s*\{[\s\S]{0,400}?await fetch\(/.test(ZRODLO_API);
      expect(fetchWTry).toBe(true);
      expect(ZRODLO_API).toMatch(/opiszBladSieci\(/);
      expect(ZRODLO_API).toMatch(/console\.error\(/);
      // `status: 0` — umowa „odpowiedzi nie było w ogóle", odróżnialna od 5xx.
      expect(ZRODLO_API).toMatch(/new ApiError\(opis\.komunikat,\s*0,/);
    });
  });
});
