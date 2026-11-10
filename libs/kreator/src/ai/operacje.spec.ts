import { walidujStrone, type Sekcja, type Strona } from '../model.ts';
import { PRZYKLAD_SALON } from '../przyklady/salon.ts';
import { PRZYKLAD_SALON_EN } from '../przyklady/salon-en.ts';
import { PRZYKLAD_STUDIO } from '../przyklady/studio.ts';
import { blokMasterPromptu, budujZapytanieZmiany } from './master-prompt.ts';
import { odczytajWynikZmiany } from './odczyt.ts';
import { OPERACJE_STRONY, zastosujOperacje } from './operacje.ts';

/** Paczka 127 – zmiana całej strony jako lista operacji zamiast pełnej Strony. */
function model(w: unknown): Strona {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
}
const salon = () => model(PRZYKLAD_SALON);
const ids = (s: Strona, slug = '') => s.strony.find((p) => p.slug === slug)!.sekcje.map((x) => x.id);
const sekcja = (s: Strona, id: string, slug = '') => s.strony.find((p) => p.slug === slug)!.sekcje.find((x) => x.id === id)!;

function ok(w: ReturnType<typeof odczytajWynikZmiany>): Strona {
  if (!w.ok) throw new Error(w.bledy.join('\n'));
  return w.strona;
}

const FAQ_NOWE = { id: 'dojazd', typ: 'faq', wariant: 'faq-akordeon', dane: { naglowek: 'Jak do nas trafić', pytania: [{ pytanie: 'Gdzie zaparkować?', odpowiedz: 'Na ulicach obok salonu są miejsca w strefie płatnego parkowania.' }] } };

