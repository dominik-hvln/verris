import {
  brakiDoEtapu,
  brakiRaportu,
  checklistaZBazy,
  kluczAlertu,
  kolejnosc,
  przejscie,
  terminMigracji,
  type StanMigracji,
} from './tablica-migracji.js';

const T0 = new Date('2026-10-11T10:00:00Z');
const godz = (h: number) => new Date(T0.getTime() + h * 3600_000);
const wpis = (tekst?: string) => ({ ...(tekst ? { tekst } : {}), at: T0.toISOString(), przez: 'op' });

const m = (o: Partial<StanMigracji> = {}): StanMigracji => ({
  etap: 'NOWA',
  status: 'COMPLETED',
  createdAt: T0,
  cutoverAt: null,
  termin: null,
  wygasaUStaregoAt: null,
  domenaWygasaAt: null,
  poprawkiDo: null,
  raportWyslanyAt: null,
  checklista: {},
  ...o,
});

describe('D11 — przejścia etapów tablicy migracji', () => {
  it('Nowa → Testy u nas tylko, gdy automat przeniósł dane (status COMPLETED)', () => {
    expect(przejscie(m({ status: 'RUNNING' }), 'TESTY')).toEqual({ ok: false, bledy: ['Automat nie skończył przenoszenia danych (stan: w toku)'] });
    expect(przejscie(m({ status: 'ATTENTION' }), 'TESTY').ok).toBe(false);
    expect(przejscie(m(), 'TESTY')).toEqual({ ok: true, kierunek: 'naprzod' });
  });

  it('do „Do zmiany DNS” blokuje checklista: TTL 300 i wynik testu na tymczasowym adresie', () => {
    const testy = m({ etap: 'TESTY' });
    expect(przejscie(testy, 'DO_ZMIANY_DNS')).toEqual({
      ok: false,
      bledy: ['TTL domen zmienione na 300', 'Wynik testu strony na tymczasowym adresie'],
    });
    expect(przejscie(m({ etap: 'TESTY', checklista: { ttl300: wpis() } }), 'DO_ZMIANY_DNS')).toEqual({
      ok: false,
      bledy: ['Wynik testu strony na tymczasowym adresie'],
    });
    const gotowa = m({ etap: 'TESTY', checklista: { ttl300: wpis(), testTymczasowy: wpis('PageSpeed 91, TTFB 180 ms') } });
    expect(przejscie(gotowa, 'DO_ZMIANY_DNS')).toEqual({ ok: true, kierunek: 'naprzod' });
    // Delta-sync po testach (automat znów w toku) — nie przełączamy DNS na niepełne dane.
    expect(przejscie({ ...gotowa, status: 'RUNNING' }, 'DO_ZMIANY_DNS').ok).toBe(false);
  });

  it('„Po przełączeniu” wymaga potwierdzonego przełączenia DNS (cutoverAt)', () => {
    expect(przejscie(m({ etap: 'DO_ZMIANY_DNS' }), 'PO_PRZELACZENIU')).toEqual({
      ok: false,
      bledy: ['DNS nie wskazuje jeszcze na nas — użyj „Sprawdź DNS”'],
    });
    expect(przejscie(m({ etap: 'DO_ZMIANY_DNS', cutoverAt: T0 }), 'PO_PRZELACZENIU').ok).toBe(true);
  });

  it('zamknięcie wymaga wysłanego raportu z kompletem: podsumowanie, optymalizacja, test przed i po', () => {
    const po = m({ etap: 'PO_PRZELACZENIU', cutoverAt: T0 });
    expect(przejscie(po, 'ZAMKNIETA')).toEqual({ ok: false, bledy: ['Raport pomigracyjny nie został wysłany klientowi'] });
    const komplet = {
      podsumowanie: wpis('Przenieśliśmy stronę i 3 skrzynki.'),
      optymalizacja: wpis('Włączone cache strony i kompresja obrazów.'),
      testPrzed: wpis('LCP 4,1 s'),
      testPo: wpis('LCP 1,2 s'),
    };
    expect(brakiRaportu({ ...po, checklista: { podsumowanie: komplet.podsumowanie } })).toEqual([
      'Optymalizacja przeprowadzona',
      'Test wydajności przed (stary hosting)',
      'Test wydajności po (Verris)',
    ]);
    expect(brakiRaportu({ ...po, checklista: komplet })).toEqual([]);
    expect(brakiRaportu({ ...po, etap: 'DO_ZMIANY_DNS', checklista: komplet })).toEqual(['Raport wysyłamy na etapie „Po przełączeniu”']);
    expect(przejscie({ ...po, checklista: komplet, raportWyslanyAt: T0 }, 'ZAMKNIETA')).toEqual({ ok: true, kierunek: 'naprzod' });
  });

  it('etapów nie przeskakujemy; to samo miejsce — błąd; anulowanej nie prowadzimy dalej', () => {
    expect(przejscie(m(), 'DO_ZMIANY_DNS')).toEqual({ ok: false, bledy: ['Najpierw „Testy u nas” — etapów nie przeskakujemy'] });
    expect(przejscie(m(), 'NOWA').ok).toBe(false);
    expect(przejscie(m({ status: 'CANCELED' }), 'TESTY')).toEqual({ ok: false, bledy: ['Migracja jest anulowana'] });
  });

  it('cofnięcie o dowolną liczbę etapów — tylko z powodem (min. 10 znaków), bez checklisty', () => {
    const zamknieta = m({ etap: 'ZAMKNIETA' });
    expect(przejscie(zamknieta, 'TESTY')).toEqual({ ok: false, bledy: ['Podaj powód cofnięcia (min. 10 znaków)'] });
    expect(przejscie(zamknieta, 'TESTY', 'krótko')).toMatchObject({ ok: false });
    expect(przejscie(zamknieta, 'TESTY', 'Klient zgłosił błąd formularza po przełączeniu')).toEqual({ ok: true, kierunek: 'wstecz' });
  });

  it('brakiDoEtapu dla Nowej — brak warunków', () => {
    expect(brakiDoEtapu(m({ status: 'QUEUED' }), 'NOWA')).toEqual([]);
  });

  it('checklista z bazy: nieznane klucze i niepełne wpisy odpadają', () => {
    expect(checklistaZBazy({ ttl300: { at: 'a', przez: 'b' }, obce: { at: 'a', przez: 'b' }, testPo: { tekst: 'x' } })).toEqual({ ttl300: { at: 'a', przez: 'b' } });
    expect(checklistaZBazy(null)).toEqual({});
    expect(checklistaZBazy([1])).toEqual({});
  });
});

