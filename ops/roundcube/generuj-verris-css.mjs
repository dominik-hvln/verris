// Generuje ops/roundcube/verris_marka/verris.css: reguły skórki Elastic, które używają jej niebieskiego
// (i ciemnych szarości trybu ciemnego), z kolorami Verris. Selektory 1:1 ze styles.min.css tej wersji
// Roundcube, którą instaluje CustomBuild — po większej aktualizacji Roundcube uruchom ponownie:
//   node ops/roundcube/generuj-verris-css.mjs <roundcubemail-X.Y.Z>/skins/elastic/styles/styles.min.css
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tu = dirname(fileURLToPath(import.meta.url));

/** Minimalny parser zminifikowanego CSS: bloki `selektor{deklaracje}` i `@media …{…}` (z cudzysłowami). */
export function bloki(css, od = 0, do_ = css.length) {
  const out = [];
  let i = od;
  while (i < do_) {
    const start = i;
    let cudz = null;
    while (i < do_ && (cudz || css[i] !== '{')) {
      if (cudz) { if (css[i] === cudz && css[i - 1] !== '\\') cudz = null; } else if (css[i] === '"' || css[i] === "'") cudz = css[i];
      i += 1;
    }
    if (i >= do_) break;
    const glowa = css.slice(start, i).trim();
    let glebokosc = 1;
    const tresc = i + 1;
    i += 1;
    cudz = null;
    while (i < do_ && glebokosc > 0) {
      const c = css[i];
      if (cudz) { if (c === cudz && css[i - 1] !== '\\') cudz = null; } else if (c === '"' || c === "'") cudz = c;
      else if (c === '{') glebokosc += 1;
      else if (c === '}') glebokosc -= 1;
      i += 1;
    }
    out.push({ glowa, od: tresc, do: i - 1 });
  }
  return out;
}

/** Deklaracje `a:b;c:d` z poszanowaniem cudzysłowów i nawiasów (url(), data:). */
function deklaracje(tekst) {
  const out = [];
  let cudz = null, nawias = 0, start = 0;
  for (let i = 0; i <= tekst.length; i += 1) {
    const c = tekst[i];
    if (cudz) { if (c === cudz) cudz = null; continue; }
    if (c === '"' || c === "'") cudz = c;
    else if (c === '(') nawias += 1;
    else if (c === ')') nawias -= 1;
    else if ((c === ';' || i === tekst.length) && nawias === 0) {
      const d = tekst.slice(start, i).trim();
      if (d) out.push(d);
      start = i + 1;
    }
  }
  return out;
}

// Elastic (colors.less) → Verris. Jasny: zieleń marki, menu zadań pine. Ciemny: mint i tła zielono-czarne
// z panelu admina (page #091410, card #0e1f17, raised #132a1f).
const JASNY = {
  '37beff': '0f7a52', '00acff': '0f7a52', '1eb6ff': '0c6a47', '13b2ff': '0c6a47', '04adff': '0c6a47',
  '008acc': '0a5c3d', '007bb7': '0a5c3d', '006a9d': '0c1a14', 'ebf9ff': 'e6f4ee', '2f3a3f': '0c1a14', '45555c': '132a1f',
};
const CIEMNY = {
  '37beff': '34e5a0', '00acff': '34e5a0', '1eb6ff': '2bc488', '13b2ff': '2bc488', '04adff': '2bc488',
  '008acc': '22a874', '007bb7': '22a874', '006a9d': '0e1f17', 'ebf9ff': '132a1f', '21292c': '091410',
  '2c363a': '0e1f17', '2c373a': '0e1f17', '2c373b': '0e1f17', '374549': '132a1f', '2f3a3f': '091410', '45555c': '1a3527',
};
const RGBA = { jasny: '15,122,82', ciemny: '52,229,160' };

function przemaluj(wartosc, ciemny) {
  const mapa = ciemny ? CIEMNY : JASNY;
  let zmiana = false;
  const wynik = wartosc
    .replace(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi, (m, h) => {
      const pelny = (h.length === 3 ? [...h].map((c) => c + c).join('') : h).toLowerCase();
      if (!mapa[pelny]) return m;
      zmiana = true;
      return `#${mapa[pelny]}`;
    })
    .replace(/rgba\(\s*55\s*,\s*190\s*,\s*255\s*,/g, () => {
      zmiana = true;
      return `rgba(${ciemny ? RGBA.ciemny : RGBA.jasny},`;
    });
  return zmiana ? wynik : null;
}

const zrodlo = process.argv[2];
if (!zrodlo) throw new Error('Podaj ścieżkę do skins/elastic/styles/styles.min.css');
const css = readFileSync(zrodlo, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
let reguly = 0;
function przetworz(od, do_) {
  const wynik = [];
  for (const b of bloki(css, od, do_)) {
    if (b.glowa.startsWith('@')) {
      if (/^@(media|supports)/i.test(b.glowa)) {
        const wnetrze = przetworz(b.od, b.do);
        if (wnetrze.length) wynik.push(`${b.glowa}{\n${wnetrze.join('\n')}\n}`);
      }
      continue; // @keyframes, @font-face — bez zmian
    }
    const ciemny = /dark-mode/.test(b.glowa);
    const nowe = deklaracje(css.slice(b.od, b.do))
      .map((d) => {
        const k = d.indexOf(':');
        const nowa = przemaluj(d.slice(k + 1), ciemny);
        return nowa ? `${d.slice(0, k)}:${nowa}` : null;
      })
      .filter(Boolean);
    if (!nowe.length) continue;
    reguly += 1;
    wynik.push(`${b.glowa}{${nowe.join(';')}}`);
  }
  return wynik;
}
const wygenerowane = przetworz(0, css.length).join('\n');

const naglowek = readFileSync(join(tu, 'verris-baza.css'), 'utf8');
writeFileSync(
  join(tu, 'verris_marka/verris.css'),
  // Ręczne poprawki (verris-baza.css) na końcu — wygrywają z wygenerowanymi przy równej specyficzności.
  `/* --- wygenerowane: node ops/roundcube/generuj-verris-css.mjs (${reguly} reguł Elastic) --- */\n${wygenerowane}\n\n${naglowek}`,
);
console.log(`verris.css: ${reguly} reguł`);
