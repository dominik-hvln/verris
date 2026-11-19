import { describe, expect, it } from 'vitest';
import { walidujSvgSygnetu, wnetrzeSvg } from './walidator-svg.ts';
import { rasteryzujSciezki, sciezkiZSvg } from './odcisk.ts';

const svg = (wnetrze: string, vb = '0 0 100 100') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">${wnetrze}</svg>`;
const pokrycie = (s: string) => {
  const r = rasteryzujSciezki(sciezkiZSvg(s), 50);
  return r.reduce((a, v) => a + v, 0) / (255 * r.length);
};

/** Symbol z makiety („Kręgi” i „Dwa żagle”) – maska, elipsy, obrysy. */
const ZAGIEL = svg(
  '<path d="M51 10 Q73 34 84 70 H51 Z" fill="currentColor" stroke="none"/>' +
    '<path d="M44 24 V70 H17 Q29 44 44 24 Z" fill="var(--akcent)" stroke="none"/>' +
    '<path d="M10 84 Q20 77 30 84 T50 84 T70 84 T90 84" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
);
const KROPLA_Z_MASKA = svg(
  '<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#fff"/>' +
    '<path d="M14 64 Q26 56 38 64 T62 64 T86 64" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round"/></mask>' +
    '<path d="M46 8 C54 24 76 42 76 64 A30 30 0 0 1 16 64 C16 42 38 24 46 8 Z" fill="currentColor" mask="url(#m)"/>' +
    '<circle cx="80" cy="22" r="7" fill="var(--akcent, currentColor)"/>',
);

