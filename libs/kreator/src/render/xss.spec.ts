import { walidujStrone, type Strona, type StronaWejscie } from '../model.ts';
import { WERSJE_KREATORA } from '../plany.ts';
import { renderujStrone } from './index.ts';
import { blokiLd, grafLd, htmle, model, plik, PRZYKLADY, render, tekst, zeZdjeciami, znaczniki } from './testy.pomoc.ts';

const SKRYPT = '</script><script>alert(1)</script>';
const ATRYBUT = '"><img src=x onerror=alert(2)>';
const APOSTROF = "' onmouseover='alert(3)";

/** Księgowa i studio z wrogimi tekstami w nagłówku, alt, nazwie firmy i FAQ. */
function wrogie(): StronaWejscie[] {
  const ksiegowa = structuredClone(PRZYKLADY.ksiegowa!);
  ksiegowa.firma.nazwa = `Biuro ${SKRYPT}`;
  const hero = ksiegowa.strony[0]!.sekcje[0]!;
  if (hero.typ !== 'hero') throw new Error('hero');
  hero.dane.naglowek = `Księgowość ${ATRYBUT} ${SKRYPT}`;
  hero.dane.wyroznienie = undefined;
  hero.dane.nadtytul = APOSTROF;
  const faq = ksiegowa.strony[0]!.sekcje.find((s) => s.typ === 'faq')!;
  if (faq.typ !== 'faq') throw new Error('faq');
  faq.dane.pytania[0] = { pytanie: `Pytanie ${SKRYPT}`, odpowiedz: `Odpowiedź ${ATRYBUT} & ${APOSTROF}` };
  faq.dane.naglowek = ATRYBUT;

  const studio = zeZdjeciami(PRZYKLADY.studio!);
  studio.firma.nazwa = `Studio ${ATRYBUT}`;
  const galeria = studio.strony[0]!.sekcje.find((s) => s.typ === 'galeria')!;
  if (galeria.typ !== 'galeria') throw new Error('galeria');
  galeria.dane.obrazy[0]!.alt = `Kuchnia ${ATRYBUT}`;
  galeria.dane.obrazy[1]!.alt = `Sypialnia ${SKRYPT}`;
  galeria.dane.obrazy[2]!.alt = APOSTROF;
  galeria.dane.naglowek = SKRYPT;
  return [ksiegowa, studio];
}

