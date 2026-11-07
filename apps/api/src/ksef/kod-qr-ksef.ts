import { createHash } from 'crypto';
import * as qrcodeModul from 'qrcode';

/**
 * KOD I (weryfikacja faktury w KSeF) — wyłącznie wg oficjalnej specyfikacji MF:
 * https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md (stan: 21.08.2025)
 *
 *  - link: `{adres QR środowiska}/invoice/{NIP sprzedawcy}/{P_1 jako DD-MM-RRRR}/{SHA-256 pliku faktury w Base64URL}`,
 *  - skrót liczony z PLIKU faktury — dokładnie tych bajtów XML, które poszły do KSeF
 *    (ten sam skrót co `invoiceHash` w wysyłce, tylko w Base64URL zamiast Base64),
 *  - kod zgodny z ISO/IEC 18004:2024 (biblioteka `qrcode` — implementacja normy ISO/IEC 18004),
 *  - pod kodem: numer KSeF, gdy znany; „OFFLINE”, gdy numeru jeszcze nie ma.
 *
 * KOD II (faktura offline) — od 2026-11-07, `linkKoduII` niżej: link do weryfikacji certyfikatu KSeF
 * typu Offline wystawcy, podpisany jego kluczem prywatnym (kody-qr.md, „2. KOD II”).
 */

export type SrodowiskoKsef = 'test' | 'demo' | 'prod';

/** Adresy QR dla środowisk — tabela „Środowiska” w kody-qr.md. */
export const ADRES_QR_KSEF: Record<SrodowiskoKsef, string> = {
  test: 'https://qr-test.ksef.mf.gov.pl',
  demo: 'https://qr-demo.ksef.mf.gov.pl',
  prod: 'https://qr.ksef.mf.gov.pl',
};

/** Napis pod kodem, gdy numer KSeF nie jest jeszcze nadany (kody-qr.md, „Oznaczenie pod kodem QR”). */
export const PODPIS_QR_BEZ_NUMERU = 'OFFLINE';

export function normalizujSrodowiskoKsef(v: string | null | undefined): SrodowiskoKsef {
  return v === 'prod' || v === 'demo' ? v : 'test';
}

/** SHA-256 pliku faktury w Base64URL (bez dopełnienia `=`), liczony z bajtów UTF-8. */
export function skrotFakturyBase64Url(xml: string | Uint8Array): string {
  const bajty = typeof xml === 'string' ? Buffer.from(xml, 'utf8') : xml;
  return createHash('sha256').update(bajty).digest('base64url');
}

/** `RRRR-MM-DD` (P_1 w FA(3)) albo już `DD-MM-RRRR` → `DD-MM-RRRR`. */
function dataDoLinku(data: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  if (/^\d{2}-\d{2}-\d{4}$/.test(data)) return data;
  throw new Error(`Data wystawienia do kodu QR musi mieć postać RRRR-MM-DD albo DD-MM-RRRR (jest: ${data}).`);
}

/**
 * Link KOD I. `dataWystawienia` to wartość pola P_1 z XML-a (RRRR-MM-DD) — nie `Date`, żeby strefa
 * czasowa serwera nie mogła przesunąć dnia względem tego, co jest w wysłanej fakturze.
 */
export function linkWeryfikacjiKsef(
  env: SrodowiskoKsef,
  nipSprzedawcy: string,
  dataWystawienia: string,
  hashBase64Url: string,
): string {
  const nip = nipSprzedawcy.replace(/\D/g, '');
  if (!/^\d{10}$/.test(nip)) throw new Error(`NIP sprzedawcy do kodu QR musi mieć 10 cyfr (jest: ${nipSprzedawcy}).`);
  // SHA-256 = 32 bajty = 43 znaki Base64URL bez dopełnienia.
  if (!/^[A-Za-z0-9_-]{43}$/.test(hashBase64Url)) {
    throw new Error('Skrót faktury do kodu QR musi być SHA-256 w Base64URL (43 znaki).');
  }
  return `${ADRES_QR_KSEF[env]}/invoice/${nip}/${dataDoLinku(dataWystawienia)}/${hashBase64Url}`;
}

