import { KATALOG_FONTOW as KATALOG_PELNY, plikFontu, ZAKRESY_FONTOW } from '@verris/kreator';
import { koloryMarki, rodzinaPoId, type PlikMarki, type ProjektLogo, type StanKreatoraMarki, type WidokMarki } from '@verris/kreator/klient';
import {
  adresLogo,
  adresMaterialu,
  adresNapisu,
  adresPliku,
  bladPlikuLogo,
  bledyBriefu,
  blokadaNowejMarki,
  ETYKIETY_CECH,
  grupujPliki,
  krokiMarki,
  krokPoczatkowy,
  najblizszaWaga,
  nazwaBarwy,
  normalizujHex,
  opisBlokady,
  opisCeny,
  opisPozostalo,
  plikFontuPanelu,
  regulyFontu,
  ZAKRESY_FONTOW_PANELU,
  stylDozwolony,
  zmienKolory,
  zmienKoloryHex,
  zmienKroj,
  zmienLitery,
  zmienParametr,
} from './kreator-marki';

/**
 * Paczka 131 – Kreator marki w panelu: liczniki z odmianą, blokady nowej marki, grupy plików, pliki krojów zgodne
 * z rendererem, przekształcenia „Dopasuj” (bez AI), kroki ekranu marki, walidacja briefu i pliku logo.
 */

const projekt = (): ProjektLogo => ({
  sygnet: { typ: 'biblioteka', rodzina: 'kreg-fala', parametry: { n: 3 }, ziarno: 0 },
  napis: { font: 'Fraunces', waga: 600, styl: 'jeden', rozstrzelenie: 0, podpis: true },
  kolory: koloryMarki(240, 'jasna'),
  uklad: 'poziomy',
  fonty: { naglowki: 'Fraunces', tekst: 'Inter' },
});

const stan = (o: Partial<StanKreatoraMarki['limity']> = {}, reszta: Partial<StanKreatoraMarki> = {}): StanKreatoraMarki => ({
  dostepny: true,
  wersja: 'hosting',
  limity: { marki: { uzyte: 0, limit: 1 }, serie: { uzyte: 0, limit: 3 }, zmianyAi: { uzyte: 0, limit: 50 }, ...o },
  pakiet: { kupiony: false, cena: { brutto: 149, netto: 121.14 }, aktualizacjeDo: null },
  drugaMarka: { cena: { brutto: 49, netto: 39.84 }, dostepna: true },
  symboleAi: true,
  maksWgraniaMb: 10,
  marki: [],
  ...reszta,
});

describe('liczniki i ceny', () => {
  it('„Zostało/Została/Zostały N z M …” z dopełniaczem po „z”', () => {
    expect(opisPozostalo({ uzyte: 1, limit: 3 }, 'serie')).toBe('Zostały 2 z 3 serii');
    expect(opisPozostalo({ uzyte: 2, limit: 3 }, 'serie')).toBe('Została 1 z 3 serii');
    expect(opisPozostalo({ uzyte: 5, limit: 3 }, 'serie')).toBe('Zostało 0 z 3 serii');
    expect(opisPozostalo({ uzyte: 0, limit: 50 }, 'zmiany')).toBe('Zostało 50 z 50 zmian AI');
    expect(opisPozostalo({ uzyte: 0, limit: 1 }, 'marki')).toBe('Została 1 z 1 marki');
    expect(opisPozostalo({ uzyte: 0, limit: 5 }, 'marki')).toBe('Zostało 5 z 5 marek');
  });

  it('cena zawsze brutto i netto', () => {
    expect(opisCeny({ brutto: 149, netto: 121.14 })).toBe('149 zł brutto (121,14 zł netto)');
  });
});

