import type { PlikRenderu } from './zaleznosci.js';

/**
 * Podgląd strony w edytorze kreatora. Renderer zwraca osobne pliki (HTML, CSS, JS); podgląd składa je w JEDEN
 * dokument z CSS i JS osadzonymi inline – panel pobiera go z tokenem (Bearer) i pokazuje w ramce, więc nie ma
 * drugiego żądania po zasoby ani publicznego adresu podglądu. Bezpieczeństwo: CSP `sandbox` bez allow-same-origin
 * (skrypty strony działają w nieprzezroczystym originie – bez dostępu do panelu, ciasteczek i API), bez połączeń
 * sieciowych poza fontami z proxy Verris i obrazami https.
 */

/** Pliki HTML podstrony w kolejności prób: '' → index.html; 'o-nas' → o-nas/index.html albo o-nas.html. */
export function sciezkiHtml(podstrona: string): string[] {
  return podstrona === '' ? ['index.html'] : [`${podstrona}/index.html`, `${podstrona}.html`];
}

/** Ścieżka zasobu względem katalogu pliku HTML (bez wychodzenia ponad katalog strony); null = adres zewnętrzny. */
export function rozwiazSciezke(katalogHtml: string, ref: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) return null;
  const bez = ref.split(/[?#]/)[0];
  const czesci = bez.startsWith('/') ? [] : katalogHtml.split('/').filter(Boolean);
  for (const c of bez.split('/')) {
    if (!c || c === '.') continue;
    if (c === '..') {
      if (!czesci.length) return null;
      czesci.pop();
    } else czesci.push(c);
  }
  return czesci.join('/');
}

const atrybut = (tag: string, nazwa: string) => new RegExp(`\\b${nazwa}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
const wartosc = (m: RegExpExecArray | null) => (m ? (m[1] ?? m[2] ?? '') : null);

/** Treść do osadzenia w <style>/<script>: sekwencja zamykająca znacznik nie może wyjść z elementu. */
export const bezpiecznyCss = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');
export const bezpiecznyJs = (js: string) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/**
 * Składa podgląd podstrony: <link rel="stylesheet" href> i <script src></script> wskazujące pliki z renderu
 * zamienia na treść inline. Odwołania zewnętrzne (fonty z proxy) zostają. null = brak HTML tej podstrony.
 */
export function zlozPodglad(pliki: PlikRenderu[], podstrona: string): string | null {
  const mapa = new Map(pliki.map((p) => [p.sciezka.replace(/^\.?\/+/, ''), p.tresc]));
  const sciezka = sciezkiHtml(podstrona).find((s) => mapa.has(s));
  if (!sciezka) return null;
  const katalog = sciezka.includes('/') ? sciezka.slice(0, sciezka.lastIndexOf('/')) : '';
  const plik = (ref: string) => {
    const s = rozwiazSciezke(katalog, ref);
    return s !== null ? mapa.get(s) : undefined;
  };

  return (mapa.get(sciezka) as string)
    .replace(/<link\b[^>]*>/gi, (tag) => {
      const rel = wartosc(atrybut(tag, 'rel'));
      const href = wartosc(atrybut(tag, 'href'));
      if (!rel || !/\bstylesheet\b/i.test(rel) || href === null) return tag;
      const css = plik(href);
      return css === undefined ? tag : `<style>${bezpiecznyCss(css)}</style>`;
    })
    .replace(/<script\b([^>]*)>\s*<\/script>/gi, (tag, atrybuty: string) => {
      const src = wartosc(atrybut(atrybuty, 'src'));
      if (src === null) return tag;
      const js = plik(src);
      if (js === undefined) return tag;
      if (wartosc(atrybut(atrybuty, 'type')) === 'module') return `<script type="module">${bezpiecznyJs(js)}</script>`;
      // `defer` nie działa na skryptach inline – kod z <head> czekałby na nic i nie znalazł elementów strony.
      const tresc = /\bdefer\b/i.test(atrybuty) ? `document.addEventListener('DOMContentLoaded',function(){\n${js}\n});` : js;
      return `<script>${bezpiecznyJs(tresc)}</script>`;
    });
}

/** Nagłówki odpowiedzi podglądu. `bazaFontow` – publiczny adres proxy fontów (…/fonts). */
export function naglowkiPodgladu(bazaFontow: string): Record<string, string> {
  const fonty = URL.canParse(bazaFontow) ? new URL(bazaFontow).origin : '';
  const csp = [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    `style-src 'unsafe-inline'${fonty ? ` ${fonty}` : ''}`,
    `font-src data:${fonty ? ` ${fonty}` : ''}`,
    'img-src data: https:',
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ');
  return {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': csp,
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
}
