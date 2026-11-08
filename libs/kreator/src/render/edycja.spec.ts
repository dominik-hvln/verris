import { oczyscTekst, poleObrazu, poleTekstowe, wartoscPod, zastosujTekst } from '../edycja.ts';
import { Sekcja, type Strona, type StronaWejscie } from '../model.ts';
import { WERSJE_KREATORA } from '../plany.ts';
import { dodatkiMostu, kodMostu } from './edycja-most.ts';
import { htmle, model, odEncji, PRZYKLADY, render, wszystkieWarianty, zeZdjeciami } from './testy.pomoc.ts';

/**
 * Paczka 122 – edycja na stronie: atrybuty `data-k*` tylko w podglądzie z `edycja`, ścieżki wskazują pola modelu
 * z edytora (także gdy plan bez Pro usuwa sekcje), limity ze schematu zod, zmiana tekstu z podglądu (edycja.ts).
 */

const FIKSTURY: [string, StronaWejscie][] = [...Object.entries(PRZYKLADY), ['wszystkie-warianty', wszystkieWarianty()], ['ze-zdjeciami', zeZdjeciami(PRZYKLADY.studio!)]];

interface PoleHtml {
  sciezka: string;
  max: number;
  wiele: boolean;
  tekst: string;
}

/** Elementy z data-k: ścieżka, limit i tekst (zawartość do pasującego znacznika zamykającego, bez znaczników). */
function polaHtml(html: string): PoleHtml[] {
  const wynik: PoleHtml[] = [];
  const re = /<([a-z][a-z0-9]*)\b([^>]*?)\sdata-k="([^"]*)"([^>]*)>/g;
  for (const m of html.matchAll(re)) {
    const tag = m[1]!;
    const atrybuty = `${m[2]} ${m[4]}`;
    const i = m.index! + m[0].length;
    let glebokosc = 1;
    const otwarcie = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g');
    otwarcie.lastIndex = i;
    let koniec = -1;
    for (let x = otwarcie.exec(html); x; x = otwarcie.exec(html)) {
      glebokosc += x[0].startsWith('</') ? -1 : 1;
      if (glebokosc === 0) {
        koniec = x.index;
        break;
      }
    }
    if (koniec < 0) throw new Error(`Brak zamknięcia <${tag}> dla ${m[3]}`);
    const wnetrze = html.slice(i, koniec);
    wynik.push({
      sciezka: odEncji(m[3]!),
      max: Number(/data-k-max="(\d+)"/.exec(atrybuty)?.[1] ?? NaN),
      wiele: /data-k-wiele="1"/.test(atrybuty),
      tekst: odEncji(wnetrze.replace(/<[^>]+>/g, '')),
    });
  }
  return wynik;
}

const bezTwardych = (t: string) => t.replace(/\u00a0/g, ' ');

