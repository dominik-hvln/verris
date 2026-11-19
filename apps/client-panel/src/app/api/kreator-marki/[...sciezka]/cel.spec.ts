import { celGet } from './cel';

/**
 * Paczka 131 – trasa plików Kreatora marki przepuszcza do API tylko znane ścieżki (to nie jest ogólne proxy z tokenem
 * sesji): pliki i ZIP marki, podglądy materiałów i logo, krzywe napisu, pliki krojów z fonts-proxy.
 */
const q = (s = '') => new URLSearchParams(s);

it('dozwolone ścieżki → ścieżka API (z wybranymi parametrami zapytania)', () => {
  expect(celGet(['marki', 'm1', 'pliki', 'logo-poziome-kolor.svg'], q())?.url).toBe('/kreator-marki/marki/m1/pliki/logo-poziome-kolor.svg');
  expect(celGet(['marki', 'm1', 'eksport.zip'], q())).toMatchObject({ url: '/kreator-marki/marki/m1/eksport.zip', trasa: { pobranie: true } });
  expect(celGet(['marki', 'm1', 'logo.svg'], q('uklad=pionowy&wariant=mono&v=3&x=1'))?.url).toBe('/kreator-marki/marki/m1/logo.svg?uklad=pionowy&wariant=mono');
  expect(celGet(['marki', 'm1', 'material', 'post.png'], q('v=1'))?.url).toBe('/kreator-marki/marki/m1/material/post.png');
  expect(celGet(['napis'], q('font=DM+Sans&waga=600&tekst=Ł%C3%B3dka&rozstrzelenie=0&token=x'))?.url).toBe('/kreator-marki/napis?font=DM+Sans&waga=600&tekst=%C5%81%C3%B3dka&rozstrzelenie=0');
  expect(celGet(['fonty', 'fraunces-600-latin-ext.woff2'], q())).toMatchObject({ url: '/fonts/kreator/fraunces-600-latin-ext.woff2', trasa: { publiczna: true } });
});

it('wszystko inne – null (404 w trasie)', () => {
  for (const s of [
    ['marki', 'm1'],
    ['marki', '..', 'pliki', 'x'],
    ['marki', 'm1', 'pliki', '../stan'],
    ['marki', 'm1', 'material', 'hack.svg'],
    ['marki', 'm1', 'ai'],
    ['stan'],
    ['fonty', '../../etc/passwd'],
    ['fonty', 'Fraunces.ttf'],
    ['marki', 'm 1', 'eksport.zip'],
  ]) {
    expect(celGet(s, q())).toBeNull();
  }
});