/** NIP sprzedawcy (Podmiot1) i data wystawienia (P_1) z zapisanego pliku FA(3) — do linków KOD I/II. */
export function daneLinkuZPliku(xml: string): { nipSprzedawcy: string; dataWystawienia: string } {
  const nip = /<Podmiot1>[\s\S]*?<NIP>(\d{10})<\/NIP>/.exec(xml)?.[1];
  const p1 = /<P_1>(\d{4}-\d{2}-\d{2})<\/P_1>/.exec(xml)?.[1];
  if (!nip || !p1) throw new Error('Plik faktury bez NIP sprzedawcy (Podmiot1) albo daty wystawienia (P_1).');
  return { nipSprzedawcy: nip, dataWystawienia: p1 };
}

/** Napis pod KODEM II (kody-qr.md, „Oznaczenie pod kodem QR” w części KOD II). */
export const PODPIS_QR_CERTYFIKAT = 'CERTYFIKAT';

export interface DaneKoduII {
  /** Typ identyfikatora kontekstu logowania — panel loguje się zawsze kontekstem NIP. */
  typKontekstu: 'Nip';
  /** Wartość identyfikatora kontekstu (NIP, w którego kontekście panel wysyła faktury). */
  kontekst: string;
  nipSprzedawcy: string;
  /** Numer seryjny certyfikatu KSeF typu Offline (szesnastkowo, jak w przykładzie MF). */
  numerSeryjny: string;
  /** SHA-256 pliku faktury w Base64URL — ten sam skrót co w KODZIE I. */
  skrot: string;
}

/**
 * Ciąg podpisywany w KODZIE II: ścieżka linku bez `https://` i bez końcowego `/`
 * (kody-qr.md, „Format podpisu”), np.
 * `qr-test.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/UtQp…`.
 */
export function trescDoPodpisuKoduII(env: SrodowiskoKsef, d: DaneKoduII): string {
  const kontekst = d.kontekst.replace(/\D/g, '');
  const nip = d.nipSprzedawcy.replace(/\D/g, '');
  if (!/^\d{10}$/.test(kontekst) || !/^\d{10}$/.test(nip)) {
    throw new Error('KOD II: NIP kontekstu i NIP sprzedawcy muszą mieć po 10 cyfr.');
  }
  if (!/^[0-9A-F]+$/.test(d.numerSeryjny)) throw new Error('KOD II: numer seryjny certyfikatu musi być szesnastkowy (wielkie litery).');
  if (!/^[A-Za-z0-9_-]{43}$/.test(d.skrot)) throw new Error('KOD II: skrót faktury musi być SHA-256 w Base64URL (43 znaki).');
  const host = ADRES_QR_KSEF[env].replace(/^https:\/\//, '');
  return `${host}/certificate/${d.typKontekstu}/${kontekst}/${nip}/${d.numerSeryjny}/${d.skrot}`;
}

/** Link KOD II = `https://` + podpisywany ciąg + `/` + podpis w Base64URL. */
export function linkKoduII(env: SrodowiskoKsef, d: DaneKoduII, podpisz: (dane: Buffer) => Buffer): string {
  const tresc = trescDoPodpisuKoduII(env, d);
  return `https://${tresc}/${podpisz(Buffer.from(tresc, 'utf8')).toString('base64url')}`;
}

/** Macierz modułów QR (true = ciemny) — rysowana wektorowo w PDF, bez rastra. */
export interface MacierzQr {
  rozmiar: number;
  ciemny(wiersz: number, kolumna: number): boolean;
}

type UtworzQr = (typeof import('qrcode'))['create'];

/**
 * `qrcode` to paczka CommonJS — jak przy `@pdf-lib/fontkit` (common/pdf/czcionki.ts) ten sam
 * import ma w Node ESM i w bundlerze obrazu produkcyjnego dwa kształty: `create` wprost albo
 * pod `default`. Bierzemy ten, który jest, zamiast zakładać jeden.
 */
export function utworzQrZModulu(modul: unknown): UtworzQr {
  const m = modul as { create?: unknown; default?: { create?: unknown } };
  if (typeof m?.create === 'function') return m.create as UtworzQr;
  if (typeof m?.default?.create === 'function') return m.default.create as UtworzQr;
  throw new Error('qrcode: brak funkcji create – nieznany kształt modułu');
}

export function macierzQr(tresc: string): MacierzQr {
  // Poziom korekcji M — domyślny w bibliotece i wystarczający dla wydruku/ekranu.
  const kod = utworzQrZModulu(qrcodeModul)(tresc, { errorCorrectionLevel: 'M' });
  const { size, data } = kod.modules;
  return { rozmiar: size, ciemny: (w, k) => data[w * size + k] === 1 };
}
