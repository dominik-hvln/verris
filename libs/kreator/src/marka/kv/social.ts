/**
 * Key Visual – grafiki do mediów społecznościowych i spotkań (px): post 1080×1080, story 1080×1920, okładka
 * Facebooka 851×315 [do weryfikacji aktualnych wymiarów i stref zasłanianych przez zdjęcie profilowe], baner
 * LinkedIn 1584×396 [do weryfikacji], tło/zaproszenie Teams 1920×1080 (środek pusty – tam jest osoba).
 */
import type { MaterialSvg, WejscieKv } from './wspolne.ts';
import { bezpiecznyUrlZdjecia, dokument, f2, haslo, koloryKv, logoKv, tloKv, zdjecie } from './wspolne.ts';

export const WYMIARY_SOCIAL = {
  post: [1080, 1080],
  story: [1080, 1920],
  'okladka-facebook': [851, 315],
  'baner-linkedin': [1584, 396],
  'zaproszenie-teams': [1920, 1080],
} as const;

const tytul = (we: WejscieKv, co: string) => `${we.marka.brief.nazwa} – ${co}`;

export function post(we: WejscieKv): MaterialSvg {
  const [W, H] = WYMIARY_SOCIAL.post;
  const kol = koloryKv(we.marka);
  const url = bezpiecznyUrlZdjecia(we.zdjecieUrl);
  const m = 96;
  const czesci = [tloKv(we, W, H, kol, 1.4)];
  let yHasla = 330;
  if (url) {
    czesci.push(zdjecie(url, 0, 0, W, 600, kol.tlo));
    yHasla = 660;
  } else czesci.push(`<rect x="${m}" y="${yHasla - 56}" width="72" height="10" rx="5" fill="${kol.akcent}"/>`);
  const h = haslo(we, m, yHasla, url ? 50 : 66, kol.tekst, { maksZnakow: url ? 26 : 18, wierszy: url ? 2 : 4 });
  czesci.push(h.el);
  czesci.push(logoKv(we, 'poziomy', kol.wariantLogo, m, H - m - 84, 84, 'lewo', W - 2 * m).el);
  return { material: 'post', svg: dokument(we, W, H, 'px', czesci.join(''), tytul(we, 'post')), szerokosc: W, wysokosc: H, jednostka: 'px' };
}

export function story(we: WejscieKv): MaterialSvg {
  const [W, H] = WYMIARY_SOCIAL.story;
  const kol = koloryKv(we.marka);
  const url = bezpiecznyUrlZdjecia(we.zdjecieUrl);
  const czesci = [tloKv(we, W, H, kol, 1.6)];
  // strefy bezpieczne: ok. 250 px u góry i u dołu zasłaniają elementy aplikacji [do weryfikacji]
  if (url) czesci.push(zdjecie(url, 0, 0, W, 1000, kol.tlo));
  const yH = url ? 1080 : 720;
  czesci.push(`<rect x="${W / 2 - 40}" y="${yH - 70}" width="80" height="10" rx="5" fill="${kol.akcent}"/>`);
  czesci.push(haslo(we, W / 2, yH, 76, kol.tekst, { maksZnakow: 16, wierszy: 4, wyrownanie: 'srodek' }).el);
  czesci.push(logoKv(we, 'pionowy', kol.wariantLogo, W / 2, H - 290 - 260, 260, 'srodek', W - 200).el);
  return { material: 'story', svg: dokument(we, W, H, 'px', czesci.join(''), tytul(we, 'story')), szerokosc: W, wysokosc: H, jednostka: 'px' };
}

export function okladkaFacebook(we: WejscieKv): MaterialSvg {
  const [W, H] = WYMIARY_SOCIAL['okladka-facebook'];
  const kol = koloryKv(we.marka);
  const url = bezpiecznyUrlZdjecia(we.zdjecieUrl);
  const czesci = [tloKv(we, W, H, kol, 0.8)];
  if (url) czesci.push(zdjecie(url, 0, 0, W, H, kol.tlo));
  // zdjęcie profilowe zasłania lewy dolny róg na komputerze – treść w środku i po prawej
  const maHaslo = !!(we.ksztalty?.haslo?.length || we.marka.kv.haslo);
  const hLogo = 84;
  const yLogo = maHaslo ? H / 2 - hLogo + 4 : H / 2 - hLogo / 2;
  czesci.push(logoKv(we, 'poziomy', kol.wariantLogo, W / 2, yLogo, hLogo, 'srodek', W - 160).el);
  if (maHaslo) czesci.push(haslo(we, W / 2, H / 2 + 26, 15, kol.tekst, { maksZnakow: 48, wierszy: 1, wyrownanie: 'srodek' }).el);
  return { material: 'okladka-facebook', svg: dokument(we, W, H, 'px', czesci.join(''), tytul(we, 'okładka Facebooka')), szerokosc: W, wysokosc: H, jednostka: 'px' };
}

export function banerLinkedin(we: WejscieKv): MaterialSvg {
  const [W, H] = WYMIARY_SOCIAL['baner-linkedin'];
  const kol = koloryKv(we.marka);
  const url = bezpiecznyUrlZdjecia(we.zdjecieUrl);
  const czesci = [tloKv(we, W, H, kol, 1)];
  if (url) czesci.push(zdjecie(url, 0, 0, W, H, kol.tlo));
  // zdjęcie profilowe po lewej – logo i hasło po prawej
  const prawa = W - 96;
  czesci.push(logoKv(we, 'poziomy', kol.wariantLogo, prawa, 84, 120, 'prawo', W * 0.55).el);
  czesci.push(`<rect x="${f2(prawa - 64)}" y="240" width="64" height="6" rx="3" fill="${kol.akcent}"/>`);
  czesci.push(haslo(we, prawa, 262, 26, kol.tekst, { maksZnakow: 52, wierszy: 1, wyrownanie: 'prawo' }).el);
  return { material: 'baner-linkedin', svg: dokument(we, W, H, 'px', czesci.join(''), tytul(we, 'baner LinkedIn')), szerokosc: W, wysokosc: H, jednostka: 'px' };
}

export function zaproszenieTeams(we: WejscieKv): MaterialSvg {
  const [W, H] = WYMIARY_SOCIAL['zaproszenie-teams'];
  const kol = koloryKv(we.marka);
  const czesci = [tloKv(we, W, H, kol, 1.2)];
  czesci.push(logoKv(we, 'poziomy', kol.wariantLogo, 80, 72, 110, 'lewo', 700).el);
  czesci.push(haslo(we, 80, H - 120, 30, kol.tekst, { maksZnakow: 60, wierszy: 1 }).el);
  return { material: 'zaproszenie-teams', svg: dokument(we, W, H, 'px', czesci.join(''), tytul(we, 'tło spotkania')), szerokosc: W, wysokosc: H, jednostka: 'px' };
}
