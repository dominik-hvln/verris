import { walidujStrone, type Strona, type StronaWejscie } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { sprawdzKontrastPalety } from '../style/kolory.ts';
import type { BriefStrony } from './kontrakt.ts';
import { liczbyZTekstu, odczytajWynikGeneracji, odczytajWynikZmiany, oczyscTeksty, wiadomosciNaprawy, wyciagnijJson } from './odczyt.ts';

const BRIEF: BriefStrony = {
  opis: 'Salon fryzjerski Pracownia Fal, ul. Przykładowa 12, Poznań Jeżyce. Czynne pn–pt 9:00–20:00, sob 9:00–15:00. Tel. 600 000 000, kontakt@przyklad.pl',
  typ: 'wizytowka',
  firma: { nazwa: 'Pracownia Fal', branza: 'salon fryzjerski' },
  ceny: 'Strzyżenie damskie krótkie od 110 zł, męskie od 70 zł, koloryzacja od 190 zł',
};

/** Odpowiedź „modelu”: przykład salonu jako JSON, z opcjonalną modyfikacją. */
function odpowiedz(zmien?: (s: StronaWejscie & Record<string, never>) => void): string {
  const s = structuredClone(PRZYKLAD_SALON) as StronaWejscie & Record<string, never>;
  zmien?.(s);
  return JSON.stringify(s);
}

// Dostęp do pól sekcji w danych testowych bez rozpisywania unii typów.
type Luzne = { strony: { sekcje: { id: string; wariant: string; dane: Record<string, unknown> }[] }[]; motyw: Record<string, unknown>; firma: Record<string, unknown>; stopka: Record<string, unknown> };
const luzne = (s: unknown) => s as Luzne;

function ok(w: ReturnType<typeof odczytajWynikGeneracji>): Strona {
  if (!w.ok) throw new Error(w.bledy.join('\n'));
  return w.strona;
}

describe('wyciagnijJson', () => {
  it('czysty JSON, JSON w płotkach ```json i JSON otoczony tekstem', () => {
    expect(wyciagnijJson('{"a":1}')).toEqual({ ok: true, dane: { a: 1 } });
    expect(wyciagnijJson('Oto strona:\n```json\n{"a":2}\n```\nGotowe.')).toEqual({ ok: true, dane: { a: 2 } });
    expect(wyciagnijJson('```\n{"a":3}\n```')).toEqual({ ok: true, dane: { a: 3 } });
    expect(wyciagnijJson('Proszę: {"a":4} – tyle.')).toEqual({ ok: true, dane: { a: 4 } });
    expect(wyciagnijJson('brak').ok).toBe(false);
    expect(wyciagnijJson('{"a":').ok).toBe(false);
  });

  it('odczyt generacji przyjmuje odpowiedź w płotkach', () => {
    const s = ok(odczytajWynikGeneracji('```json\n' + odpowiedz() + '\n```', 'pro', BRIEF));
    expect(s.firma.nazwa).toBe('Pracownia Fal');
  });
});

