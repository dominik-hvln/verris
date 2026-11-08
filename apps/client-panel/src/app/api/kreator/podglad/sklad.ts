/**
 * Złożenie podglądu kreatora w JEDEN dokument (CSS i JS inline) – minimalna kopia logiki API
 * (apps/api/src/kreator/podglad.ts: zlozPodglad, naglowkiPodgladu). Kopia zamiast wspólnej funkcji w libs/kreator,
 * bo w paczce 120 API zmienia równolegle drugi agent; przy następnej paczce warto przenieść obie do biblioteki.
 *
 * Do dokumentu dochodzi mały skrypt edytora: kliknięcie w sekcję zaznacza ją w edytorze, link do podstrony
 * przełącza podstronę w edytorze (zamiast nawigacji ramki pod nieistniejący adres), a pozycja przewinięcia
 * wraca po każdym odświeżeniu podglądu. Ramka działa w `sandbox` bez allow-same-origin, więc rozmawia
 * z panelem wyłącznie przez postMessage, a panel sprawdza, że wiadomość przyszła z jego ramki.
 */

import { dodatkiMostu, type OpcjeMostu } from '@verris/kreator';

/** Najwięcej tyle bajtów formularza podglądu (model z 30 sekcjami na kilku podstronach to ~60–150 KB). */
export const LIMIT_CIALA = 512 * 1024;

export interface PlikPodgladu {
  sciezka: string;
  tresc: string;
}

/** Pliki HTML podstrony w kolejności prób: '' → index.html; 'o-nas' → o-nas/index.html albo o-nas.html. */
function sciezkiHtml(podstrona: string): string[] {
  return podstrona === '' ? ['index.html'] : [`${podstrona}/index.html`, `${podstrona}.html`];
}

/** Ścieżka zasobu względem katalogu pliku HTML (bez wychodzenia ponad katalog strony); null = adres zewnętrzny. */
function rozwiazSciezke(katalogHtml: string, ref: string): string | null {
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
const bezpiecznyCss = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');
const bezpiecznyJs = (js: string) => js.replace(/<\/(script)/gi, '<\\/$1').replace(/<!--/g, '<\\!--');

/** <link rel=stylesheet> i <script src> wskazujące pliki renderu → treść inline. null = brak HTML tej podstrony. */
export function zlozPodglad(pliki: PlikPodgladu[], podstrona: string): string | null {
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
      // `defer` nie działa na skryptach inline – kod z <head> nie znalazłby elementów strony.
      const tresc = /\bdefer\b/i.test(atrybuty) ? `document.addEventListener('DOMContentLoaded',function(){\n${js}\n});` : js;
      return `<script>${bezpiecznyJs(tresc)}</script>`;
    });
}

export interface OpcjeDodatkow {
  podstrona: string;
  przewin: number;
  zaznaczona: string | null;
  /**
   * Edycja na stronie (paczka 122): mostek z @verris/kreator przejmuje kliknięcia (tekst, sekcje, linki); skrypt
   * edytora zostaje tylko przy przewijaniu i blokadzie wysyłki formularzy.
   */
  edycja?: OpcjeMostu['tryb'] | null;
}

/** Skrypt edytora w ramce podglądu (bez danych klienta poza liczbą i identyfikatorem sekcji). */
export function skryptEdytora(opcje: OpcjeDodatkow): string {
  const dane = JSON.stringify({ p: opcje.podstrona, y: Math.max(0, Math.round(opcje.przewin)), z: opcje.zaznaczona, e: opcje.edycja ? 1 : 0 })
    .replace(/</g, '\\u003c');
  return `<script>(function(){var D=${dane};var Z='verris-podglad';
function wyslij(m){m.zrodlo=Z;try{parent.postMessage(m,'*')}catch(e){}}
if(D.z){var s=document.getElementById(D.z);if(s)s.setAttribute('data-kreator-zaznaczona','')}
function przewin(){if(!location.hash&&D.y>0)window.scrollTo(0,D.y)}
if(document.readyState!=='loading')przewin();else document.addEventListener('DOMContentLoaded',przewin);
var t=0;window.addEventListener('scroll',function(){clearTimeout(t);t=setTimeout(function(){wyslij({typ:'przewin',y:Math.round(window.scrollY)})},120)},{passive:true});
if(!D.e)document.addEventListener('click',function(e){var el=e.target;if(!el||!el.closest)return;var a=el.closest('a[href]');
if(a){var h=a.getAttribute('href')||'';if(h.charAt(0)==='#'){return}e.preventDefault();
var baza='https://podglad.invalid/'+(D.p?D.p+'/':'');var u;try{u=new URL(h,baza)}catch(x){return}
if(u.host==='podglad.invalid'){var slug=u.pathname.replace(/index\\.html$/,'').replace(/\\.html$/,'').replace(/^\\/+|\\/+$/g,'');wyslij({typ:'podstrona',slug:slug,kotwica:u.hash.slice(1)})}
else wyslij({typ:'zewnetrzny',adres:u.protocol});return}
var sek=el.closest('section[id]');if(sek)wyslij({typ:'sekcja',id:sek.id})},true);
document.addEventListener('submit',function(e){e.preventDefault();wyslij({typ:'formularz'})},true);
})();</script>`;
}