describe('walidujSvgSygnetu – poprawne symbole', () => {
  it('normalizuje do samych <path> w viewBox 0 0 100 100, obrysy zamienia na kontury', () => {
    const w = walidujSvgSygnetu(ZAGIEL, { tryb: 'ai' });
    expect(w.bledy).toEqual([]);
    expect(w.ok).toBe(true);
    expect(w.svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 100 100">(<path fill="(currentColor|var\(--akcent, currentColor\))" fill-rule="(evenodd|nonzero)" d="[MLCZ0-9 .-]+"\/>)+<\/svg>$/);
    expect(w.svg).not.toMatch(/stroke/);
    expect(w.svg).toContain('var(--akcent, currentColor)');
  });

  it('spłaszcza maskę do konturu (fala wycięta z kropli – mniej pokrycia niż bez maski)', () => {
    const z = walidujSvgSygnetu(KROPLA_Z_MASKA, { tryb: 'ai' });
    expect(z.ok).toBe(true);
    expect(z.svg).not.toMatch(/mask/);
    const bez = walidujSvgSygnetu(KROPLA_Z_MASKA.replace(' mask="url(#m)"', ''), { tryb: 'ai' });
    expect(pokrycie(z.svg)).toBeLessThan(pokrycie(bez.svg) - 0.02);
  });

  it('circle/rect/ellipse/polygon → path, transform spłaszczony (translate/rotate/scale)', () => {
    const w = walidujSvgSygnetu(
      svg('<g transform="translate(10 0) rotate(45 40 50) scale(0.8)"><rect x="20" y="20" width="40" height="40" rx="6"/><circle cx="50" cy="50" r="10" fill="var(--akcent)"/></g><polygon points="10,90 30,90 20,75"/>'),
      { tryb: 'ai' },
    );
    expect(w.ok).toBe(true);
    expect(w.svg).not.toMatch(/<(rect|circle|polygon|g)\b|transform/);
    for (const d of sciezkiZSvg(w.svg))
      for (const n of d.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number(n)).toBeGreaterThanOrEqual(-0.01);
        expect(Number(n)).toBeLessThanOrEqual(100.01);
      }
  });

  it('viewBox inny niż 0 0 100 100 dla pliku wgranego – skaluje do pola', () => {
    const w = walidujSvgSygnetu(svg('<rect x="0" y="0" width="400" height="200" fill="#1D2B4A"/>', '0 0 400 200'), { tryb: 'wgrany' });
    expect(w.ok).toBe(true);
    expect(w.svg).toContain('M4 27L96 27L96 73L4 73Z');
  });

  it('plik wgrany: kolory → kanały (ciemny = główny, jasny/inny = akcent), biel = wycięcie', () => {
    const w = walidujSvgSygnetu(
      svg('<circle cx="50" cy="50" r="40" fill="#1d2b4a"/><rect x="40" y="40" width="20" height="20" fill="#ffffff"/><circle cx="85" cy="15" r="8" fill="rgb(242,140,40)"/>'),
      { tryb: 'wgrany' },
    );
    expect(w.ok).toBe(true);
    expect(w.svg).toContain('fill="currentColor"');
    expect(w.svg).toContain('fill="var(--akcent, currentColor)"');
    expect(w.svg).not.toMatch(/#fff|ffffff/i);
    // biały kwadrat wycięty z koła – środek pusty
    const r = rasteryzujSciezki(sciezkiZSvg(w.svg), 100);
    const srodek = r[50 * 100 + 47];
    expect(srodek).toBe(0);
  });

  it('liczby zaokrąglone do 2 miejsc', () => {
    const w = walidujSvgSygnetu(svg('<path d="M10.123456 10 L90.987654 10 L50 90.5555 Z"/>'), { tryb: 'ai' });
    expect(w.ok).toBe(true);
    expect(w.svg).not.toMatch(/\d\.\d{3}/);
  });
});

describe('walidujSvgSygnetu – odrzucenia i limity', () => {
  const odrzuc = (s: string, tryb: 'ai' | 'wgrany' = 'ai') => {
    const w = walidujSvgSygnetu(s, { tryb });
    expect(w.ok, s).toBe(false);
    expect(w.svg).toBe('');
    expect(w.bledy.length).toBeGreaterThan(0);
    return w.bledy[0];
  };

  it('limit elementów dla AI (≤ 12) i węzłów (≤ 220) – paczka 134; ponowna walidacja zapisanego wyniku bez limitu wejścia', () => {
    const trzynascie = Array.from({ length: 13 }, (_, i) => `<circle cx="${6 + i * 7}" cy="50" r="3"/>`).join('');
    expect(odrzuc(svg(trzynascie))).toMatch(/elementów/);
    expect(walidujSvgSygnetu(svg(trzynascie.replace(/<circle[^>]*\/>$/, '')), { tryb: 'ai' }).ok).toBe(true);
    const d = 'M0 0 ' + Array.from({ length: 230 }, (_, i) => `L${(i * 7) % 100} ${(i * 13) % 100}`).join(' ') + 'Z';
    expect(odrzuc(svg(`<path d="${d}"/>`))).toMatch(/węzłów/);
    expect(walidujSvgSygnetu(svg(`<path d="${d}"/>`), { tryb: 'ai', ponowna: true }).ok).toBe(true);
    expect(walidujSvgSygnetu(svg(trzynascie), { tryb: 'wgrany' }).ok).toBe(true);
  });

  it('AI: granice z krzywej, nie z punktów kontrolnych (łuk C z kontrolą poza polem leży w polu) – paczka 134', () => {
    expect(walidujSvgSygnetu(svg('<path d="M10 70C10 -5 90 -5 90 70Z"/>'), { tryb: 'ai' }).ok).toBe(true);
    expect(odrzuc(svg('<path d="M10 70C10 -60 90 -60 90 70Z"/>'))).toMatch(/poza viewBox/);
  });

  it('AI: biel = wycięcie (odejmowana od wcześniejszych kształtów), nie kolor', () => {
    const z = walidujSvgSygnetu(svg('<rect x="10" y="10" width="80" height="80"/><rect x="40" y="10" width="20" height="80" fill="#fff"/>'), { tryb: 'ai' });
    expect(z.ok).toBe(true);
    expect(z.svg).not.toContain('fff');
  });

  it('AI: tylko currentColor / akcent / none; viewBox 0 0 100 100; bez tekstu; w polu', () => {
    expect(odrzuc(svg('<path d="M0 0H10V10Z" fill="#ff0000"/>'))).toMatch(/currentColor/);
    expect(odrzuc(svg('<path d="M0 0H10V10Z"/>', '0 0 200 200'))).toMatch(/viewBox/);
    expect(odrzuc(svg('<path d="M-20 0H10V10Z"/>'))).toMatch(/poza viewBox/);
    expect(odrzuc(svg('<text x="10" y="10">A</text>'))).toMatch(/element/);
    expect(odrzuc(svg('<g>Napis</g>'))).toMatch(/Tekst/);
  });

  it('gradienty, przezroczystość, skos – odrzucone', () => {
    expect(odrzuc(svg('<path d="M0 0H10V10Z" fill="url(#g)"/>'), 'wgrany')).toBeTruthy();
    expect(odrzuc(svg('<path d="M0 0H10V10Z" opacity="0.5"/>'))).toMatch(/Przezroczysto/);
    expect(odrzuc(svg('<path d="M0 0H10V10Z" transform="skewX(20)"/>'))).toMatch(/translate/);
    expect(odrzuc(svg('<path d="M0 0H10V10Z" transform="matrix(1 0 0.5 1 0 0)"/>'))).toMatch(/skos/);
  });

  it('błędna składnia ścieżki i XML', () => {
    expect(odrzuc(svg('<path d="M0 0 L10 Q"/>'))).toMatch(/ścieżki/);
    expect(odrzuc('<svg viewBox="0 0 100 100"><path d="M0 0H10V10Z">')).toMatch(/Niezamknięty|zamknięcie/);
    expect(odrzuc('<svg viewBox="0 0 100 100"><path d=M0/></svg>')).toBeTruthy();
    expect(odrzuc('')).toMatch(/Pusty/);
    expect(odrzuc('<html></html>')).toMatch(/<svg>/);
  });

  // Wektory XSS / XXE – każdy musi zostać odrzucony (wynik pusty), a nie „oczyszczony”.
  const WEKTORY = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" onload="alert(1)"><path d="M0 0H10V10Z"/></svg>',
    svg('<script>alert(1)</script>'),
    svg('<script xlink:href="data:text/javascript,alert(1)"/>'),
    svg('<path d="M0 0H10V10Z" onclick="alert(1)"/>'),
    svg('<path d="M0 0H10V10Z" ONMOUSEOVER="alert(1)"/>'),
    svg('<foreignObject width="100" height="100"><body xmlns="http://www.w3.org/1999/xhtml"><img src=x onerror=alert(1)></body></foreignObject>'),
    svg('<image href="javascript:alert(1)" width="10" height="10"/>'),
    svg('<image xlink:href="https://zly.example/x.png" width="10" height="10"/>'),
    svg('<use href="https://zly.example/s.svg#a"/>'),
    svg('<use xlink:href="#a"/>'),
    svg('<a href="javascript:alert(1)"><path d="M0 0H10V10Z"/></a>'),
    svg('<style>path{fill:url(javascript:alert(1))}</style><path d="M0 0H10V10Z"/>'),
    svg('<path d="M0 0H10V10Z" style="fill:red"/>'),
    svg('<animate attributeName="href" to="javascript:alert(1)"/>'),
    svg('<set attributeName="onmouseover" to="alert(1)"/>'),
    svg('<path d="M0 0H10V10Z" fill="url(https://zly.example/p.svg#g)"/>'),
    svg('<path d="M0 0H10V10Z" mask="url(https://zly.example/m.svg#m)"/>'),
    svg('<path d="M0 0H10V10Z" mask="url(#nieistnieje)"/>'),
    svg('<path d="M0 0H10V10Z" fill="javascript:alert(1)"/>'),
    '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg viewBox="0 0 100 100"><path d="M0 0H10V10Z"/></svg>',
    '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg viewBox="0 0 100 100"><path d="M0 0H10V10Z"/></svg>',
    svg('<path d="M0 0H10V10Z" fill="&xxe;"/>'),
    svg('<![CDATA[<script>alert(1)</script>]]><path d="M0 0H10V10Z"/>'),
    '<?xml-stylesheet href="https://zly.example/a.css"?><svg viewBox="0 0 100 100"><path d="M0 0H10V10Z"/></svg>',
    svg('<path d="M0 0H10V10Z"/><path d="M0 0H10V10Z" id="a" onfocus="alert(1)" tabindex="1"/>'),
    svg('<g><g><g><g><g><g><path d="M0 0H10V10Z"/></g></g></g></g></g></g>'),
    '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 100 100"><path d="M0 0H10V10Z"/></svg>',
    svg('<path d="M0 0H10V10Z" fill="currentColor" xmlns:x="http://www.w3.org/1999/xlink" x:href="javascript:alert(1)"/>'),
    svg('<path d="M0 0H10V10Z"></path><iframe src="javascript:alert(1)"></iframe>'),
    svg('<path d="M0 0H10V10Z"/>') + '<script>alert(1)</script>',
    '<svg viewBox="0 0 100 100"><path d="M0 0H10V10Z" fill="currentColor"/></svg>\u0000',
  ];

  it.each(WEKTORY.map((w, i) => [i, w]))('wektor %i odrzucony', (_i, w) => {
    odrzuc(w as string);
  });

  it('wynik nigdy nie zawiera tekstu z wejścia poza liczbami ścieżek (konstrukcja od nowa)', () => {
    const w = walidujSvgSygnetu(
      svg('<!-- <script>alert(1)</script> --><title>&lt;script&gt;</title><path id="x&quot;onload=&quot;alert(1)" class="a" d="M10 10H90V90Z"/>'),
      { tryb: 'ai' },
    );
    expect(w.ok).toBe(true);
    expect(w.svg).not.toMatch(/script|onload|alert|title|id=|class=/i);
    expect(wnetrzeSvg(w.svg)).toMatch(/^<path /);
  });
});
