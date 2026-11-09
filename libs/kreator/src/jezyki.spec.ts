import {
  jezykPodstrony,
  kluczPodstrony,
  oryginalPodstrony,
  podstronaWJezyku,
  skrotTresci,
  tlumaczenieNieaktualne,
  usunWersjeJezykowa,
  wersjeJezykowe,
  wstawWersjeJezykowa,
} from './jezyki.ts';
import { walidujStrone, type Strona } from './model.ts';
import { PRZYKLAD_SALON } from './przyklady/salon.ts';

function salon(): Strona {
  const w = walidujStrone(PRZYKLAD_SALON);
  if (!w.ok) throw new Error(w.bledy.join('\n'));
  return w.strona;
}

/** Salon z podstroną „cennik” i wersją angielską (główna `en` + `en/prices` z kluczem `cennik`). */
function salonEn(): Strona {
  const s = salon();
  s.strony.push({ ...structuredClone(s.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
  return wstawWersjeJezykowa(s, 'en', [
    podstronaWJezyku(s, s.strony[0]!, 'en', { tytul: 'Home', seo: {}, sekcje: s.strony[0]!.sekcje }),
    podstronaWJezyku(s, s.strony[1]!, 'en', { tytul: 'Prices', seo: {}, sekcje: s.strony[1]!.sekcje, sciezka: 'prices' }),
  ]);
}

const bledy = (s: unknown) => {
  const w = walidujStrone(s);
  return w.ok ? [] : w.bledy;
};

describe('wersje językowe – model', () => {
  it('poprawna wersja angielska: główna `en`, przetłumaczony adres z kluczem oryginału', () => {
    const s = salonEn();
    expect(bledy(s)).toEqual([]);
    expect(s.jezykiDodatkowe).toEqual(['en']);
    expect(s.strony.map((p) => p.slug)).toEqual(['', 'cennik', 'en', 'en/prices']);
    expect(s.strony.map((p) => jezykPodstrony(s, p))).toEqual(['pl', 'pl', 'en', 'en']);
    expect(s.strony.map((p) => kluczPodstrony(s, p))).toEqual(['', 'cennik', '', 'cennik']);
    expect(wersjeJezykowe(s, s.strony[1]!).map((w) => w.podstrona.slug)).toEqual(['cennik', 'en/prices']);
    expect(oryginalPodstrony(s, s.strony[3]!)?.slug).toBe('cennik');
  });

  it('każdy język dodatkowy musi mieć stronę główną', () => {
    const s = salon();
    s.jezykiDodatkowe = ['de'];
    expect(bledy(s).join()).toContain('wersja „de” nie ma strony głównej');
  });

  it('podstrona w języku dodatkowym ma prefiks języka; adres z prefiksem nie należy do języka głównego', () => {
    const s = salonEn();
    s.strony[3]!.slug = 'prices';
    expect(bledy(s).join()).toContain('musi zaczynać się od „en”');
    const t = salonEn();
    t.strony[1]!.jezyk = 'pl';
    t.strony[1]!.slug = 'en/cennik';
    expect(bledy(t).join()).toContain('zarezerwowany dla wersji „en”');
  });

  it('język podstrony musi być włączony', () => {
    const s = salon();
    s.strony.push({ ...structuredClone(s.strony[0]!), slug: 'de', jezyk: 'de', tytul: 'Start' });
    expect(bledy(s).join()).toContain('język „de” nie jest włączony');
  });

  it('klucz łączy najwyżej jedną podstronę na język; adresy unikalne', () => {
    const s = salonEn();
    s.strony.push({ ...structuredClone(s.strony[3]!), slug: 'en/pricing' });
    expect(bledy(s).join()).toContain('ma już wersję w języku „en”');
    const t = salonEn();
    t.strony[3]!.slug = 'en';
    expect(bledy(t).join()).toContain('powtórzony adres');
  });

  it('trzy człony adresu tylko z prefiksem języka (wpis bloga w wersji językowej)', () => {
    const s = salonEn();
    s.strony.push({ ...structuredClone(s.strony[3]!), slug: 'en/blog/first-post', klucz: 'blog/pierwszy' });
    expect(bledy(s)).toEqual([]);
    const t = salon();
    t.strony.push({ ...structuredClone(t.strony[0]!), slug: 'a/b/c', tytul: 'X' });
    expect(bledy(t).join()).toContain('za dużo członów adresu');
  });

  it('stary zapis bez pól języka przechodzi bez zmian (bez podbicia wersji modelu)', () => {
    expect(bledy(PRZYKLAD_SALON)).toEqual([]);
  });

  it('powtórzony język i język główny w językach dodatkowych są błędem', () => {
    const s = salonEn();
    s.jezykiDodatkowe = ['en', 'en'];
    expect(bledy(s).join()).toContain('powtórzony język');
  });
});

describe('wersje językowe – nieaktualne tłumaczenia', () => {
  it('skrót nie zależy od kolejności pól, zmienia się ze zmianą treści', () => {
    const p = salon().strony[0]!;
    const odwrocony = { sekcje: p.sekcje, seo: p.seo, tytul: p.tytul };
    expect(skrotTresci(odwrocony)).toBe(skrotTresci(p));
    expect(skrotTresci({ ...p, tytul: 'Inny' })).not.toBe(skrotTresci(p));
    expect(skrotTresci(p)).toMatch(/^[0-9a-f]{16}$/);
  });

  it('zmiana oryginału oznacza tłumaczenie jako nieaktualne', () => {
    const s = salonEn();
    expect(tlumaczenieNieaktualne(s, s.strony[3]!)).toBe(false);
    s.strony[1]!.tytul = 'Cennik usług';
    expect(tlumaczenieNieaktualne(s, s.strony[3]!)).toBe(true);
    expect(tlumaczenieNieaktualne(s, s.strony[2]!)).toBe(false);
  });

  it('ponowne wstawienie podmienia podstronę tego samego klucza; usunięcie wersji czyści język i stopkę', () => {
    const s = salonEn();
    const nowa = podstronaWJezyku(s, s.strony[1]!, 'en', { tytul: 'Price list', seo: {}, sekcje: s.strony[1]!.sekcje, sciezka: 'price-list' });
    const z = wstawWersjeJezykowa(s, 'en', [nowa]);
    expect(z.strony.map((p) => p.slug)).toEqual(['', 'cennik', 'en', 'en/price-list']);
    z.stopka.tlumaczenia = { en: { tekst: 'Footer' } };
    const u = usunWersjeJezykowa(z, 'en');
    expect(u.strony.map((p) => p.slug)).toEqual(['', 'cennik']);
    expect(u.jezykiDodatkowe).toEqual([]);
    expect(u.stopka.tlumaczenia).toBeUndefined();
    expect(bledy(u)).toEqual([]);
  });
});