describe('D11 — twarde terminy i alert', () => {
  it('termin domyślny = utworzenie + 3 dni; alert dobę przed', () => {
    expect(terminMigracji(m(), T0)).toEqual({ rodzaj: 'sla', data: godz(72), stan: 'ok' });
    expect(terminMigracji(m(), godz(48))).toMatchObject({ rodzaj: 'sla', stan: 'blisko' });
    expect(terminMigracji(m(), godz(72))).toMatchObject({ rodzaj: 'sla', stan: 'po-terminie' });
  });

  it('wygaśnięcie hostingu u starego dostawcy ostrzega 3 doby wcześniej i wygrywa z dalszym SLA', () => {
    const stary = m({ termin: godz(24 * 10), wygasaUStaregoAt: godz(24 * 4) });
    expect(terminMigracji(stary, T0)).toMatchObject({ rodzaj: 'stary-hosting', stan: 'ok' });
    expect(terminMigracji(stary, godz(24 * 1 + 1))).toMatchObject({ rodzaj: 'stary-hosting', stan: 'blisko' });
    // Domena wygasa wcześniej niż hosting — liczy się domena.
    expect(terminMigracji({ ...stary, domenaWygasaAt: godz(24 * 2) }, T0)).toMatchObject({ rodzaj: 'domena', stan: 'blisko' });
  });

  it('po przełączeniu liczy się koniec okna poprawek; zamknięta i anulowana — bez terminu', () => {
    const po = m({ etap: 'PO_PRZELACZENIU', poprawkiDo: godz(24 * 7), wygasaUStaregoAt: godz(1) });
    expect(terminMigracji(po, T0)).toEqual({ rodzaj: 'okno-poprawek', data: godz(24 * 7), stan: 'ok' });
    expect(terminMigracji(m({ etap: 'ZAMKNIETA' }), T0)).toBeNull();
    expect(terminMigracji(m({ status: 'CANCELED' }), T0)).toBeNull();
  });

  it('audyt Fal 2 — nieudana (FAILED, stan końcowy automatu) nie ma terminu ani alertu', () => {
    expect(terminMigracji(m({ status: 'FAILED' }), godz(24 * 30))).toBeNull();
    expect(terminMigracji(m({ status: 'FAILED', wygasaUStaregoAt: godz(1) }), godz(2))).toBeNull();
  });

  it('klucz alertu rozróżnia „blisko” i „po terminie” oraz nowy termin', () => {
    const a = terminMigracji(m(), godz(48))!;
    const b = terminMigracji(m(), godz(80))!;
    expect(kluczAlertu(a)).not.toBe(kluczAlertu(b));
    expect(kluczAlertu(terminMigracji(m({ termin: godz(50) }), godz(48))!)).not.toBe(kluczAlertu(a));
  });

  it('kolejność na tablicy: Przerywacz na górze, potem najpilniejszy termin', () => {
    const t = (h: number) => terminMigracji(m({ termin: godz(h) }), T0);
    const karty = [
      { id: 'a', przerywacz: false, termin: t(10) },
      { id: 'b', przerywacz: true, termin: t(100) },
      { id: 'c', przerywacz: false, termin: t(5) },
      { id: 'd', przerywacz: false, termin: null },
    ];
    expect(karty.sort(kolejnosc).map((k) => k.id)).toEqual(['b', 'c', 'a', 'd']);
  });
});