describe('odczytajWynikGeneracji – zasady treści', () => {
  it('odrzuca opinie wpisane przez AI, ze ścieżką do pętli naprawy', () => {
    const w = odczytajWynikGeneracji(
      odpowiedz((s) => {
        luzne(s).strony[0].sekcje[3].dane.wpisy = [{ autor: 'Anna K.', tresc: 'Najlepszy salon!' }];
      }),
      'pro',
      BRIEF,
    );
    expect(w.ok).toBe(false);
    if (!w.ok) expect(w.bledy.join('\n')).toMatch(/strony\.0\.sekcje\.3\.dane\.wpisy: opinie wpisuje wyłącznie klient/);
  });

  it('naprawia pauzę „—” na półpauzę „–” i usuwa emoji', () => {
    const s = ok(
      odczytajWynikGeneracji(
        odpowiedz((s) => {
          luzne(s).strony[0].sekcje[0].dane.podtytul = 'Strzyżemy—koloryzujemy i pielęgnujemy ✨ włosy';
        }),
        'pro',
        BRIEF,
      ),
    );
    const podtytul = (s.strony[0].sekcje[0] as { dane: { podtytul?: string } }).dane.podtytul;
    expect(podtytul).toBe('Strzyżemy – koloryzujemy i pielęgnujemy włosy');
    expect(JSON.stringify(s)).not.toContain('—');
    expect(oczyscTeksty({ a: ['x — y'] })).toEqual({ a: ['x – y'] });
  });

  it('odrzuca ceny spoza briefu, przyjmuje ceny z briefu i przeliczenie netto/brutto', () => {
    const zla = odczytajWynikGeneracji(
      odpowiedz((s) => {
        (luzne(s).strony[0].sekcje[1].dane.pozycje as { cena?: string }[])[1].cena = 'od 85 zł';
      }),
      'pro',
      BRIEF,
    );
    expect(zla.ok).toBe(false);
    if (!zla.ok) expect(zla.bledy.join('\n')).toMatch(/pozycje\.1\.cena: cena 85 nie występuje w briefie/);

    const zCennikiem = odczytajWynikGeneracji(
      odpowiedz((s) => {
        luzne(s).strony[0].sekcje.push({
          id: 'cennik', typ: 'cennik', wariant: 'cennik-kolumny',
          dane: { naglowek: 'Cennik', pakiety: [{ nazwa: 'Koloryzacja', cenaBrutto: 190, cenaNetto: 154.47 }, { nazwa: 'Pakiet', cenaBrutto: null }] },
        } as never);
      }),
      'pro',
      BRIEF,
    );
    expect(zCennikiem.ok).toBe(true);
    expect(liczbyZTekstu('od 1 200,50 zł, 110–150')).toEqual([1200.5, 110, 150]);
  });

  it('bez briefu nie sprawdza cen (nie da się), ale nadal odrzuca opinie', () => {
    expect(odczytajWynikGeneracji(odpowiedz((s) => ((luzne(s).strony[0].sekcje[1].dane.pozycje as { cena?: string }[])[0].cena = 'od 999 zł')), 'pro').ok).toBe(true);
  });

  it('usuwa dane kontaktowe, których nie ma w briefie; zostawia te z briefu', () => {
    const bezKontaktu: BriefStrony = { ...BRIEF, opis: 'Salon fryzjerski na Jeżycach.' };
    const s = ok(odczytajWynikGeneracji(odpowiedz(), 'pro', bezKontaktu));
    expect(s.firma.telefon).toBeUndefined();
    expect(s.firma.email).toBeUndefined();
    expect(s.firma.adres).toBeUndefined();
    expect(s.firma.godziny).toEqual([]);
    const z = ok(odczytajWynikGeneracji(odpowiedz(), 'pro', BRIEF));
    expect(z.firma.telefon).toBe('600 000 000');
    expect(z.firma.email).toBe('kontakt@przyklad.pl');
    expect(z.firma.adres?.miasto).toBe('Poznań');
    expect(z.firma.godziny).toHaveLength(2);
  });

  it('odrzuca link tel: z numerem spoza briefu i twierdzenia typu „lider rynku”', () => {
    const w = odczytajWynikGeneracji(
      odpowiedz((s) => {
        const hero = luzne(s).strony[0].sekcje[0].dane;
        (hero.przyciski as { cel: string }[])[0].cel = 'tel:+48123456789';
        hero.nadtytul = 'Lider rynku fryzjerskiego';
      }),
      'pro',
      BRIEF,
    );
    expect(w.ok).toBe(false);
    if (!w.ok) {
      expect(w.bledy.join('\n')).toMatch(/przyciski\.0\.cel: numer lub e-mail spoza briefu/);
      expect(w.bledy.join('\n')).toMatch(/nadtytul: „lider rynku”/);
    }
  });

  it('nieznany wariant i styl to błąd; font spoza katalogu i nieznany efekt są poprawiane', () => {
    const zle = odczytajWynikGeneracji(
      odpowiedz((s) => {
        luzne(s).strony[0].sekcje[0].wariant = 'hero-wymyslony';
        luzne(s).motyw.styl = 'cyberpunk';
      }),
      'pro',
      BRIEF,
    );
    expect(zle.ok).toBe(false);
    if (!zle.ok) {
      expect(zle.bledy.join('\n')).toContain('strony.0.sekcje.0.wariant');
      expect(zle.bledy.join('\n')).toContain('motyw.styl');
    }
    const s = ok(
      odczytajWynikGeneracji(
        odpowiedz((s) => {
          luzne(s).motyw.fonty = { naglowki: 'Comic Sans MS', tekst: 'Inter' };
          luzne(s).motyw.efekty = ['pojawianie', 'fajerwerki'];
        }),
        'pro',
        BRIEF,
      ),
    );
    expect(s.motyw.fonty).toEqual({ naglowki: 'Fraunces', tekst: 'Inter' });
    expect(s.motyw.efekty).toEqual(['pojawianie']);
  });

  it('koryguje paletę do WCAG AA', () => {
    const s = ok(
      odczytajWynikGeneracji(
        odpowiedz((s) => {
          (luzne(s).motyw.paleta as Record<string, string>).tekst = '#D0D0D0';
          (luzne(s).motyw.paleta as Record<string, string>).naAkcencie = '#204030';
        }),
        'pro',
        BRIEF,
      ),
    );
    expect(sprawdzKontrastPalety(s.motyw.paleta)).toEqual([]);
    expect(s.motyw.paleta.tlo).toBe('#F6F0E8');
  });
});