describe('XSS: teksty z modelu są uciekane w HTML i JSON-LD', () => {
  it.each(WERSJE_KREATORA.flatMap((w) => [0, 1].map((i) => [w, i] as const)))('%s / model %i', (wersja, i) => {
    const wej = wrogie()[i]!;
    for (const tryb of ['publikacja', 'podglad'] as const) {
      const wynik = render(wej, wersja, { tryb, podgladPro: tryb === 'podglad' });
      for (const { sciezka, tresc } of htmle(wynik)) {
        const kto = `${wersja}/${tryb}/${sciezka}`;
        const tagi = znaczniki(tresc);
        // żaden znacznik nie powstał z danych: jedyne <script> to arkusz JS i JSON-LD, żadnych atrybutów on*
        expect(tagi.filter((t) => t.nazwa === 'script').every((t) => t.atr.type === 'application/ld+json' || t.atr.src?.endsWith('assets/kreator.js')), kto).toBe(true);
        expect(tagi.filter((t) => t.nazwa === 'img' && t.atr.src === 'x'), kto).toHaveLength(0);
        expect(tagi.flatMap((t) => Object.keys(t.atr)).filter((a) => a.startsWith('on')), kto).toEqual([]);
        expect((tresc.match(/<script/g) ?? []).length, `${kto}: każdy <script> zamknięty raz`).toBe((tresc.match(/<\/script>/g) ?? []).length);
        // wartość atrybutu nie wychodzi poza cudzysłów (alt, aria-label, content)
        for (const t of tagi) for (const v of Object.values(t.atr)) expect(v, kto).not.toMatch(/[<>"]/);

        // tekst wraca w postaci dosłownej (encje, nie znaczniki)
        if (sciezka === 'index.html') {
          expect(tekst(tresc), kto).toContain(i === 0 ? `Biuro ${SKRYPT}` : `Studio ${ATRYBUT}`);
          expect(tresc).toContain('&lt;/script&gt;');
        }

        // JSON-LD: blok się parsuje, nie zawiera „</script” ani „<”, a dane wracają bez zmian
        if (sciezka === '404.html') continue;
        for (const blok of blokiLd(tresc)) expect(blok, kto).not.toMatch(/<|>/);
        const graf = grafLd(tresc);
        const firma = graf.find((x) => x['@id'] && x['@type'] !== 'WebSite')!;
        expect(firma.name, kto).toBe(i === 0 ? `Biuro ${SKRYPT}` : `Studio ${ATRYBUT}`);
        if (i === 0 && wersja === 'pro' && sciezka === 'index.html') {
          const faq = graf.find((x) => x['@type'] === 'FAQPage') as { mainEntity: { name: string; acceptedAnswer: { text: string } }[] };
          expect(faq.mainEntity[0]).toMatchObject({ name: `Pytanie ${SKRYPT}`, acceptedAnswer: { text: `Odpowiedź ${ATRYBUT} & ${APOSTROF}` } });
        }
      }
    }
  });

  it('alt z wrogim tekstem zostaje w atrybucie alt (cudzysłów uciekany)', () => {
    const html = render(wrogie()[1]!, 'pro').pliki.find((p) => p.sciezka === 'index.html')!.tresc;
    expect(html).toContain('alt="Kuchnia &quot;&gt;&lt;img src=x onerror=alert(2)&gt;"');
    expect(html).toContain('alt="&#39; onmouseover=&#39;alert(3)"');
    // lightbox: podpis w data-podpis też uciekany
    expect(html).toContain('data-podpis="Sypialnia &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;"');
  });
});

/**
 * Paczka 130 – logo marki to SVG wstawiane inline. Model odrzuca wrogie SVG (marka-strony.spec.ts); tu druga linia
 * obrony: renderer dostaje migawkę z pominięciem walidacji (np. stary zapis) i mimo to nie wpuszcza skryptu ani zdarzeń.
 */
describe('XSS: SVG logo marki', () => {
  const WROGIE_SVG = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><script>alert(1)</script></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1" onload="alert(2)"><rect width="1" height="1"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><foreignObject><img src=x onerror=alert(3)></foreignObject></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><use href="javascript:alert(4)"/></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><a href="javascript:alert(5)"><rect width="1" height="1"/></a></svg>',
    '</a><script>alert(6)</script><svg viewBox="0 0 1 1"></svg>',
  ];
  const TEKST_WROGI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text font-family="A&quot; onload=&quot;alert(7)">&lt;/svg&gt;&lt;script&gt;alert(8)&lt;/script&gt;</text></svg>';

  const zMarka = (svg: string): StronaWejscie => {
    const w = structuredClone(PRZYKLADY.salon!);
    const m = { markaId: 'm', wersja: 1, nazwa: 'M', logoPoziome: svg, sygnet: svg, logoNegatyw: svg, favicon: svg, kolory: { glowny: '#112233', akcent: '#445566' }, uzyj: { logo: true, favicon: true } };
    return { ...w, marka: m } as StronaWejscie;
  };

  it.each(WROGIE_SVG.map((s, i) => [i, s] as const))('wrogie SVG %i: model odrzuca, renderer bez walidacji rysuje inicjał bez skryptu', (_i, svg) => {
    expect(walidujStrone(zMarka(svg)).ok).toBe(false);
    const strona = { ...model(PRZYKLADY.salon!), marka: zMarka(svg).marka } as Strona;
    for (const tryb of ['publikacja', 'podglad'] as const) {
      const wynik = renderujStrone(strona, { wersja: 'hosting', tryb, bazaFontow: 'assets/fonty' });
      for (const { tresc } of htmle(wynik)) {
        const tagi = znaczniki(tresc);
        expect(tagi.filter((t) => t.nazwa === 'script').every((t) => t.atr.type === 'application/ld+json' || t.atr.src?.endsWith('assets/kreator.js'))).toBe(true);
        expect(tagi.flatMap((t) => Object.keys(t.atr)).filter((a) => a.startsWith('on'))).toEqual([]);
        expect(tresc).not.toMatch(/javascript:|foreignObject/i);
        expect(tresc).toContain('logo-znak');
      }
      expect(wynik.pliki.some((p) => p.sciezka.startsWith('assets/marka/'))).toBe(false);
      expect(wynik.ostrzezenia.join()).toMatch(/Logo marki nie przeszło kontroli/);
    }
  });

  it('tekst i atrybuty z encjami w poprawnym SVG zostają tekstem (escapowane po serializacji)', () => {
    const w = zMarka(TEKST_WROGI);
    expect(walidujStrone(w).ok).toBe(true);
    const wynik = render(w, 'hosting');
    for (const { tresc } of htmle(wynik)) {
      const tagi = znaczniki(tresc);
      expect(tagi.filter((t) => t.nazwa === 'script').every((t) => t.atr.type === 'application/ld+json' || t.atr.src?.endsWith('assets/kreator.js'))).toBe(true);
      expect(tagi.flatMap((t) => Object.keys(t.atr)).filter((a) => a.startsWith('on'))).toEqual([]);
    }
    expect(plik(wynik, 'index.html')).toContain('&lt;/svg&gt;&lt;script&gt;alert(8)&lt;/script&gt;</text>');
    expect(plik(wynik, 'index.html')).toContain('font-family="A&quot; onload=&quot;alert(7)"');
  });
});
