import { KATALOG_WARIANTOW, SEKCJE_PRO } from '../katalog.ts';
import type { StronaWejscie } from '../model.ts';
import { WERSJE_KREATORA } from '../plany.ts';
import { htmle, plik, PRZYKLADY, render, sekcjaHtml, tekst } from './testy.pomoc.ts';

const WARIANTY_PRO = Object.values(KATALOG_WARIANTOW)
  .flat()
  .filter((w) => w.pro)
  .map((w) => w.id);

function klasySekcji(html: string): string[] {
  return [...html.matchAll(/<section id="[^"]*" class="([^"]*)"/g)].flatMap((m) => m[1]!.split(' '));
}

describe('dopasowanie do wersji', () => {
  it.each(Object.keys(PRZYKLADY).flatMap((n) => (['proba', 'hosting'] as const).map((w) => [n, w] as const)))(
    '%s / %s: publikacja bez sekcji Pro, wariantów Pro i wstęgi',
    (nazwa, wersja) => {
      const wynik = render(PRZYKLADY[nazwa]!, wersja);
      for (const { sciezka, tresc } of htmle(wynik)) {
        const klasy = klasySekcji(tresc);
        for (const typ of SEKCJE_PRO) expect(klasy, `${sciezka}: sekcja ${typ}`).not.toContain(`sek-${typ}`);
        for (const w of WARIANTY_PRO) expect(klasy, `${sciezka}: wariant ${w}`).not.toContain(w);
        expect(tresc).not.toContain('wstega-pro');
        expect(tresc).not.toContain('jest-pro');
        expect(sciezka.startsWith('blog/')).toBe(false);
      }
      const js = wynik.pliki.find((p) => p.sciezka === 'assets/kreator.js')?.tresc ?? '';
      for (const modul of ['Karuzele', 'Powiększanie zdjęć', 'Przełącznik cen', 'Postęp czytania']) expect(js).not.toContain(modul);
    },
  );

  it('hosting zamienia warianty Pro na darmowe odpowiedniki i opisuje zmiany', () => {
    const ceramika = render(PRZYKLADY.ceramika!, 'hosting');
    expect(sekcjaHtml(plik(ceramika, 'index.html'), 'start')).toContain('hero-podzielony');
    expect(sekcjaHtml(plik(ceramika, 'index.html'), 'sklep')).toBeNull();
    expect(plik(ceramika, 'index.html')).not.toMatch(/href="#sklep"/);
    expect(ceramika.ostrzezenia).toContain('Układ „hero-mozaika” zamieniony na „hero-podzielony”');

    const studio = render(PRZYKLADY.studio!, 'hosting');
    const html = plik(studio, 'index.html');
    expect(sekcjaHtml(html, 'realizacje')).toContain('galeria-mozaika');
    expect(html).not.toContain('karuzela-btn');
    // menu nie prowadzi do ukrytego bloga
    expect(tekst(html.slice(html.indexOf('<nav'), html.indexOf('</nav>')))).not.toContain('Blog');
  });

  it('pro zostawia elementy Pro bez wstęgi', () => {
    const html = plik(render(PRZYKLADY.ceramika!, 'pro'), 'index.html');
    expect(sekcjaHtml(html, 'start')).toContain('hero-mozaika');
    expect(sekcjaHtml(html, 'sklep')).toContain('sek-produkty');
    expect(html).not.toContain('wstega-pro');
  });

  it.each(['ceramika', 'studio'])('%s: podgląd z podgladPro w hosting pokazuje elementy Pro ze wstęgą', (nazwa) => {
    const wynik = render(PRZYKLADY[nazwa]!, 'hosting', { tryb: 'podglad', podgladPro: true });
    const html = plik(wynik, 'index.html');
    const pro = nazwa === 'ceramika' ? ['start', 'sklep'] : ['realizacje', 'blog'];
    const zwykle = nazwa === 'ceramika' ? ['pracownia', 'kontakt'] : ['start', 'proces', 'kontakt'];
    for (const id of pro) {
      const sek = sekcjaHtml(html, id)!;
      expect(sek, id).toContain('jest-pro');
      expect(sek, id).toContain('<span class="wstega-pro"');
    }
    for (const id of zwykle) expect(sekcjaHtml(html, id), id).not.toContain('wstega-pro');
    if (nazwa === 'studio') {
      expect(wynik.pliki.map((p) => p.sciezka)).toContain('blog/mala-kuchnia-bez-kompromisow/index.html');
      expect(sekcjaHtml(html, 'realizacje')).toContain('karuzela-btn');
    }
    expect(wynik.ostrzezenia.join(' ')).not.toContain('zamieniony');
  });

  it('podgląd bez podgladPro w hosting zastępuje elementy Pro jak publikacja', () => {
    const html = plik(render(PRZYKLADY.ceramika!, 'hosting', { tryb: 'podglad' }), 'index.html');
    expect(html).not.toContain('wstega-pro');
    expect(sekcjaHtml(html, 'sklep')).toBeNull();
    expect(sekcjaHtml(html, 'start')).toContain('hero-podzielony');
  });
});

describe('znak „Stworzone w Verris Kreator” w stopce', () => {
  const ZNAKI = ['jasny', 'ciemny', 'minimalny'] as const;
  it.each(Object.keys(PRZYKLADY).flatMap((n) => WERSJE_KREATORA.flatMap((w) => ZNAKI.map((z) => [n, w, z] as const))))('%s / %s / %s: zawsze w stopce każdej strony', (nazwa, wersja, znak) => {
    const wej: StronaWejscie = { ...PRZYKLADY[nazwa]!, stopka: { ...PRZYKLADY[nazwa]!.stopka, znakKreatora: znak } };
    const wynik = render(wej, wersja);
    for (const { sciezka, tresc } of htmle(wynik)) {
      const stopka = tresc.slice(tresc.indexOf('<footer'), tresc.indexOf('</footer>'));
      expect(stopka, sciezka).toMatch(/<a class="znak-kreatora[^"]*" href="https:\/\/verris\.pl\/kreator" rel="noopener" aria-label="Stworzone w Verris Kreator">/);
      const widoczny = tekst(stopka);
      expect(widoczny, sciezka).toContain('Stworzone w');
      const minimalny = znak === 'minimalny' && wersja === 'pro';
      if (minimalny) {
        expect(stopka).toContain('znak-minimalny');
        expect(widoczny).toContain('Stworzone w Verris Kreator');
      } else {
        // pełny znak: napis „Stworzone w” i logo verris / Kreator
        expect(stopka).not.toContain('znak-minimalny');
        expect(stopka).toContain('<span class="znak-tekst">Stworzone w</span><svg class="znak-logo"');
      }
    }
  });

  it('logo w stopce ma kolory pod rzeczywiste tło stopki (ciemne tło – wordmark jasny)', () => {
    const html = plik(render(PRZYKLADY.ksiegowa!, 'pro'), 'index.html');
    const stopka = html.slice(html.indexOf('<footer'));
    expect(stopka).toContain('fill="#f4f4ee"/><path transform="translate(187.44 81)');
    expect(stopka).toContain('fill="#34e5a0"/></svg>');
  });
});
