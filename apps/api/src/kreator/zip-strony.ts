import * as archiver from 'archiver';
import type { PlikPublikacji } from './publikacja.js';

/**
 * ZIP strony z kreatora (paczka 121): te same pliki co publikacja na domenę (render + fonty). archiver jest już
 * zależnością API (eksport RODO, data-export.service.ts); archiver 8 – klasy zamiast `create()`.
 * Daty plików stałe (data publikacji), żeby to samo wejście dawało ten sam ZIP.
 */
export function zbudujZip(pliki: PlikPublikacji[], data = new Date()): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
    const kawalki: Buffer[] = [];
    archive.on('data', (k: Buffer) => kawalki.push(k));
    archive.on('error', reject);
    archive.on('end', () => resolve(Buffer.concat(kawalki)));
    for (const p of pliki) archive.append(p.dane, { name: p.sciezka, date: data });
    void archive.finalize();
  });
}

/** Nazwa pliku ZIP z nazwy strony: ASCII, bez znaków spoza [a-z0-9-]. */
export function nazwaZip(nazwaStrony: string): string {
  const z = nazwaStrony
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${z || 'strona'}.zip`;
}

/** README.txt w ZIP strony – jak działa formularz kontaktowy poza Verris. */
export function readmeZip(formularzAktywny: boolean): string {
  return [
    'Strona zbudowana w Verris Kreator – statyczne pliki HTML, CSS i JS. Wgraj całą zawartość do katalogu strony na serwerze WWW.',
    '',
    formularzAktywny
      ? 'Formularz kontaktowy wysyła wiadomości przez serwer Verris (na e-mail z ustawień strony, a gdy go brak – na e-mail konta) i działa, dopóki strona jest opublikowana w Verris Kreator.'
      : 'Formularz kontaktowy zacznie działać po opublikowaniu strony na domenie w Verris Kreator i ponownym pobraniu pliku ZIP.',
    '',
  ].join('\r\n');
}
