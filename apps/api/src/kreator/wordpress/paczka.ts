import type { EksportCms } from '@verris/kreator';
import type { PlikPublikacji } from '../publikacja.js';
import { zbudujZip } from '../zip-strony.js';

/** Największa paczka importu (ZIP: motyw z fontami + treść + zdjęcia) – powyżej klient dostaje komunikat. */
export const MAKS_PACZKI = 120 * 1024 * 1024;

/** Ścieżka w paczce bez wyjścia poza katalog (nazwy pochodzą z eksportu i z API, ale sprawdzamy je i tak). */
const BEZPIECZNA = /^(?!.*(^|\/)\.\.?(\/|$))[A-Za-z0-9._/-]{1,200}$/;

/**
 * Paczka importu do WordPressa (paczka 124): tresc.json (eksport bez treści plików motywu), motyw/ (pliki motywu
 * i fonty w motyw/assets/fonts), media/ (zdjęcia z biblioteki – wariant jpg do 1600 px). Czyta ją importer PHP
 * na węźle (ops/scripts/node-kreator-wp-import.php).
 */
export async function zbudujPaczke(eksport: EksportCms, fonty: Map<string, Buffer>, media: Map<string, Buffer>, data = new Date()): Promise<Buffer> {
  const pliki: PlikPublikacji[] = [];
  const dodaj = (sciezka: string, dane: Buffer, tekst: boolean) => {
    if (!BEZPIECZNA.test(sciezka)) throw new Error(`Paczka: niedozwolona ścieżka ${sciezka}`);
    pliki.push({ sciezka, dane, tekst });
  };
  const { pliki: plikiMotywu, ...motyw } = eksport.motyw;
  dodaj('tresc.json', Buffer.from(JSON.stringify({ ...eksport, motyw }), 'utf8'), true);
  for (const p of plikiMotywu) dodaj(`motyw/${p.sciezka}`, Buffer.from(p.tresc, 'utf8'), true);
  for (const nazwa of eksport.motyw.fonty) {
    const f = fonty.get(nazwa);
    if (f) dodaj(`motyw/assets/fonts/${nazwa}`, f, false);
  }
  for (const m of eksport.media) {
    const d = media.get(m.zasobId);
    if (d) dodaj(`media/${m.nazwaPliku}`, d, false);
  }
  return zbudujZip(pliki, data);
}
