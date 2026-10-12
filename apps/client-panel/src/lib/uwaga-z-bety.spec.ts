import {
  bladUwagi,
  blokKontekstu,
  czasWarszawa,
  czyZglosUwageWlaczone,
  sciezkaBezTokenow,
  skrocUserAgent,
  tematUwagi,
  trescUwagi,
} from './uwaga-z-bety';

/** Beta „Zgłoś uwagę” — blok kontekstu dokładany do zgłoszenia nie może wynosić tokenów z adresu. */
describe('sciezkaBezTokenow', () => {
  it('ucina query string i hash (tokeny, kody z linków)', () => {
    expect(sciezkaBezTokenow('/dashboard/settings?tab=security&token=abc123')).toBe('/dashboard/settings');
    expect(sciezkaBezTokenow('/dashboard/iam#zaproszenie=xyz')).toBe('/dashboard/iam');
    expect(sciezkaBezTokenow('https://panel.example.pl/dashboard/billing?session_id=cs_live_123')).toBe('/dashboard/billing');
  });

  it('segment wyglądający na token → [ukryte]; UUID usługi zostaje', () => {
    const uuid = '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f';
    expect(sciezkaBezTokenow(`/dashboard/services/${uuid}/files`)).toBe(`/dashboard/services/${uuid}/files`);
    expect(sciezkaBezTokenow('/reset-password/Zk9Qm2xR7tYp4LwN8vB3cH6jD1sF5gA0eU')).toBe('/reset-password/[ukryte]');
    // Domena w ścieżce (z kropką) nie jest tokenem.
    expect(sciezkaBezTokenow('/dashboard/services/x/sites/bardzo-dluga-nazwa-domeny-sklepu-internetowego.pl')).toBe(
      '/dashboard/services/x/sites/bardzo-dluga-nazwa-domeny-sklepu-internetowego.pl',
    );
  });

  it('pusta ścieżka → „/”', () => {
    expect(sciezkaBezTokenow('?a=1')).toBe('/');
  });
});

describe('skrocUserAgent', () => {
  it('Chrome na Windows, Safari na iPhonie, Firefox na Linuksie, Edge', () => {
    expect(
      skrocUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'),
    ).toBe('Chrome 141 · Windows');
    expect(
      skrocUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari 18 · iOS');
    expect(skrocUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0')).toBe('Firefox 144 · Linux');
    expect(
      skrocUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0',
      ),
    ).toBe('Edge 141 · Windows');
  });

  it('nieznany UA → najwyżej 80 znaków', () => {
    expect(skrocUserAgent('x'.repeat(200))).toHaveLength(80);
    expect(skrocUserAgent('')).toBe('nieznana');
  });
});

describe('blokKontekstu / trescUwagi / tematUwagi', () => {
  const teraz = new Date('2026-10-12T12:03:00Z'); // 14:03 w Warszawie (CEST)
  const kontekst = {
    sciezka: '/dashboard/services/abc?kind=hosting&token=SEKRET',
    wersjaPanelu: 'build 2026-10-12 10:00 UTC',
    szerokoscOkna: 1440,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
    teraz,
    rodzaj: 'blad' as const,
    usluga: 'Hosting Start · sklep.pl',
  };

  it('czas w strefie Europe/Warsaw', () => {
    expect(czasWarszawa(teraz)).toBe('12.10.2026, 14:03');
  });

  it('blok: strona bez query, wersja, okno, przeglądarka, czas, rodzaj, usługa — bez tokenu', () => {
    const blok = blokKontekstu(kontekst);
    expect(blok).toContain('• Strona: /dashboard/services/abc');
    expect(blok).not.toContain('SEKRET');
    expect(blok).not.toContain('?');
    expect(blok).toContain('• Wersja panelu: build 2026-10-12 10:00 UTC');
    expect(blok).toContain('• Szerokość okna: 1440 px');
    expect(blok).toContain('• Przeglądarka: Chrome 141 · Windows');
    expect(blok).toContain('• Czas: 12.10.2026, 14:03 (Europe/Warsaw)');
    expect(blok).toContain('• Rodzaj: błąd');
    expect(blok).toContain('• Usługa: Hosting Start · sklep.pl');
  });

  it('bez rodzaju i usługi — bez tych wierszy; brak wersji → „nieznana”', () => {
    const blok = blokKontekstu({ ...kontekst, rodzaj: null, usluga: null, wersjaPanelu: '' });
    expect(blok).not.toContain('Rodzaj');
    expect(blok).not.toContain('Usługa');
    expect(blok).toContain('• Wersja panelu: nieznana');
  });

  it('treść = tekst klienta + blok kontekstu', () => {
    const tresc = trescUwagi('  Przycisk zapisu nie reaguje  ', kontekst);
    expect(tresc.startsWith('Przycisk zapisu nie reaguje\n\n---\nKontekst (dodany automatycznie):')).toBe(true);
  });

  it('temat: „Uwaga z bety: <pierwsze słowa>”, przycięty', () => {
    expect(tematUwagi('Nie działa   zapis\nustawień')).toBe('Uwaga z bety: Nie działa zapis ustawień');
    const dlugi = tematUwagi('jeden dwa trzy cztery pięć sześć siedem osiem dziewięć dziesięć');
    expect(dlugi).toBe('Uwaga z bety: jeden dwa trzy cztery pięć sześć siedem osiem…');
    expect(tematUwagi('a'.repeat(300)).length).toBeLessThanOrEqual(200);
  });
});

describe('walidacja i flaga', () => {
  it('min. 10 znaków (po przycięciu spacji)', () => {
    expect(bladUwagi('')).toBe('Opisz, co się stało albo co poprawić.');
    expect(bladUwagi('  krótko   ')).toBe('Napisz co najmniej 10 znaków (brakuje 4).');
    expect(bladUwagi('dziesięć z')).toBeNull();
  });

  it('flaga bety: tylko jawne true (brak flagi = wyłączona, odwrotnie niż moduły)', () => {
    expect(czyZglosUwageWlaczone({})).toBe(false);
    expect(czyZglosUwageWlaczone({ 'beta.zglos-uwage': false })).toBe(false);
    expect(czyZglosUwageWlaczone({ 'beta.zglos-uwage': true })).toBe(true);
  });
});
