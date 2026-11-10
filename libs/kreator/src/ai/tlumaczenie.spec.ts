import { jezykPodstrony, kluczPodstrony, skrotTresci, tlumaczenieNieaktualne } from '../jezyki.ts';
import { walidujStrone, type Strona } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_SALON_EN } from '../przyklady/salon-en.ts';
import { blokMasterPromptu, blokWersji, budujZapytanieZmiany, MAX_TOKENS } from './master-prompt.ts';
import { odczytajWynikZmiany } from './odczyt.ts';
import { budujZapytanieTlumaczenia, odczytajWynikTlumaczenia } from './tlumaczenie.ts';

function model(w: unknown): Strona {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}

/** Odpowiedź „modelu” z angielskim tłumaczeniem strony głównej salonu (fikstura salon-en). */
function odpowiedzEn(zmien?: (p: Record<string, unknown>) => void, stopka?: string): string {
  const en = structuredClone(PRZYKLAD_SALON_EN.strony.find((p) => p.slug === 'en')!) as unknown as Record<string, unknown>;
  const p: Record<string, unknown> = { klucz: '', sciezka: '', tytul: en.tytul, seo: en.seo, sekcje: en.sekcje };
  zmien?.(p);
  return JSON.stringify({ podstrony: [p], ...(stopka !== undefined ? { stopka } : {}) });
}

type Sek = { id: string; dane: Record<string, unknown> };
const sekcje = (p: Record<string, unknown>) => p.sekcje as Sek[];

describe('tłumaczenie – zapytanie', () => {
  it('te same dwa bloki 1 h co generacja + blok strony 5 min; polecenie z językiem, zasadami i podstronami', () => {
    const s = model(PRZYKLAD_SALON);
    const z = budujZapytanieTlumaczenia(s, 'en', [''], 'pro', true);
    expect(z.system.map((b) => b.cache)).toEqual(['1h', '1h', '5m']);
    expect(z.system[0]!.tekst).toBe(blokMasterPromptu());
    expect(z.system[1]!.tekst).toBe(blokWersji('pro'));
    // Paczka 127: blok 3 = skrót strony, ten sam co przy zmianie sekcji – kolejne zapytania o tę stronę czytają go z cache.
    expect(z.system[2]!.tekst).toBe(budujZapytanieZmiany(s, 'x', 'start', 'pro').system[2]!.tekst);
    expect(z.maxTokens).toBe(MAX_TOKENS.tlumaczenie);
    const tresc = z.wiadomosci[0]!.content;
    expect(tresc).toContain('Przetłumacz podstrony strona główna (klucz "") na język angielski (kod en)');
    expect(tresc).toContain('Poznan');
    expect(tresc).toContain('110 PLN');
    expect(tresc).toMatch(/Nie tłumacz nazw własnych/);
    expect(tresc).toMatch(/Nie dopisuj niczego/);
    expect(tresc).toContain('"stopka"');
    expect(z.rodzaj).toBe('tlumaczenie-en-pro');
    expect(budujZapytanieTlumaczenia(s, 'de', [''], 'pro').wiadomosci[0]!.content).not.toContain('"stopka"');
  });

  it('podstrona spoza języka głównego to błąd programisty', () => {
    expect(() => budujZapytanieTlumaczenia(model(PRZYKLAD_SALON), 'en', ['nie-ma'], 'pro')).toThrow(/Brak podstrony/);
  });
});