/** Obrys zaznaczonej sekcji i kursor „kliknij, by edytować” – tylko w podglądzie edytora. */
const STYL_EDYTORA =
  '<style>section[id]{cursor:pointer}[data-kreator-zaznaczona]{outline:3px solid #1fa871;outline-offset:-3px}' +
  'section[id]:hover:not([data-kreator-zaznaczona]){outline:2px dashed rgba(31,168,113,.6);outline-offset:-2px}</style>';

/** Dokleja styl i skrypt edytora (w trybie edycji także mostek) przed </body> (albo na koniec, gdy renderer go nie zamknął). */
export function zDodatkamiEdytora(html: string, opcje: OpcjeDodatkow): string {
  const dodatki = STYL_EDYTORA + skryptEdytora(opcje) + (opcje.edycja ? dodatkiMostu({ tryb: opcje.edycja }) : '');
  const i = html.lastIndexOf('</body>');
  return i === -1 ? html + dodatki : html.slice(0, i) + dodatki + html.slice(i);
}

/**
 * Nagłówki odpowiedzi podglądu: CSP `sandbox allow-scripts` BEZ allow-same-origin (skrypty strony w nieprzezroczystym
 * originie – bez dostępu do panelu, ciasteczek i API), żadnych połączeń poza fontami z API i obrazami https.
 * `frame-ancestors 'self'`: ramkę osadza tylko panel. Ta dyrektywa jest tu konieczna – Caddy dodaje do odpowiedzi
 * panelu `X-Frame-Options: DENY` (ops/caddy/Caddyfile, panel_headers), a przeglądarka ignoruje X-Frame-Options,
 * gdy CSP ma frame-ancestors (https://www.w3.org/TR/CSP3/#frame-ancestors-and-frame-options).
 */
export function naglowkiPodgladu(bazaFontow: string): Record<string, string> {
  const fonty = URL.canParse(bazaFontow) ? new URL(bazaFontow).origin : '';
  const csp = [
    'sandbox allow-scripts',
    "default-src 'none'",
    "script-src 'unsafe-inline'",
    `style-src 'unsafe-inline'${fonty ? ` ${fonty}` : ''}`,
    `font-src data:${fonty ? ` ${fonty}` : ''}`,
    // Zdjęcia z biblioteki konta – pliki wariantów z API (podpisany adres); w produkcji API jest i tak na https.
    `img-src data: https:${fonty ? ` ${fonty}` : ''}`,
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'self'",
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

/** Prosta strona komunikatu w ramce (błąd modelu, brak dostępu) – w stylu panelu, bez skryptów. */
export function stronaKomunikatu(tytul: string, tresc: string, lista: string[] = []): string {
  const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const li = lista.length ? `<ul>${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '';
  return (
    `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="robots" content="noindex"><title>${esc(tytul)}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;` +
    `background:#f4f4ee;color:#0c1a14;font:15px/1.5 system-ui,sans-serif}main{max-width:520px;padding:32px}h1{font-size:20px;margin:0 0 8px}` +
    `p{color:#34413a;margin:0 0 12px}ul{margin:0;padding-left:18px;color:#34413a;font-size:13px}</style></head>` +
    `<body><main><h1>${esc(tytul)}</h1><p>${esc(tresc)}</p>${li}</main></body></html>`
  );
}

/** Id zdjęć z biblioteki konta użytych w modelu (`zasobId` w obiektach Obraz). */
export function zasobyModelu(model: unknown): string[] {
  const ids = new Set<string>();
  const odwiedz = (x: unknown, glebokosc: number): void => {
    if (glebokosc > 20 || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach((e) => odwiedz(e, glebokosc + 1));
    const o = x as Record<string, unknown>;
    if (typeof o.zasobId === 'string') ids.add(o.zasobId);
    for (const v of Object.values(o)) odwiedz(v, glebokosc + 1);
  };
  odwiedz(model, 0);
  return [...ids];
}