describe('odczytajWynikGeneracji – zgodność z wersją', () => {
  it('bez Pro: styl, warianty, efekty, animacje i znak Pro zamienione na darmowe', () => {
    const s = ok(
      odczytajWynikGeneracji(
        odpowiedz((s) => {
          luzne(s).motyw.styl = 'edytorski';
          luzne(s).motyw.fonty = { naglowki: 'Instrument Serif', tekst: 'Inter' };
          luzne(s).strony[0].sekcje[0].wariant = 'hero-mozaika';
          luzne(s).strony[0].sekcje.push({ id: 'blog', typ: 'blog', wariant: 'blog-karty', dane: { naglowek: 'Blog' } } as never);
        }),
        'hosting',
        BRIEF,
      ),
    );
    expect(s.motyw.styl).toBe('minimal-skandynawski');
    expect(s.strony[0].sekcje[0].wariant).toBe('hero-podzielony');
    expect(s.strony[0].sekcje.find((x) => x.id === 'galeria')?.wariant).toBe('galeria-mozaika');
    expect(s.strony[0].sekcje.some((x) => x.typ === 'blog')).toBe(false);
    expect(s.motyw.efekty).not.toContain('lightbox');
    expect(s.motyw.animacje).toBe('subtelne');
    expect(s.stopka.znakKreatora).toBe('jasny');
  });

  it('Pro: elementy Pro zostają, znak minimalny dozwolony', () => {
    const s = ok(odczytajWynikGeneracji(odpowiedz(), 'pro', BRIEF));
    expect(s.strony[0].sekcje.find((x) => x.id === 'galeria')?.wariant).toBe('galeria-karuzela');
    expect(s.motyw.efekty).toContain('lightbox');
    expect(s.motyw.animacje).toBe('wyraziste');
    expect(s.stopka.znakKreatora).toBe('minimalny');
  });
});