describe('edycja na stronie: atrybuty w HTML', () => {
  it.each(FIKSTURY)('%s: publikacja (nawet z edycja: true) i zwykły podgląd nie mają żadnego data-k*', (_n, wej) => {
    for (const wersja of WERSJE_KREATORA) {
      for (const opcje of [{ tryb: 'publikacja' as const, edycja: true }, { tryb: 'podglad' as const }, { tryb: 'podglad' as const, podgladPro: true }]) {
        for (const { sciezka, tresc } of htmle(render(wej, wersja, opcje))) {
          expect({ plik: `${wersja}/${opcje.tryb}/${sciezka}`, k: /\sdata-k(-[a-z]+)?="/.test(tresc) }).toEqual({ plik: `${wersja}/${opcje.tryb}/${sciezka}`, k: false });
        }
      }
    }
  });

  it.each(FIKSTURY)('%s: każda ścieżka data-k wskazuje tekst modelu równy tekstowi w HTML, limit = schemat', (_n, wej) => {
    const m = model(wej);
    for (const wersja of WERSJE_KREATORA) {
      for (const podgladPro of [false, true]) {
        const wynik = render(wej, wersja, { tryb: 'podglad', edycja: true, podgladPro });
        let ile = 0;
        for (const { sciezka: plik, tresc } of htmle(wynik)) {
          for (const p of polaHtml(tresc)) {
            ile++;
            const kto = `${wersja}/${podgladPro}/${plik}: ${p.sciezka}`;
            const w = wartoscPod(m, p.sciezka);
            expect({ kto, typ: typeof w }).toEqual({ kto, typ: 'string' });
            // Renderer wiąże jednoliterowe słowa twardą spacją (sierotki) – mostek zamienia je z powrotem na spacje.
            expect({ kto, tekst: bezTwardych(p.tekst) }).toEqual({ kto, tekst: bezTwardych(w as string) });
            const pole = poleTekstowe(m, p.sciezka);
            expect({ kto, max: p.max, wiele: p.wiele }).toEqual({ kto, max: pole?.max, wiele: pole?.wiele });
          }
        }
        expect(ile).toBeGreaterThan(10);
      }
    }
  });

  it('wszystkie warianty: nagłówek każdej sekcji, sekcje, nazwa firmy, przyciski i odpowiedzi FAQ są edytowalne', () => {
    const wej = wszystkieWarianty();
    const m = model(wej);
    const wynik = render(wej, 'pro', { tryb: 'podglad', edycja: true });
    const wszystko = htmle(wynik).map((h) => h.tresc).join('\n');
    const sciezki = new Set(polaHtml(wszystko).map((p) => p.sciezka));
    m.strony.forEach((p, i) =>
      p.sekcje.forEach((s, j) => {
        if (s.ukryta) return;
        expect(wszystko).toContain(`data-k-sekcja="${s.id}"`);
        expect({ s: s.id, ok: sciezki.has(`strony.${i}.sekcje.${j}.dane.naglowek`) }).toEqual({ s: s.id, ok: true });
      }),
    );
    expect(sciezki.has('firma.nazwa')).toBe(true);
    expect([...sciezki].some((s) => /\.dane\.przyciski\.0\.etykieta$/.test(s))).toBe(true);
    expect([...sciezki].some((s) => /\.dane\.pakiety\.\d+\.cechy\.\d+$/.test(s))).toBe(true);
    expect([...sciezki].some((s) => /\.dane\.pozycje\.\d+\.tytul$/.test(s))).toBe(true);
    expect([...sciezki].some((s) => /\.dane\.kroki\.\d+\.tytul$/.test(s))).toBe(true);
    const odp = polaHtml(wszystko).filter((p) => /\.dane\.pytania\.\d+\.odpowiedz$/.test(p.sciezka));
    expect(odp.length).toBeGreaterThan(0);
    expect(odp.every((p) => p.wiele)).toBe(true);
    // Ceny liczbowe nie są pisane w miejscu – otwierają pole formularza.
    expect(wszystko).toMatch(/data-k-formularz="strony\.\d+\.sekcje\.\d+\.dane\.pakiety\.\d+\.cenaBrutto"/);
    expect(wszystko).not.toMatch(/data-k="[^"]*cenaBrutto"/);
  });

  it('plan bez Pro usuwa sekcję sklepu na początku strony – ścieżki dalej wskazują model z edytora', () => {
    const wej = structuredClone(PRZYKLADY.salon!);
    wej.strony[0]!.sekcje.unshift({ id: 'sklep', typ: 'produkty', wariant: 'produkty-kafle', dane: { naglowek: 'Sklep', produkty: [{ nazwa: 'Szampon', cenaBrutto: 30 }] } } as never);
    const m = model(wej);
    const html = htmle(render(wej, 'hosting', { tryb: 'podglad', edycja: true })).find((h) => h.sciezka === 'index.html')!.tresc;
    expect(html).not.toContain('data-k-sekcja="sklep"');
    const pola = polaHtml(html);
    const hero = m.strony[0]!.sekcje.findIndex((s) => s.typ === 'hero');
    expect(hero).toBe(1);
    expect(pola.map((p) => p.sciezka)).toContain(`strony.0.sekcje.${hero}.dane.naglowek`);
    for (const p of pola) expect(bezTwardych(p.tekst)).toBe(bezTwardych(wartoscPod(m, p.sciezka) as string));
  });

  it.each(FIKSTURY)('%s: każda ścieżka data-k-obraz wskazuje miejsce na Obraz w modelu (obiekt Obraz albo puste pole Obraz)', (_n, wej) => {
    const m = model(wej);
    const html = htmle(render(wej, 'pro', { tryb: 'podglad', edycja: true })).map((h) => h.tresc).join('\n');
    const sciezki = [...html.matchAll(/data-k-obraz="([^"]*)"/g)].map((x) => odEncji(x[1]!));
    // (fikstura księgowej nie ma zdjęć – pokrycie typów sekcji sprawdza następny test)
    for (const s of sciezki) {
      expect({ s, ok: poleObrazu(m, s) }).toEqual({ s, ok: true });
      const w = wartoscPod(m, s);
      expect({ s, typ: w === undefined ? 'brak' : typeof (w as { alt?: unknown }).alt }).toEqual({ s, typ: w === undefined ? 'brak' : 'string' });
    }
  });

  it('wszystkie warianty: obrazy hero, galerii, zespołu, o nas, produktów i bloga mają data-k-obraz', () => {
    const wej = zeZdjeciami(wszystkieWarianty());
    const html = htmle(render(wej, 'pro', { tryb: 'podglad', edycja: true })).map((h) => h.tresc).join('\n');
    for (const wzor of [/\.dane\.obraz"/, /\.dane\.obrazy\.\d+"/, /\.dane\.osoby\.\d+\.obraz"/, /\.dane\.produkty\.\d+\.obraz"/, /\.dane\.wpisy\.\d+\.obraz"/]) {
      expect(html).toMatch(new RegExp(`data-k-obraz="strony\\.\\d+\\.sekcje\\.\\d+${wzor.source}`));
    }
  });

  it('nagłówek z wyróżnieniem: jeden element data-k, tekst całego nagłówka', () => {
    const m = model(PRZYKLADY.salon!);
    const hero = m.strony[0]!.sekcje[0]!;
    if (hero.typ !== 'hero' || !hero.dane.wyroznienie) throw new Error('fikstura: hero z wyróżnieniem');
    const html = htmle(render(PRZYKLADY.salon!, 'pro', { tryb: 'podglad', edycja: true }))[0]!.tresc;
    const naglowek = polaHtml(html).find((p) => p.sciezka === 'strony.0.sekcje.0.dane.naglowek')!;
    expect(bezTwardych(naglowek.tekst)).toBe(hero.dane.naglowek);
    expect(html).toMatch(/data-k="strony\.0\.sekcje\.0\.dane\.naglowek"[^>]*>[^]*?<em class="wyr">/);
  });
});

describe('edycja.ts – pola i zmiana tekstu', () => {
  const m = () => model(PRZYKLADY.salon!) as Strona;
  const maxSchematu = (typ: string, pole: string) => {
    const opcja = (Sekcja as unknown as { options: { shape: { typ: { value: string }; dane: { shape: Record<string, { maxLength: number }> } } }[] }).options.find(
      (o) => o.shape.typ.value === typ,
    )!;
    return opcja.shape.dane.shape[pole]!.maxLength;
  };

  it('limit zależy od typu sekcji (hero 140, inne 120) i pochodzi ze schematu', () => {
    const s = m();
    const ih = s.strony[0]!.sekcje.findIndex((x) => x.typ === 'hero');
    const io = s.strony[0]!.sekcje.findIndex((x) => x.typ === 'oferta');
    expect(poleTekstowe(s, `strony.0.sekcje.${ih}.dane.naglowek`)).toEqual({ max: maxSchematu('hero', 'naglowek'), wymagane: true, opcjonalne: false, wiele: false });
    expect(poleTekstowe(s, `strony.0.sekcje.${io}.dane.naglowek`)?.max).toBe(maxSchematu('oferta', 'naglowek'));
    expect(maxSchematu('hero', 'naglowek')).not.toBe(maxSchematu('oferta', 'naglowek'));
  });

  it('odrzuca pola techniczne, z formatem, zdjęcia, SEO, motyw i ścieżki spoza modelu', () => {
    const s = m();
    const ih = s.strony[0]!.sekcje.findIndex((x) => x.typ === 'hero');
    for (const zla of [
      `strony.0.sekcje.${ih}.dane.przyciski.0.cel`,
      `strony.0.sekcje.${ih}.id`,
      `strony.0.sekcje.${ih}.wariant`,
      `strony.0.sekcje.${ih}.dane.obraz.alt`,
      `strony.0.sekcje.${ih}.dane.obraz`,
      'strony.0.slug',
      'seo.tytul',
      'motyw.fonty.naglowki',
      'firma.email',
      'firma.telefon',
      'firma.adres.ulica',
      'stopka.politykaPrywatnosci',
      'strony.0.sekcje.99.dane.naglowek',
      'strony.0.sekcje.0.dane.nieMa',
      'strony.0.sekcje.0.__proto__',
      'constructor.prototype',
      'strony..0',
      '',
    ]) {
      expect({ zla, pole: poleTekstowe(s, zla) }).toEqual({ zla, pole: null });
    }
    expect(poleTekstowe(s, 'firma.nazwa')?.max).toBe(80);
    expect(poleObrazu(s, `strony.0.sekcje.${ih}.dane.obraz`)).toBe(true);
    expect(poleObrazu(s, `strony.0.sekcje.${ih}.dane.naglowek`)).toBe(false);
    expect(poleObrazu(s, 'seo.obrazOg')).toBe(false);
  });

  it('oczyszczanie: znaki sterujące, twarde spacje, nowe linie tylko w polach wielowierszowych, limit', () => {
    expect(oczyscTekst(' Ala\u00a0ma\u0007 kota\n\nnowa ', { max: 100, wiele: false })).toEqual({ tekst: 'Ala ma kota nowa', przycieto: false });
    expect(oczyscTekst('Linia 1\r\n\r\n\r\nLinia 2\u2028', { max: 100, wiele: true })).toEqual({ tekst: 'Linia 1\n\nLinia 2', przycieto: false });
    expect(oczyscTekst('abcdef', { max: 4, wiele: false })).toEqual({ tekst: 'abcd', przycieto: true });
    expect(oczyscTekst('Dwie  spacje\t i tab', { max: 100, wiele: false }).tekst).toBe('Dwie spacje i tab');
    expect(oczyscTekst('abc😀', { max: 4, wiele: false }).tekst).toBe('abc');
  });

  it('zastosujTekst: zmiana pod ścieżką bez mutacji, przycięcie, pusty wymagany odrzucony, pusty opcjonalny usuwa pole', () => {
    const s = m();
    const przed = JSON.stringify(s);
    const ih = s.strony[0]!.sekcje.findIndex((x) => x.typ === 'hero');
    const p = `strony.0.sekcje.${ih}.dane.podtytul`;
    const w = zastosujTekst(s, p, 'Nowy podtytuł');
    expect(w.ok && wartoscPod(w.model, p)).toBe('Nowy podtytuł');
    expect(JSON.stringify(s)).toBe(przed);
    const dlugi = zastosujTekst(s, p, 'x'.repeat(500));
    expect(dlugi.ok && dlugi.przycieto && (wartoscPod(dlugi.model, p) as string).length).toBe(poleTekstowe(s, p)!.max);
    expect(zastosujTekst(s, `strony.0.sekcje.${ih}.dane.naglowek`, '   ')).toEqual({ ok: false, powod: 'pusty' });
    const pusty = zastosujTekst(s, p, '');
    expect(pusty.ok && Object.prototype.hasOwnProperty.call((pusty.model.strony[0]!.sekcje[ih]! as { dane: object }).dane, 'podtytul')).toBe(false);
    expect(zastosujTekst(s, `strony.0.sekcje.${ih}.dane.przyciski.0.cel`, '#x')).toEqual({ ok: false, powod: 'sciezka' });
    expect(zastosujTekst(s, p, 42)).toEqual({ ok: false, powod: 'sciezka' });
  });

  it('nagłówek hero: wyróżnienie zostaje, gdy fragment nadal jest w tekście, inaczej znika', () => {
    const s = m();
    const ih = s.strony[0]!.sekcje.findIndex((x) => x.typ === 'hero');
    const hero = s.strony[0]!.sekcje[ih]!;
    if (hero.typ !== 'hero' || !hero.dane.wyroznienie) throw new Error('fikstura');
    const wyr = hero.dane.wyroznienie;
    const sciezka = `strony.0.sekcje.${ih}.dane.naglowek`;
    const zostaje = zastosujTekst(s, sciezka, `Zupełnie nowy ${wyr} początek`);
    expect(zostaje.ok && wartoscPod(zostaje.model, `strony.0.sekcje.${ih}.dane.wyroznienie`)).toBe(wyr);
    expect(zostaje.ok && zostaje.przerysuj).toBe(false);
    const znika = zastosujTekst(s, sciezka, 'Bez wyróżnionego fragmentu');
    expect(znika.ok && wartoscPod(znika.model, `strony.0.sekcje.${ih}.dane.wyroznienie`)).toBeUndefined();
    expect(znika.ok && znika.przerysuj).toBe(true);
  });
});

describe('mostek – kod', () => {
  it('tryb trafia do konfiguracji, kod jest poprawnym JS i nie zamyka znacznika <script>', () => {
    for (const tryb of ['edycja', 'zaznacz'] as const) {
      const kod = kodMostu({ tryb });
      expect(() => new Function(kod)).not.toThrow();
      expect(kod).toContain(`"tryb":"${tryb}"`);
      expect(kod).not.toMatch(/<\/script/i);
      expect(kod).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/);
      const html = dodatkiMostu({ tryb });
      expect(html.match(/<\/script>/g)?.length).toBe(1);
    }
  });
});
