import { createHash } from 'crypto';
import {
  ADRES_QR_KSEF,
  linkWeryfikacjiKsef,
  macierzQr,
  normalizujSrodowiskoKsef,
  skrotFakturyBase64Url,
  utworzQrZModulu,
} from './kod-qr-ksef.js';

/** Przykład z https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md („Generowanie linku”). */
const PRZYKLAD_MF = 'https://qr-test.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE';

describe('KSeF 12.10 — KOD I (link weryfikacyjny)', () => {
  it('daje dokładnie link z przykładu w dokumentacji MF (TE)', () => {
    expect(linkWeryfikacjiKsef('test', '1111111111', '01-02-2026', 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE')).toBe(PRZYKLAD_MF);
  });

  it('P_1 z XML-a (RRRR-MM-DD) zamienia na DD-MM-RRRR', () => {
    expect(linkWeryfikacjiKsef('test', '1111111111', '2026-02-01', 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE')).toBe(PRZYKLAD_MF);
  });

  it('adres zależy od środowiska KSeF z ustawień admina', () => {
    const h = 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE';
    expect(linkWeryfikacjiKsef('demo', '1111111111', '2026-02-01', h)).toBe(`https://qr-demo.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/${h}`);
    expect(linkWeryfikacjiKsef('prod', '1111111111', '2026-02-01', h)).toBe(`https://qr.ksef.mf.gov.pl/invoice/1111111111/01-02-2026/${h}`);
    expect(ADRES_QR_KSEF.test).toBe('https://qr-test.ksef.mf.gov.pl');
  });

  it('nieznane środowisko = test (nigdy produkcja z literówki)', () => {
    expect(normalizujSrodowiskoKsef('prod')).toBe('prod');
    expect(normalizujSrodowiskoKsef('demo')).toBe('demo');
    expect(normalizujSrodowiskoKsef('PROD')).toBe('test');
    expect(normalizujSrodowiskoKsef(null)).toBe('test');
  });

  it('odrzuca zły NIP, złą datę i skrót, który nie jest SHA-256 w Base64URL', () => {
    const h = 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE';
    expect(() => linkWeryfikacjiKsef('test', '123', '2026-02-01', h)).toThrow(/NIP/);
    expect(() => linkWeryfikacjiKsef('test', '1111111111', '2026/02/01', h)).toThrow(/Data/);
    expect(() => linkWeryfikacjiKsef('test', '1111111111', '2026-02-01', 'UtQp9Gpc51y+u3xApZjIjgkpZ01js+J8KflSPW8WzIE=')).toThrow(/Base64URL/);
  });

  it('skrót = SHA-256 bajtów UTF-8 pliku, w Base64URL bez dopełnienia', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?><Faktura>zażółć</Faktura>';
    const oczekiwany = createHash('sha256').update(Buffer.from(xml, 'utf8')).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(skrotFakturyBase64Url(xml)).toBe(oczekiwany);
    expect(skrotFakturyBase64Url(Buffer.from(xml, 'utf8'))).toBe(oczekiwany);
    expect(oczekiwany).toHaveLength(43);
  });
});

describe('KSeF 12.10 — macierz kodu QR', () => {
  it('kod dla linku KOD I: kwadratowa macierz z wzorcami pozycyjnymi w trzech rogach (ISO/IEC 18004)', () => {
    const m = macierzQr(PRZYKLAD_MF);
    expect(m.rozmiar).toBeGreaterThanOrEqual(21);
    expect((m.rozmiar - 17) % 4).toBe(0); // rozmiar = 17 + 4 × wersja
    // Wzorzec pozycyjny 7×7: ciemna ramka, jasny pierścień, ciemny środek 3×3.
    for (const [w0, k0] of [[0, 0], [0, m.rozmiar - 7], [m.rozmiar - 7, 0]]) {
      expect(m.ciemny(w0, k0)).toBe(true);
      expect(m.ciemny(w0 + 1, k0 + 1)).toBe(false);
      expect(m.ciemny(w0 + 3, k0 + 3)).toBe(true);
    }
  });

  it('import CommonJS: `create` wprost albo pod `default` (kształt zależny od bundlera)', () => {
    const create = () => null;
    expect(utworzQrZModulu({ create })).toBe(create);
    expect(utworzQrZModulu({ default: { create } })).toBe(create);
    expect(() => utworzQrZModulu({})).toThrow(/create/);
  });
});