describe('odczytajWynikZmiany', () => {
  function salon(): Strona {
    const w = walidujStrone(PRZYKLAD_SALON);
    if (!w.ok) throw new Error(w.bledy.join('\n'));
    return w.strona;
  }

  it('zmiana sekcji podmienia tylko tę sekcję (id wymuszone), reszta strony bez zmian', () => {
    const s = salon();
    const nowaHero = { id: 'inne-id', typ: 'hero', wariant: 'hero-centralny', dane: { naglowek: 'Krótko—i na temat', przyciski: [{ etykieta: 'Umów wizytę', cel: '#kontakt' }] } };
    const w = odczytajWynikZmiany(s, '```json\n' + JSON.stringify(nowaHero) + '\n```', 'start', 'pro');
    const n = ok(w);
    expect(n.strony[0].sekcje[0].id).toBe('start');
    expect(n.strony[0].sekcje[0].wariant).toBe('hero-centralny');
    expect((n.strony[0].sekcje[0] as { dane: { naglowek: string } }).dane.naglowek).toBe('Krótko – i na temat');
    expect(n.strony[0].sekcje.slice(1)).toEqual(s.strony[0].sekcje.slice(1));
    expect(n.motyw).toEqual(s.motyw);
    expect(n.firma).toEqual(s.firma);
    expect(s.strony[0].sekcje[0].wariant).toBe('hero-podzielony');
  });

  it('bez Pro: nowy wariant Pro w zmienianej sekcji zamieniony, istniejące elementy Pro (podgląd) nietknięte', () => {
    const s = salon();
    const n = ok(odczytajWynikZmiany(s, JSON.stringify({ ...s.strony[0].sekcje[0], wariant: 'hero-mozaika' }), 'start', 'hosting'));
    expect(n.strony[0].sekcje[0].wariant).toBe('hero-podzielony');
    expect(n.strony[0].sekcje.find((x) => x.id === 'galeria')?.wariant).toBe('galeria-karuzela');
    expect(n.motyw.efekty).toContain('lightbox');
  });

  it('opinie: istniejące wpisy klienta zostają, nowe od AI są błędem', () => {
    const s = salon();
    const opinie = s.strony[0].sekcje[3] as { dane: { wpisy: { autor: string; tresc: string }[] } };
    opinie.dane.wpisy = [{ autor: 'Klientka', tresc: 'Wpisana przez klienta.' }];
    const zachowane = odczytajWynikZmiany(s, JSON.stringify({ ...s.strony[0].sekcje[3], dane: { ...opinie.dane, naglowek: 'Opinie' } }), 'opinie', 'pro');
    expect(zachowane.ok).toBe(true);
    const dopisane = odczytajWynikZmiany(
      s,
      JSON.stringify({ ...s.strony[0].sekcje[3], dane: { ...opinie.dane, wpisy: [...opinie.dane.wpisy, { autor: 'AI', tresc: 'Zmyślona' }] } }),
      'opinie',
      'pro',
    );
    expect(dopisane.ok).toBe(false);
  });

  it('zmiana całej strony: pełna Strona przechodzi przez te same zasady', () => {
    const s = salon();
    const n = ok(odczytajWynikZmiany(s, JSON.stringify({ ...s, seo: { ...s.seo, tytul: 'Fryzjer Jeżyce—Pracownia Fal' } }), null, 'pro'));
    expect(n.seo.tytul).toBe('Fryzjer Jeżyce – Pracownia Fal');
    expect(odczytajWynikZmiany(s, '{"x":1}', null, 'pro').ok).toBe(false);
  });

  it('frazes, który klient już miał na stronie, nie blokuje zmiany innej sekcji', () => {
    const s = salon();
    (s.strony[0].sekcje[1] as { dane: { naglowek: string } }).dane.naglowek = 'Kompleksowa obsługa włosów';
    expect(odczytajWynikZmiany(s, JSON.stringify(s.strony[0].sekcje[0]), 'start', 'pro').ok).toBe(true);
  });
});

describe('wiadomosciNaprawy', () => {
  it('assistant z poprzednią odpowiedzią + user z listą błędów i prośbą o pełny JSON', () => {
    const w = wiadomosciNaprawy('{"zle":1}', ['motyw.styl: nieznany styl', 'strony: brak strony głównej']);
    expect(w).toHaveLength(2);
    expect(w[0]).toEqual({ role: 'assistant', content: '{"zle":1}' });
    expect(w[1].role).toBe('user');
    expect(w[1].content).toContain('- motyw.styl: nieznany styl');
    expect(w[1].content).toContain('pełną odpowiedź');
    expect(w[1].content).toContain('wyłącznie JSON');
  });
});
