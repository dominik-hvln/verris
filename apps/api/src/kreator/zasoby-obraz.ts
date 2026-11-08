import { createHash } from 'node:crypto';
import sharp, { type Metadata, type OutputInfo } from 'sharp';
import { szerokosciWariantow } from '@verris/kreator';

/**
 * Verris Kreator – przetwarzanie zdjęć biblioteki (paczka 122). Wejście: plik od klienta albo pobrany od dostawcy
 * biblioteki. Typ rozpoznajemy PO ZAWARTOŚCI (sygnatura pliku), nie po rozszerzeniu ani Content-Type.
 *
 * sharp 0.35 z gotową libvips (@img/sharp-<platforma>, bez skryptu instalacyjnego – pnpm allowBuilds go nie
 * potrzebuje) czyta JPEG, PNG, WebP, AVIF (libheif z dekoderem AV1/aom). HEIC (HEVC) w gotowych binarkach NIE MA
 * (licencje patentowe) – zdjęcia z iPhone'a w HEIC odrzucamy czytelnym komunikatem. SVG odrzucamy zawsze (skrypty).
 *
 * Wynik: oryginał znormalizowany (autoobrót wg EXIF, sRGB, bez metadanych – EXIF/GPS/XMP znikają, bo sharp nie
 * przepisuje metadanych bez `keepMetadata`/`withMetadata`; najdłuższy bok ≤ 4096 px) w WebP i warianty
 * webp + jpg w szerokościach z `szerokosciWariantow` (@verris/kreator – te same liczy renderer srcset).
 */

export const MAKS_BAJTOW_WEJSCIA = 15 * 1024 * 1024;
export const MAKS_PIKSELI = 40_000_000;
/** Najdłuższy bok oryginału po normalizacji (WebP ma limit 16383 px; warianty kończą się na 2400). */
export const MAKS_BOK_ORYGINALU = 4096;
/** Jednocześnie przetwarzane zdjęcia w jednym procesie API (pamięć: 40 Mpx ≈ 160 MB nieskompresowane). */
export const ROWNOLEGLE_PRZETWARZANIE = 2;

export type TypObrazu = 'jpeg' | 'png' | 'webp' | 'avif';

export class BladObrazu extends Error {}

const BLAD_TYPU = 'Ten plik nie jest obsługiwanym zdjęciem. Wgraj JPEG, PNG, WebP albo AVIF.';

/** Rozpoznanie typu po sygnaturze. Rzuca BladObrazu z komunikatem dla klienta (SVG, HEIC, inne). */
export function rozpoznajTyp(buf: Buffer): TypObrazu {
  if (buf.length < 12) throw new BladObrazu(BLAD_TYPU);
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    // ISO BMFF: marka główna + marki zgodne (do końca pudełka ftyp).
    const dl = Math.min(buf.readUInt32BE(0), buf.length, 256);
    const marki = [buf.toString('latin1', 8, 12)];
    for (let i = 16; i + 4 <= dl; i += 4) marki.push(buf.toString('latin1', i, i + 4));
    if (marki.some((m) => m === 'avif' || m === 'avis')) return 'avif';
    if (marki.some((m) => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(m))) {
      throw new BladObrazu('Zdjęcia HEIC (iPhone) nie są obsługiwane. Zapisz zdjęcie jako JPEG – na iPhonie: Ustawienia → Aparat → Formaty → Najbardziej zgodne.');
    }
    throw new BladObrazu(BLAD_TYPU);
  }
  const poczatek = buf.toString('utf8', 0, Math.min(buf.length, 1024)).replace(/^﻿/, '').trimStart().toLowerCase();
  if (poczatek.startsWith('<') && /<svg[\s>]/.test(poczatek + buf.toString('utf8', 1024, Math.min(buf.length, 8192)).toLowerCase())) {
    throw new BladObrazu('Pliki SVG nie są obsługiwane – wgraj zdjęcie w JPEG, PNG, WebP albo AVIF.');
  }
  throw new BladObrazu(BLAD_TYPU);
}

export interface Wariant {
  szerokosc: number;
  format: 'webp' | 'jpg';
  dane: Buffer;
}

export interface PrzetworzonyObraz {
  typ: TypObrazu;
  /** Skrót sha256 pliku wejściowego (to samo zdjęcie wgrane drugi raz = ten sam zasób). */
  sha256: string;
  szerokosc: number;
  wysokosc: number;
  oryginal: Buffer;
  warianty: Wariant[];
  /** Suma bajtów oryginału i wariantów (limit miejsca na konto). */
  bajty: number;
}