describe('blokada nowej marki (te same reguły co API)', () => {
  it('limit marek → powód i zakup kolejnej marki, gdy dostępny', () => {
    const b = blokadaNowejMarki(stan({ marki: { uzyte: 1, limit: 1 } }));
    expect(b).toEqual({ powod: expect.stringContaining('Masz już 1 markę – limit konta to 1 marka. Kup kolejną markę'), kupDruga: true });
    expect(blokadaNowejMarki(stan({ marki: { uzyte: 1, limit: 1 } }, { drugaMarka: { cena: { brutto: 49, netto: 39.84 }, dostepna: false } }))?.kupDruga).toBe(false);
  });
  it('limit serii → powód (Pakiet dodaje serie), bez zakupu marki', () => {
    expect(blokadaNowejMarki(stan({ serie: { uzyte: 3, limit: 3 } }))).toEqual({ powod: expect.stringContaining('Wykorzystano limit propozycji (3 serie). Pakiet marki dodaje kolejne serie.'), kupDruga: false });
    expect(blokadaNowejMarki(stan({ serie: { uzyte: 3, limit: 3 } }, { wersja: 'pakiet' }))?.powod).not.toContain('Pakiet marki dodaje');
  });
  it('w limicie – brak blokady; moduł niedostępny – blokada', () => {
    expect(blokadaNowejMarki(stan())).toBeNull();
    expect(blokadaNowejMarki(stan({}, { dostepny: false }))?.powod).toContain('nie jest dostępny');
  });
});

describe('pliki marki', () => {
  const pliki: PlikMarki[] = [
    { plik: 'wizytowka.pdf', grupa: 'druk', opis: 'Wizytówka', dostepny: false, blokada: 'TMVIEW_WYMAGANY' },
    { plik: 'logo-poziome-kolor.svg', grupa: 'logo', opis: 'Logo', dostepny: true },
    { plik: 'post.png', grupa: 'kv', opis: 'Post', dostepny: false, blokada: 'PAKIET_WYMAGANY', material: 'post' },
    { plik: 'favicon.ico', grupa: 'ikony', opis: 'Favicon', dostepny: true },
  ];
  it('grupy w stałej kolejności, puste pominięte', () => {
    expect(grupujPliki(pliki).map((g) => [g.grupa, g.pliki.length])).toEqual([
      ['logo', 1],
      ['ikony', 1],
      ['kv', 1],
      ['druk', 1],
    ]);
  });
  it('opis blokad: Pakiet, TMview, okres próbny', () => {
    expect(opisBlokady('PAKIET_WYMAGANY').etykieta).toBe('w Pakiecie marki');
    expect(opisBlokady('TMVIEW_WYMAGANY').opis).toContain('TMview');
    expect(opisBlokady('PROBA').etykieta).toBe('po opłaceniu hostingu');
  });
  it('adresy idą przez trasy panelu (token sesji tylko po stronie serwera), z kodowaniem', () => {
    expect(adresPliku('m1', 'logo.svg')).toBe('/api/kreator-marki/marki/m1/pliki/logo.svg');
    expect(adresLogo('m1', 'pionowy', 'mono', 3)).toBe('/api/kreator-marki/marki/m1/logo.svg?uklad=pionowy&wariant=mono&v=3');
    expect(adresMaterialu('m1', 'post', 'svg', '4-ab')).toBe('/api/kreator-marki/marki/m1/material/post.svg?v=4-ab');
    expect(adresNapisu({ font: 'DM Sans', waga: 600, tekst: 'Łódka & Wiosło', rozstrzelenie: 140.4 })).toBe(
      '/api/kreator-marki/napis?font=DM%20Sans&waga=600&tekst=%C5%81%C3%B3dka%20%26%20Wios%C5%82o&rozstrzelenie=140',
    );
  });
});

