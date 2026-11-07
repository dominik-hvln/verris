import { PRZYKLAD_SALON } from '@verris/kreator';
import { TYPY_SEKCJI, KATALOG_WARIANTOW, type Strona } from '@verris/kreator/klient';
import { bladPod, nowaSekcja, polaSekcji, przesun, ustaw, walidujWEdytorze } from './schemat';
import { celBledu } from './edytor';
import { slugZTytulu } from './struktura';
import { slowaZTekstu } from './panel-seo';
import { odczytajWiadomosc } from './podglad';
import { etapPoCzasie, postepPoCzasie } from './generowanie';

const salon = () => structuredClone(PRZYKLAD_SALON) as unknown as Strona;

describe('formularz z typu sekcji (schemat zod)', () => {
  it('cennik: pola z typami i limitami ze schematu, netto prowadzone przez brutto', () => {
    const pola = polaSekcji('cennik');
    expect(pola.map((p) => p.klucz)).toEqual(['naglowek', 'wstep', 'pakiety', 'uwaga']);
    const pakiety = pola.find((p) => p.klucz === 'pakiety')!.opis;
    expect(pakiety).toMatchObject({ rodzaj: 'lista', min: 1, max: 6 });
    if (pakiety.rodzaj !== 'lista' || pakiety.element.rodzaj !== 'obiekt') throw new Error('pakiety');
    const cena = pakiety.element.pola.find((p) => p.klucz === 'cenaBrutto')!;
    expect(cena).toMatchObject({ opis: { rodzaj: 'liczba', pustaDozwolona: true }, wymaganyKlucz: true });
    expect(pakiety.element.pola.find((p) => p.klucz === 'przycisk')!.opis.rodzaj).toBe('przycisk');
  });

  it('kontakt: pola formularza jako wielokrotny wybór; obrazy i przyciski rozpoznane; pola techniczne ukryte', () => {
    expect(polaSekcji('kontakt').find((p) => p.klucz === 'pola')!.opis).toMatchObject({ rodzaj: 'wybory' });
    const hero = polaSekcji('hero');
    expect(hero.find((p) => p.klucz === 'obraz')!.opis.rodzaj).toBe('obraz');
    expect(hero.find((p) => p.klucz === 'przyciski')!.opis).toMatchObject({ rodzaj: 'lista', max: 2, element: { rodzaj: 'przycisk' } });
    const oferta = polaSekcji('oferta').find((p) => p.klucz === 'pozycje')!.opis;
    if (oferta.rodzaj !== 'lista' || oferta.element.rodzaj !== 'obiekt') throw new Error('oferta');
    expect(oferta.element.pola.map((p) => p.klucz)).not.toContain('ikona');
  });

  it('nowa sekcja każdego typu przechodzi walidację modelu (znaczniki do uzupełnienia zamiast wymyślonej treści)', () => {
    for (const typ of TYPY_SEKCJI) {
      const m = salon();
      const s = nowaSekcja(typ, KATALOG_WARIANTOW[typ][0]!.id, new Set(m.strony[0]!.sekcje.map((x) => x.id)));
      m.strony[0]!.sekcje.push(s);
      expect({ typ, ...walidujWEdytorze(m) }).toMatchObject({ typ, ok: true });
    }
    const faq = nowaSekcja('faq', 'faq-akordeon', new Set(['faq']));
    expect(faq.id).toBe('faq-2');
    expect((faq.dane as { pytania: { pytanie: string }[] }).pytania[0]!.pytanie).toBe('[Pytanie]');
  });

  it('walidacja w edytorze: polskie komunikaty przypięte do ścieżki pola, reguły spójności jak w API', () => {
    const m = salon() as unknown as { seo: { tytul: string }; strony: { sekcje: { dane: { naglowek: string } }[] }[] };
    m.seo.tytul = 'x'.repeat(75);
    m.strony[0]!.sekcje[0]!.dane.naglowek = '';
    const w = walidujWEdytorze(m);
    expect(w.ok).toBe(false);
    expect(w.bledy.get('seo.tytul')).toBe('Najwyżej 70 znaków – skróć tekst.');
    expect(w.bledy.get('strony.0.sekcje.0.dane.naglowek')).toBe('Uzupełnij to pole.');
    expect(bladPod(w.bledy, 'strony.0.sekcje.0')).toBe('Uzupełnij to pole.');
    expect(bladPod(w.bledy, 'strony.0.sekcje.1')).toBeNull();

    const d = salon();
    d.strony[0]!.sekcje[1]!.id = d.strony[0]!.sekcje[0]!.id;
    expect(walidujWEdytorze(d).bledy.get('strony.0.sekcje.1.id')).toMatch(/powtórzony identyfikator/);
  });

  it('ustaw: kopia bez mutacji, undefined usuwa pole opcjonalne; przesun zmienia kolejność', () => {
    const m = { a: { b: [1, 2], c: 'x' } };
    const n = ustaw(m, ['a', 'b', 1], 5);
    expect(n).toEqual({ a: { b: [1, 5], c: 'x' } });
    expect(m.a.b).toEqual([1, 2]);
    expect(ustaw(m, ['a', 'c'], undefined)).toEqual({ a: { b: [1, 2] } });
    expect(przesun(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(przesun(['a'], 0, 1)).toEqual(['a']);
  });
});

describe('pomocnicze edytora', () => {
  it('adres podstrony z tytułu: bez polskich znaków, unikalny', () => {
    expect(slugZTytulu('Usługi i ceny', new Set(['']))).toBe('uslugi-i-ceny');
    expect(slugZTytulu('Żółć', new Set(['zolc']))).toBe('zolc-2');
    expect(slugZTytulu('!!!', new Set())).toBe('podstrona');
  });

  it('słowa kluczowe: przecinki, bez pustych i powtórzeń, najwyżej 12', () => {
    expect(slowaZTekstu('fryzjer Poznań, , koloryzacja, fryzjer Poznań')).toEqual(['fryzjer Poznań', 'koloryzacja']);
    expect(slowaZTekstu(Array.from({ length: 20 }, (_, i) => `s${i}`).join(','))).toHaveLength(12);
  });

  it('błąd → właściwa zakładka i sekcja', () => {
    expect(celBledu('strony.1.sekcje.3.dane.naglowek')).toEqual({ zakladka: 'sekcja', podstrona: 1, sekcja: 3 });
    expect(celBledu('strony.2.seo.tytul')).toEqual({ zakladka: 'seo', podstrona: 2 });
    expect(celBledu('motyw.paleta.tlo')).toEqual({ zakladka: 'motyw' });
    expect(celBledu('firma.telefon')).toEqual({ zakladka: 'seo' });
  });

  it('wiadomości z ramki podglądu: tylko znane kształty od skryptu edytora', () => {
    expect(odczytajWiadomosc({ zrodlo: 'verris-podglad', typ: 'sekcja', id: 'hero' })).toEqual({ typ: 'sekcja', id: 'hero' });
    expect(odczytajWiadomosc({ zrodlo: 'verris-podglad', typ: 'sekcja', id: '"><img>' })).toBeNull();
    expect(odczytajWiadomosc({ zrodlo: 'inne', typ: 'sekcja', id: 'hero' })).toBeNull();
    expect(odczytajWiadomosc({ zrodlo: 'verris-podglad', typ: 'przewin', y: 120 })).toEqual({ typ: 'przewin', y: 120 });
    expect(odczytajWiadomosc('tekst')).toBeNull();
  });

  it('ekran generowania: etapy po czasie, postęp nigdy 100% przed końcem', () => {
    expect([0, 11, 12, 74, 75, 600].map(etapPoCzasie)).toEqual([0, 0, 1, 1, 2, 2]);
    expect(postepPoCzasie(0)).toBe(0);
    expect(postepPoCzasie(10_000)).toBe(95);
    expect(postepPoCzasie(30)).toBeLessThan(postepPoCzasie(60));
  });
});