describe('tłumaczenie – odczyt', () => {
  const s = () => model(PRZYKLAD_SALON);

  it('poprawne tłumaczenie: wersja en z kluczem, skrótem oryginału, stopką; struktura z oryginału', () => {
    const w = odczytajWynikTlumaczenia(s(), odpowiedzEn(undefined, 'An intimate hair salon in Jezyce, Poznan.'), 'en', [''], { zStopka: true, data: '2026-11-09' });
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    const en = w.strona.strony.find((p) => p.slug === 'en')!;
    expect(w.strona.jezykiDodatkowe).toEqual(['en']);
    expect(jezykPodstrony(w.strona, en)).toBe('en');
    expect(kluczPodstrony(w.strona, en)).toBe('');
    expect(en.tlumaczenie).toEqual({ zrodlo: skrotTresci(w.strona.strony[0]!), data: '2026-11-09' });
    expect(tlumaczenieNieaktualne(w.strona, en)).toBe(false);
    expect(en.sekcje[0]!.typ === 'hero' && en.sekcje[0]!.dane.naglowek).toBe('A good haircut starts with a conversation.');
    expect(en.seo.tytul).toBe('Pracownia Fal – hair salon in Poznan, Jezyce');
    expect(w.strona.stopka.tlumaczenia?.en?.tekst).toBe('An intimate hair salon in Jezyce, Poznan.');
  });

  it('pola techniczne zawsze z oryginału (model nie zmieni id, wariantu, linku ani nie doda sekcji pól)', () => {
    const w = odczytajWynikTlumaczenia(
      s(),
      odpowiedzEn((p) => {
        const h = sekcje(p)[0]!;
        h.id = 'hero-en';
        (h as unknown as { wariant: string }).wariant = 'hero-pelny';
        (h.dane.przyciski as { cel: string }[])[0]!.cel = 'https://zly.example';
        h.dane.fakty = [{ etykieta: 'Since', wartosc: '1999' }];
      }),
      'en',
      [''],
    );
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    const h = w.strona.strony.find((p) => p.slug === 'en')!.sekcje[0]!;
    expect(h.id).toBe('start');
    expect(h.wariant).toBe('hero-podzielony');
    expect(h.typ === 'hero' && h.dane.przyciski[0]!.cel).toBe('#kontakt');
    expect(h.typ === 'hero' && h.dane.fakty).toEqual([]);
  });

  it('zakaz dopisywania liczb i zmiany cen; lista o innej długości; brak tłumaczenia tekstu', () => {
    const liczba = odczytajWynikTlumaczenia(s(), odpowiedzEn((p) => void (sekcje(p)[0]!.dane.podtytul = 'Over 20 years of experience.')), 'en', ['']);
    expect(!liczba.ok && liczba.bledy.join()).toContain('liczba 20 nie występuje w oryginale');
    const cena = odczytajWynikTlumaczenia(s(), odpowiedzEn((p) => void ((sekcje(p)[1]!.dane.pozycje as { cena: string }[])[0]!.cena = 'from 99 PLN')), 'en', ['']);
    expect(!cena.ok && cena.bledy.join()).toContain('liczba 99');
    const lista = odczytajWynikTlumaczenia(s(), odpowiedzEn((p) => void (sekcje(p)[1]!.dane.pozycje as unknown[]).pop()), 'en', ['']);
    expect(!lista.ok && lista.bledy.join()).toContain('lista musi mieć 3 el.');
    const brak = odczytajWynikTlumaczenia(s(), odpowiedzEn((p) => void delete sekcje(p)[0]!.dane.naglowek), 'en', ['']);
    expect(!brak.ok && brak.bledy.join()).toContain('brak tłumaczenia tekstu');
  });

  it('opinie klientów zostają z oryginału (model nie dopisze opinii)', () => {
    const z = model(PRZYKLAD_SALON);
    const op = z.strony[0]!.sekcje.find((x) => x.id === 'opinie')!;
    if (op.typ === 'opinie') op.dane.wpisy = [{ autor: 'Anna', tresc: 'Świetne cięcie.' }];
    const w = odczytajWynikTlumaczenia(
      z,
      odpowiedzEn((p) => void (sekcje(p).find((x) => x.id === 'opinie')!.dane.wpisy = [{ autor: 'John', tresc: 'Best salon in town!' }])),
      'en',
      [''],
    );
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    const en = w.strona.strony.find((p) => p.slug === 'en')!.sekcje.find((x) => x.id === 'opinie')!;
    expect(en.typ === 'opinie' && en.dane.wpisy).toEqual([{ autor: 'Anna', tresc: 'Świetne cięcie.' }]);
  });

  it('adres podstrony w języku docelowym bez znaków diakrytycznych, unikalny; ponowne tłumaczenie podmienia wersję', () => {
    const z = model(PRZYKLAD_SALON);
    z.strony.push({ ...structuredClone(z.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
    const odp = (sciezka: string, tytul: string) =>
      JSON.stringify({
        podstrony: ['', 'cennik'].map((klucz) => {
          const p = JSON.parse(odpowiedzEn()).podstrony[0];
          return { ...p, klucz, sciezka: klucz ? sciezka : '', tytul: klucz ? tytul : p.tytul };
        }),
      });
    const w = odczytajWynikTlumaczenia(z, odp('Prices Poznań', 'Prices'), 'en', ['', 'cennik']);
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    expect(w.strona.strony.map((p) => p.slug)).toEqual(['', 'cennik', 'en', 'en/prices-poznan']);
    const w2 = odczytajWynikTlumaczenia(w.strona, odp('price-list', 'Price list'), 'en', ['', 'cennik']);
    if (!w2.ok) throw new Error(w2.bledy.join('\n'));
    expect(w2.strona.strony.map((p) => `${p.slug}:${p.tytul}`)).toEqual([':Start', 'cennik:Cennik', 'en:Home', 'en/price-list:Price list']);
  });

  it('niepoprawny JSON i brak podstrony w odpowiedzi to błędy do rundy naprawy', () => {
    expect(odczytajWynikTlumaczenia(s(), 'nie json', 'en', ['']).ok).toBe(false);
    const w = odczytajWynikTlumaczenia(s(), JSON.stringify({ podstrony: [] }), 'en', ['']);
    expect(!w.ok && w.bledy.join()).toContain('brak tłumaczenia podstrony');
  });
});

describe('zmiana sekcji w wersji językowej', () => {
  it('slug wskazuje podstronę – ta sama sekcja id w wersji en nie myli się z oryginałem', () => {
    const s = model(PRZYKLAD_SALON_EN);
    const z = budujZapytanieZmiany(s, 'Shorter', 'start', 'pro', 'en');
    expect(z.wiadomosci[0]!.content).toContain('na podstronie "en"');
    const sek = structuredClone(s.strony.find((p) => p.slug === 'en')!.sekcje[0]!) as unknown as Sek;
    sek.dane.naglowek = 'Good haircuts start with talking.';
    delete sek.dane.wyroznienie;
    const w = odczytajWynikZmiany(s, JSON.stringify(sek), 'start', 'pro', 'en');
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    const naglowek = (slug: string) => (w.strona.strony.find((p) => p.slug === slug)!.sekcje[0]!.dane as { naglowek: string }).naglowek;
    expect(naglowek('en')).toBe('Good haircuts start with talking.');
    expect(naglowek('')).toBe('Dobre cięcie zaczyna się od rozmowy.');
  });
});