describe('fonty z fonts-proxy (te same pliki co renderer stron)', () => {
  it('nazwa pliku = plikFontu z libs/kreator/src/render/fonty.ts dla każdego kroju i wagi katalogu', () => {
    for (const f of KATALOG_PELNY) for (const w of f.wagi) expect(plikFontuPanelu(f.rodzina, w, 'latin-ext')).toBe(plikFontu(f.rodzina, w, false, 'latin-ext'));
    expect(ZAKRESY_FONTOW_PANELU).toEqual(ZAKRESY_FONTOW);
  });
  it('reguły @font-face: obie podzbiory, trasa panelu, najbliższa dostępna waga; krój spoza katalogu – nic', () => {
    const r = regulyFontu('Instrument Serif', 700);
    expect(r).toContain("font-family:'Instrument Serif'");
    expect(r).toContain('url("/api/kreator-marki/fonty/instrument-serif-400-latin.woff2")');
    expect(r).toContain('instrument-serif-400-latin-ext.woff2');
    expect(regulyFontu('Comic Sans', 400)).toBe('');
    expect(najblizszaWaga('Instrument Serif', 700)).toBe(400);
    expect(najblizszaWaga('Fraunces', 650)).toBe(600);
  });
});

describe('„Dopasuj” – przekształcenia projektu bez AI', () => {
  it('kolory z barwy i charakteru mają wymagany kontrast; własne HEX – z informacją o korekcie', () => {
    const p = zmienKolory(projekt(), 30, 'kontrastowa');
    expect(p.kolory.charakter).toBe('kontrastowa');
    expect(p.kolory.barwa).toBe(30);
    const jasny = zmienKoloryHex(projekt(), '#F28C28', '#F28C28');
    expect(jasny.skorygowane).toEqual({ glowny: true, akcent: true });
    expect(jasny.projekt.kolory.glowny).not.toBe('#F28C28');
    expect(zmienKoloryHex(projekt(), '#0F3B57', '#1F6F8B').skorygowane).toEqual({ glowny: false, akcent: false });
  });
  it('krój: waga przechodzi na najbliższą dostępną', () => {
    const p = zmienKroj(projekt(), 'Instrument Serif');
    expect(p.napis).toMatchObject({ font: 'Instrument Serif', waga: 400 });
  });
  it('parametr rodziny przycięty do zakresu katalogu; nieznany klucz i znak spoza biblioteki – bez zmian', () => {
    const def = rodzinaPoId('kreg-fala')!.parametry.find((x) => x.klucz === 'n')!;
    const p = zmienParametr(projekt(), 'n', 99);
    expect(p.sygnet.typ === 'biblioteka' && p.sygnet.parametry.n).toBe(def.max);
    expect(zmienParametr(projekt(), 'xyz', 3)).toEqual(projekt());
    const ai: ProjektLogo = { ...projekt(), sygnet: { typ: 'ai', svg: '<svg/>' } };
    expect(zmienParametr(ai, 'n', 2)).toBe(ai);
  });
  it('litery monogramu: wersaliki, obsługiwane znaki, puste = pole usunięte', () => {
    const p = zmienLitery(projekt(), 'żb3');
    expect(p.sygnet.typ === 'biblioteka' && p.sygnet.litery).toBe('ŻB');
    const pusty = zmienLitery(p, '');
    expect(pusty.sygnet.typ === 'biblioteka' && 'litery' in pusty.sygnet).toBe(false);
  });
  it('„dwa wiersze” tylko dla nazw z co najmniej 2 słów', () => {
    expect(stylDozwolony('dwa', 'Pracownia Fal')).toBe(true);
    expect(stylDozwolony('dwa', 'Hydromix')).toBe(false);
    expect(stylDozwolony('wersaliki', 'Hydromix')).toBe(true);
  });
  it('HEX: z krzyżykiem albo bez, 6 znaków', () => {
    expect(normalizujHex('0f3b57')).toBe('#0F3B57');
    expect(normalizujHex('#12345')).toBeNull();
  });
  it('nazwy barw po polsku', () => {
    expect(nazwaBarwy(262)).toBe('niebieski');
    expect(nazwaBarwy(190)).toBe('morski');
    expect(nazwaBarwy(-2)).toBe('czerwień');
    expect(nazwaBarwy(350)).toBe('róż');
  });
});

