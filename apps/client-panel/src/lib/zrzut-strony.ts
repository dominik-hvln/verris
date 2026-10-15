/**
 * Beta „Zgłoś uwagę” — zrzut widocznej części strony do zgłoszenia, w przeglądarce testera.
 *
 * html-to-image (MIT, https://github.com/bubkoo/html-to-image) rysuje kopię DOM przez SVG foreignObject na płótnie —
 * bez rozszerzeń i bez pytania o udostępnienie ekranu (działa też na telefonie). Biblioteka ładowana dopiero przy
 * pierwszym zrzucie (osobny fragment JS). Rysuje całe `body`, a my wycinamy obszar okna: elementy przypięte
 * (menu boczne, `position: fixed`) mogą być na zrzucie przesunięte — opis i położenie elementu w treści zgłoszenia
 * są dokładne. Nic nie opuszcza przeglądarki, dopóki tester nie wyśle zgłoszenia; podgląd widzi przed wysłaniem.
 */

/** Atrybut na elementach „Zgłoś uwagę” (przycisk, okno, wskazywanie) — nie trafiają na zrzut. */
export const ATRYBUT_POMIN = 'data-zglos-uwage-ui';

export interface Prostokat {
  x: number;
  y: number;
  szer: number;
  wys: number;
}

/**
 * Obszar okna na płótnie z całym `body`: przesunięcie body względem okna (przewinięcie) razy skala płótna
 * (html-to-image zmniejsza płótno ponad 16384 px). Przycięte do płótna.
 */
export function kadr(
  body: { left: number; top: number; width: number },
  okno: { szer: number; wys: number },
  plotno: { szer: number; wys: number },
): { sx: number; sy: number; sw: number; sh: number; skala: number } {
  const skala = body.width > 0 ? plotno.szer / body.width : 1;
  const sx = Math.max(0, Math.round(-body.left * skala));
  const sy = Math.max(0, Math.round(-body.top * skala));
  const sw = Math.max(1, Math.min(Math.round(okno.szer * skala), plotno.szer - sx));
  const sh = Math.max(1, Math.min(Math.round(okno.wys * skala), plotno.wys - sy));
  return { sx, sy, sw, sh, skala };
}

/** Ramka zaznaczenia na zrzucie: prostokąt elementu (współrzędne okna) z marginesem, w skali zrzutu. */
export function ramkaNaZrzucie(r: Prostokat, skala: number, margines = 4): Prostokat {
  return {
    x: Math.round((r.x - margines) * skala),
    y: Math.round((r.y - margines) * skala),
    szer: Math.round((r.szer + 2 * margines) * skala),
    wys: Math.round((r.wys + 2 * margines) * skala),
  };
}

const MAX_BAJTOW = 7.5 * 1024 * 1024; // limit załącznika w API: 8 MB
const PRZEZROCZYSTY_GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const naBlob = (c: HTMLCanvasElement, jakosc: number) =>
  new Promise<Blob | null>((ok) => c.toBlob((b) => ok(b), 'image/jpeg', jakosc));

/**
 * Zrzut widocznej części strony (JPEG). `zaznacz` — element do obrysowania (współrzędne okna).
 * null, gdy przeglądarka nie dała rady (limit płótna, obce obrazy, czas) — zgłoszenie idzie wtedy bez zrzutu.
 */
export async function zrobZrzutStrony(zaznacz?: Prostokat | null, limitMs = 20_000): Promise<File | null> {
  try {
    const body = document.body;
    const r = body.getBoundingClientRect();
    const okno = { szer: window.innerWidth, wys: window.innerHeight };
    const tlo = getComputedStyle(body).backgroundColor;
    const { toCanvas } = await import('html-to-image');
    const plotno = await Promise.race([
      toCanvas(body, {
        // Ostrość jak na ekranie (telefony 2–3×), ale najwyżej 2× — rozmiar pliku i limit płótna.
        pixelRatio: Math.min(2, Math.max(1, window.devicePixelRatio || 1)),
        cacheBust: false,
        backgroundColor: tlo && tlo !== 'rgba(0, 0, 0, 0)' ? tlo : '#0b1712',
        imagePlaceholder: PRZEZROCZYSTY_GIF,
        filter: (n) => !(n instanceof Element && n.hasAttribute(ATRYBUT_POMIN)),
      }),
      new Promise<null>((ok) => setTimeout(() => ok(null), limitMs)),
    ]);
    if (!plotno) return null;
    const k = kadr(r, okno, { szer: plotno.width, wys: plotno.height });
    const wynik = document.createElement('canvas');
    wynik.width = k.sw;
    wynik.height = k.sh;
    const ctx = wynik.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(plotno, k.sx, k.sy, k.sw, k.sh, 0, 0, k.sw, k.sh);
    if (zaznacz) {
      const f = ramkaNaZrzucie(zaznacz, k.skala);
      ctx.fillStyle = 'rgba(255, 59, 107, 0.10)';
      ctx.fillRect(f.x, f.y, f.szer, f.wys);
      ctx.lineWidth = Math.max(3, Math.round(3 * k.skala));
      ctx.strokeStyle = '#ff3b6b';
      ctx.strokeRect(f.x, f.y, f.szer, f.wys);
    }
    let blob = await naBlob(wynik, 0.85);
    if (blob && blob.size > MAX_BAJTOW) blob = await naBlob(wynik, 0.6);
    if (!blob || blob.size > MAX_BAJTOW) return null;
    return new File([blob], 'zrzut-ekranu.jpg', { type: 'image/jpeg' });
  } catch {
    return null;
  }
}
