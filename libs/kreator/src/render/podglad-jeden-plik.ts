/**
 * Podgląd strony kreatora jako JEDEN dokument (paczka 123 – wspólne dla API i panelu; wcześniej dwie kopie:
 * apps/api/src/kreator/podglad.ts i apps/client-panel/src/app/api/kreator/podglad/sklad.ts).
 *
 * Renderer zwraca osobne pliki (HTML, CSS, JS); podgląd składa je w jeden dokument z CSS i JS osadzonymi inline –
 * ramka nie wysyła drugiego żądania po zasoby i nie ma publicznego adresu podglądu. Bezpieczeństwo: CSP `sandbox`
 * bez allow-same-origin (skrypty strony w nieprzezroczystym originie – bez dostępu do panelu, ciasteczek i API),
 * bez połączeń sieciowych poza fontami z proxy Verris i obrazami https.
 *
 * Moduł serwerowy: eksport tylko z pełnego wejścia `@verris/kreator` (render/index.ts), NIE z klient.ts
 * (strażnik apps/client-panel/src/lib/bundel-klienta.spec.ts).
 */

/** Plik z renderu (ścieżka względem korzenia strony i treść tekstowa). */
export interface PlikPodgladu {
  sciezka: string;
  tresc: string;
}

/** Pliki HTML podstrony w kolejności prób: '' → index.html; 'o-nas' → o-nas/index.html albo o-nas.html. */
export function sciezkiHtml(podstrona: string): string[] {
  return podstrona === '' ? ['index.html'] : [`${podstrona}/index.html`, `${podstrona}.html`];
}

/** Ścieżka zasobu względem katalogu pliku HTML (bez wychodzenia ponad katalog strony); null = adres zewnętrzny. */
export function rozwiazSciezke(katalogHtml: string, ref: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) return null;
  const bez = ref.split(/[?#]/)[0] ?? '';
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
export function zlozPodglad(pliki: readonly PlikPodgladu[], podstrona: string): string | null {
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

export interface OpcjeNaglowkowPodgladu {
  /**
   * `frame-ancestors 'self'` – podgląd osadza w ramce wyłącznie panel z tego samego originu (trasa panelu
   * /api/kreator/podglad). Konieczne tam, bo Caddy dodaje do odpowiedzi panelu `X-Frame-Options: DENY`
   * (ops/caddy/Caddyfile, panel_headers), a przeglądarka ignoruje X-Frame-Options, gdy CSP ma frame-ancestors
   * (https://www.w3.org/TR/CSP3/#frame-ancestors-and-frame-options). API (GET /kreator/strony/:id/podglad) bez tej
   * dyrektywy – jego HTML panel pobiera z tokenem, nie osadza adresu API w ramce.
   */
  ramkaTegoOriginu?: boolean;
}

/**
 * Nagłówki odpowiedzi podglądu. `bazaFontow` – publiczny adres proxy fontów (…/fonts/kreator). Zdjęcia z biblioteki
 * konta to podpisane adresy API (ten sam origin co fonty) – dopisany do img-src (w produkcji API jest na https,
 * w środowisku deweloperskim może być http).
 */
export function naglowkiPodgladu(bazaFontow: string, opcje: OpcjeNaglowkowPodgladu = {}): Record<string, string> {
  const fonty = URL.canParse(bazaFontow) ? new URL(bazaFontow).origin : '';
  const csp = [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    `style-src 'unsafe-inline'${fonty ? ` ${fonty}` : ''}`,
    `font-src data:${fonty ? ` ${fonty}` : ''}`,
    `img-src data: https:${fonty ? ` ${fonty}` : ''}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    ...(opcje.ramkaTegoOriginu ? ["frame-ancestors 'self'"] : []),
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