describe('kroki ekranu marki', () => {
  const w = (o: Partial<WidokMarki>): Pick<WidokMarki, 'zrodlo' | 'serie' | 'marka' | 'analiza'> => ({ zrodlo: 'nowa', serie: [], marka: null, ...o });
  const seria = { id: 's1', rodzaj: 'nowa' as const, utworzono: '2026-11-19', kierunki: [] };
  it('nowa marka: brief → propozycje → dopasuj…; dostępność wg etapu', () => {
    const k = krokiMarki(w({ serie: [seria] }));
    expect(k.map((x) => [x.id, x.dostepny])).toEqual([
      ['brief', true],
      ['propozycje', true],
      ['dopasuj', false],
      ['zasady', false],
      ['materialy', false],
      ['eksport', false],
    ]);
    expect(krokPoczatkowy(w({ serie: [seria] }))).toBe('propozycje');
    expect(krokPoczatkowy(w({}))).toBe('brief');
    // krok z adresu niedostępny → najdalszy sensowny
    expect(krokPoczatkowy(w({ serie: [seria] }), 'eksport')).toBe('propozycje');
  });
  it('Key Visual pod wgrane logo: analiza → zasady/materiały/eksport (bez propozycji i Dopasuj)', () => {
    const k = krokiMarki(w({ zrodlo: 'wgrane', analiza: { kolory: [], problemy: [], elementy: [], oryginal: '' } }));
    expect(k.map((x) => x.id)).toEqual(['analiza', 'zasady', 'materialy', 'eksport']);
    expect(krokPoczatkowy(w({ zrodlo: 'wgrane', marka: {} as WidokMarki['marka'] }))).toBe('materialy');
  });
  it('odświeżenie: kroki „Kierunki”', () => {
    expect(krokiMarki(w({ zrodlo: 'odswiezenie' })).find((x) => x.id === 'propozycje')?.nazwa).toBe('Kierunki');
  });
});

describe('brief i plik logo', () => {
  const brief = { nazwa: 'Pracownia Fal', branza: 'Szkoła żeglarstwa', opis: 'Kursy żeglarstwa nad jeziorem.', rodzaj: 'znak-i-napis', cechy: [], barwyLubiane: [], barwyOdrzucone: [] };
  it('błędy pól po polsku (schemat zod BriefMarki)', () => {
    expect(bledyBriefu(brief)).toEqual({});
    expect(bledyBriefu({ ...brief, nazwa: '', opis: 'x'.repeat(241) })).toEqual({ nazwa: expect.stringContaining('nazwę'), opis: expect.stringContaining('240') });
    expect(bledyBriefu({ ...brief, cechy: ['spokojna', 'elegancka', 'lokalna', 'ciepla'] })).toEqual({ cechy: 'Wybierz najwyżej 3 cechy.' });
  });
  it('etykiety cech mają polskie znaki', () => {
    expect(ETYKIETY_CECH.rzemieslnicza).toBe('Rzemieślnicza');
    expect(ETYKIETY_CECH.odwazna).toBe('Odważna');
  });
  it('plik logo: typy SVG/PDF/PNG/JPG i limit MB ze stanu konta', () => {
    expect(bladPlikuLogo({ name: 'logo.svg', size: 1000, type: 'image/svg+xml' }, 10)).toBeNull();
    expect(bladPlikuLogo({ name: 'logo.JPG', size: 1000, type: '' }, 10)).toBeNull();
    expect(bladPlikuLogo({ name: 'logo.gif', size: 1000, type: 'image/gif' }, 10)).toContain('SVG, PDF, PNG albo JPG');
    expect(bladPlikuLogo({ name: 'logo.png', size: 11 * 1048576, type: 'image/png' }, 10)).toBe('Plik jest za duży (11,0 MB, limit 10 MB).');
    expect(bladPlikuLogo({ name: 'logo.png', size: 0, type: 'image/png' }, 10)).toBe('Plik jest pusty.');
  });
});