describe('operacje zmiany strony', () => {
  it('przykład: zmien + dodaj + przesun + usun + motyw (częściowa paleta) + seo + stopka – wynik poprawny', () => {
    const s = salon();
    const odp = {
      operacje: [
        { op: 'zmien', id: 'start', sekcja: { typ: 'hero', wariant: 'hero-podzielony', dane: { naglowek: 'Cięcie po rozmowie, cena przed strzyżeniem.', przyciski: [{ etykieta: 'Umów wizytę', cel: '#kontakt' }] } } },
        { op: 'dodaj', po: 'pytania', sekcja: FAQ_NOWE },
        { op: 'przesun', id: 'galeria', po: 'start' },
        { op: 'usun', id: 'opinie' },
        { op: 'motyw', motyw: { paleta: { akcent: '#16382B' }, animacje: 'subtelne' } },
        { op: 'seo', seo: { opis: 'Strzyżenie i koloryzacja na Jeżycach – cenę ustalamy przed strzyżeniem. Umów wizytę telefonicznie albo przez formularz na stronie salonu.' } },
        { op: 'stopka', stopka: { tekst: 'Pracownia Fal – Jeżyce, Poznań' } },
      ],
    };
    const w = ok(odczytajWynikZmiany(s, JSON.stringify(odp), null, 'pro'));
    expect(ids(w)).toEqual(['start', 'galeria', 'uslugi', 'pytania', 'dojazd', 'kontakt']);
    expect((sekcja(w, 'start') as Extract<Sekcja, { typ: 'hero' }>).dane.naglowek).toBe('Cięcie po rozmowie, cena przed strzyżeniem.');
    expect(w.motyw.paleta.tlo).toBe(s.motyw.paleta.tlo);
    expect(w.motyw.fonty).toEqual(s.motyw.fonty);
    expect(w.motyw.animacje).toBe('subtelne');
    expect(w.seo.tytul).toBe(s.seo.tytul);
    expect(w.stopka.tekst).toBe('Pracownia Fal – Jeżyce, Poznań');
    expect(w.stopka.politykaPrywatnosci).toBe(s.stopka.politykaPrywatnosci);
  });

  it('nic poza wskazanymi: sekcje bez operacji, firma, SEO i stopka bajt w bajt jak przed zmianą', () => {
    const s = salon();
    const w = ok(odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'zmien', id: 'uslugi', sekcja: { ...sekcja(s, 'uslugi'), wMenu: 'Cennik' } }] }), null, 'hosting'));
    for (const id of ids(s).filter((x) => x !== 'uslugi')) expect(sekcja(w, id)).toEqual(sekcja(s, id));
    expect(sekcja(w, 'uslugi').wMenu).toBe('Cennik');
    expect(w.firma).toEqual(s.firma);
    expect(w.seo).toEqual(s.seo);
    expect(w.stopka).toEqual(s.stopka);
    expect(w.motyw.efekty).toEqual(s.motyw.efekty);
  });

  it('operacja na nieistniejącym id albo podstronie – błąd ze ścieżką do naprawy, strona bez zmian', () => {
    const s = salon();
    const w = odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'zmien', id: 'nie-ma', sekcja: FAQ_NOWE }, { op: 'usun', id: 'x' }, { op: 'dodaj', po: 'brak', sekcja: FAQ_NOWE }, { op: 'usun', id: 'start', podstrona: 'nie-ma' }, { op: 'skasuj' }] }), null, 'pro');
    expect(w.ok).toBe(false);
    if (w.ok) return;
    expect(w.bledy).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^operacje\.0\.id: brak sekcji o id „nie-ma”/),
        expect.stringMatching(/^operacje\.1\.id: brak sekcji o id „x”/),
        expect.stringMatching(/^operacje\.2\.po: brak sekcji o id „brak”/),
        expect.stringMatching(/^operacje\.3\.podstrona: brak podstrony „nie-ma”/),
        expect.stringMatching(/^operacje\.4\.op: nieznana operacja/),
      ]),
    );
  });

  it('dodaj z zajętym id, niepoprawna sekcja i pusta lista – błędy', () => {
    const s = salon();
    const r = zastosujOperacje(s, { operacje: [{ op: 'dodaj', sekcja: { ...FAQ_NOWE, id: 'pytania' } }, { op: 'zmien', id: 'start', sekcja: { typ: 'hero', wariant: 'x', dane: {} } }] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.bledy.some((b) => b.startsWith('operacje.0.sekcja.id: id „pytania” jest już zajęte'))).toBe(true);
      expect(r.bledy.some((b) => b.startsWith('operacje.1.sekcja.dane.naglowek'))).toBe(true);
    }
    expect(zastosujOperacje(s, { operacje: [] }).ok).toBe(false);
  });

  it('podstrony: dodanie, zmiana tytułu i SEO, usunięcie; strony głównej i podstrony z wersją językową nie można usunąć', () => {
    const s = salon();
    const nowa = { slug: 'cennik', tytul: 'Cennik', seo: { tytul: 'Cennik – Pracownia Fal' }, sekcje: [{ id: 'ceny', typ: 'oferta', wariant: 'oferta-lista-cen', dane: { naglowek: 'Cennik usług', pozycje: [{ tytul: 'Strzyżenie męskie', cena: 'od 70 zł' }] } }] };
    const w = ok(odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'dodaj-podstrone', strona: nowa }, { op: 'podstrona', podstrona: 'cennik', tytul: 'Ceny' }] }), null, 'pro'));
    expect(w.strony.find((p) => p.slug === 'cennik')!.tytul).toBe('Ceny');
    const bez = ok(odczytajWynikZmiany(w, JSON.stringify({ operacje: [{ op: 'usun-podstrone', podstrona: 'cennik' }] }), null, 'pro'));
    expect(bez.strony.map((p) => p.slug)).toEqual(s.strony.map((p) => p.slug));
    expect(zastosujOperacje(s, [{ op: 'usun-podstrone', podstrona: '' }]).ok).toBe(false);
    const en = model(PRZYKLAD_SALON_EN);
    const zTlumaczeniem = en.strony.find((p) => p.slug.startsWith('en/'));
    if (zTlumaczeniem) {
      const klucz = zTlumaczeniem.klucz ?? zTlumaczeniem.slug.slice(3);
      const r = zastosujOperacje(en, [{ op: 'usun-podstrone', podstrona: klucz }]);
      expect(r.ok).toBe(false);
    }
  });

  it('podstrona domyślna operacji z zapytania (slug), bez wskazania – strona główna', () => {
    const s = model(PRZYKLAD_STUDIO);
    const wpis = s.strony.find((p) => p.slug.startsWith('blog/'))!;
    const id = wpis.sekcje[0].id;
    const w = ok(odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'przesun', id, po: null }] }), null, 'pro', wpis.slug));
    expect(w.strony.find((p) => p.slug === wpis.slug)!.sekcje[0].id).toBe(id);
    // bez slug – strona główna, gdzie takiego id może nie być
    expect(zastosujOperacje(s, [{ op: 'usun', id: 'nie-ma-na-glownej' }]).ok).toBe(false);
  });

  it('zasady treści i wersji działają po operacjach: nowe opinie od AI odrzucone, bez Pro wariant Pro zamieniony', () => {
    const s = salon();
    const opinie = { op: 'zmien', id: 'opinie', sekcja: { typ: 'opinie', wariant: 'opinie-cytat', dane: { naglowek: 'Opinie', wpisy: [{ autor: 'Anna', tresc: 'Super' }] } } };
    expect(odczytajWynikZmiany(s, JSON.stringify({ operacje: [opinie] }), null, 'pro').ok).toBe(false);
    const w = ok(odczytajWynikZmiany(s, JSON.stringify({ operacje: [{ op: 'zmien', id: 'start', sekcja: { ...sekcja(s, 'start'), wariant: 'hero-mozaika' } }] }), null, 'hosting'));
    expect(sekcja(w, 'start').wariant).not.toBe('hero-mozaika');
  });

  it('pełna Strona (dawny format) nadal przechodzi', () => {
    const s = salon();
    expect(ok(odczytajWynikZmiany(s, JSON.stringify(s), null, 'pro'))).toEqual(s);
  });

  it('master prompt opisuje wszystkie operacje, a zapytanie zmiany strony prosi o {"operacje":[…]}', () => {
    const b = blokMasterPromptu();
    for (const op of OPERACJE_STRONY) expect(b).toContain(`{"op":"${op}"`);
    const z = budujZapytanieZmiany(salon(), 'Dodaj FAQ', null, 'pro');
    expect(z.wiadomosci[0].content).toContain('{"operacje":[…]}');
    expect(z.wiadomosci[0].content).not.toContain('pełnym obiektem JSON Strona');
  });
});