let trwa = 0;
const kolejka: (() => void)[] = [];
async function wSemaforze<T>(fn: () => Promise<T>): Promise<T> {
  if (trwa >= ROWNOLEGLE_PRZETWARZANIE) await new Promise<void>((r) => kolejka.push(r));
  trwa++;
  try {
    return await fn();
  } finally {
    trwa--;
    kolejka.shift()?.();
  }
}

/** Przetwarza zdjęcie: walidacja, normalizacja, warianty. Rzuca BladObrazu (komunikat po polsku dla klienta). */
export function przetworzObraz(wejscie: Buffer): Promise<PrzetworzonyObraz> {
  if (!wejscie?.length) return Promise.reject(new BladObrazu('Plik jest pusty.'));
  if (wejscie.length > MAKS_BAJTOW_WEJSCIA) {
    return Promise.reject(new BladObrazu(`Zdjęcie jest za duże (${(wejscie.length / 1048576).toFixed(1)} MB, limit ${MAKS_BAJTOW_WEJSCIA / 1048576} MB).`));
  }
  let typ: TypObrazu;
  try {
    typ = rozpoznajTyp(wejscie);
  } catch (e) {
    return Promise.reject(e);
  }
  return wSemaforze(async () => {
    const opcje = { limitInputPixels: MAKS_PIKSELI, failOn: 'error' as const };
    let meta: Metadata;
    try {
      // Sam nagłówek (bez dekodowania) – limit pikseli sprawdzamy niżej, żeby odmowa miała właściwy komunikat.
      meta = await sharp(wejscie, { limitInputPixels: false, failOn: 'error' }).metadata();
    } catch {
      throw new BladObrazu('Nie udało się odczytać zdjęcia – plik jest uszkodzony albo w nieobsługiwanym formacie.');
    }
    const w0 = meta.width ?? 0;
    const h0 = meta.height ?? 0;
    if (!w0 || !h0) throw new BladObrazu('Nie udało się odczytać wymiarów zdjęcia.');
    if (w0 * h0 > MAKS_PIKSELI) {
      throw new BladObrazu(`Zdjęcie ma za dużą rozdzielczość (${Math.round((w0 * h0) / 1e6)} Mpx, limit ${MAKS_PIKSELI / 1e6} Mpx).`);
    }
    // Zawartość musi zgadzać się z sygnaturą (np. AVIF to 'heif' z kompresją av1).
    const zgodny = meta.format === typ || (typ === 'avif' && meta.format === 'heif');
    if (!zgodny) throw new BladObrazu(BLAD_TYPU);

    let oryginal: { data: Buffer; info: OutputInfo };
    try {
      oryginal = await sharp(wejscie, opcje)
        .rotate()
        .resize({ width: MAKS_BOK_ORYGINALU, height: MAKS_BOK_ORYGINALU, fit: 'inside', withoutEnlargement: true })
        .toColourspace('srgb')
        .webp({ quality: 90 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw new BladObrazu('Nie udało się przetworzyć zdjęcia – plik jest uszkodzony albo w nieobsługiwanym formacie.');
    }
    const szerokosc = oryginal.info.width;
    const wysokosc = oryginal.info.height;
    const warianty: Wariant[] = [];
    for (const s of szerokosciWariantow(szerokosc)) {
      const baza = () => sharp(oryginal.data).resize({ width: s, withoutEnlargement: true });
      warianty.push({ szerokosc: s, format: 'webp', dane: await baza().webp({ quality: 80 }).toBuffer() });
      warianty.push({ szerokosc: s, format: 'jpg', dane: await baza().flatten({ background: '#ffffff' }).jpeg({ quality: 80, mozjpeg: true, progressive: true }).toBuffer() });
    }
    const bajty = oryginal.data.length + warianty.reduce((a, w) => a + w.dane.length, 0);
    return { typ, sha256: createHash('sha256').update(wejscie).digest('hex'), szerokosc, wysokosc, oryginal: oryginal.data, warianty, bajty };
  });
}

/** Klucze obiektów zasobu w magazynie (bucket KREATOR_ZASOBY). */
export const kluczOryginalu = (userId: string, id: string) => `${userId}/${id}/oryginal.webp`;
export const kluczWariantu = (userId: string, id: string, szer: number, format: 'webp' | 'jpg') => `${userId}/${id}/${szer}.${format}`;
