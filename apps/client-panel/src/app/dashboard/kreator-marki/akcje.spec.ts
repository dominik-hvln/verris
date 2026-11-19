/**
 * Paczka 131 – akcje serwera Kreatora marki wg kontraktu (libs/kreator/src/marka/api-kontrakt.ts): metody, ścieżki
 * i ciała, wynik zamiast wyjątku z kodem HTTP i `kod` (403 MODUL_NIEDOSTEPNY, 409 PODOBNY_ZNAK, 400 z `bledy`),
 * ochrona identyfikatora i obowiązkowa zgoda na treść cyfrową przy zakupie.
 */
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const prawdziwy = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
  return { ApiError: prawdziwy.ApiError, apiFetch: (...a: unknown[]) => mockApi(...a) };
});
jest.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));

import { ApiError } from '@/lib/api';
import {
  drobnaZmiana,
  kierunkiOdswiezenia,
  kupMarke,
  kvPodWgraneLogo,
  listaPlikow,
  nowaSeria,
  pobierzMarke,
  stanKreatoraMarki,
  stopkaEmail,
  usunMarke,
  utworzMarke,
  wybierzKierunek,
  zapiszKontakt,
  zapiszKv,
  zapiszProjekt,
  zapiszZgody,
  zmienBrief,
} from './akcje';

const ID = 'clx7marka01';
const BRIEF = { nazwa: 'Pracownia Fal', branza: 'żeglarstwo', opis: 'Kursy.', rodzaj: 'znak-i-napis' as const, cechy: [], barwyLubiane: [], barwyOdrzucone: [] };

beforeEach(() => mockApi.mockReset());

it('ścieżki i metody zgodne z kontraktem HTTP', async () => {
  mockApi.mockResolvedValue({ id: ID });
  await stanKreatoraMarki();
  await utworzMarke(BRIEF);
  await pobierzMarke(ID);
  await zmienBrief(ID, BRIEF);
  await nowaSeria(ID);
  await kierunkiOdswiezenia(ID);
  await wybierzKierunek(ID, { seriaId: 's1', kierunekId: 'k2' });
  await zapiszProjekt(ID, { x: 1 } as never);
  await zapiszKv(ID, { wzor: 'gesty', tloCiemne: true });
  await zapiszKontakt(ID, { imie: 'Anna' });
  await kvPodWgraneLogo(ID, '  spokojnie  ');
  await zapiszZgody(ID, { sprawdzilemTmview: true });
  await listaPlikow(ID);
  await stopkaEmail(ID);
  await usunMarke(ID);
  const wywolania = mockApi.mock.calls.map(([sciezka, o]) => [sciezka, (o as RequestInit | undefined)?.method ?? 'GET', (o as RequestInit | undefined)?.body ?? null]);
  expect(wywolania).toEqual([
    ['/kreator-marki/stan', 'GET', null],
    ['/kreator-marki/marki', 'POST', JSON.stringify({ zrodlo: 'nowa', brief: BRIEF })],
    [`/kreator-marki/marki/${ID}`, 'GET', null],
    [`/kreator-marki/marki/${ID}/brief`, 'PATCH', JSON.stringify(BRIEF)],
    [`/kreator-marki/marki/${ID}/serie`, 'POST', null],
    [`/kreator-marki/marki/${ID}/odswiezenie`, 'POST', null],
    [`/kreator-marki/marki/${ID}/wybierz`, 'POST', JSON.stringify({ seriaId: 's1', kierunekId: 'k2' })],
    [`/kreator-marki/marki/${ID}/projekt`, 'PUT', JSON.stringify({ projekt: { x: 1 } })],
    [`/kreator-marki/marki/${ID}/kv`, 'PUT', JSON.stringify({ wzor: 'gesty', tloCiemne: true })],
    [`/kreator-marki/marki/${ID}/kontakt`, 'PUT', JSON.stringify({ imie: 'Anna' })],
    [`/kreator-marki/marki/${ID}/kv-ai`, 'POST', JSON.stringify({ polecenie: 'spokojnie' })],
    [`/kreator-marki/marki/${ID}/zgody`, 'POST', JSON.stringify({ sprawdzilemTmview: true })],
    [`/kreator-marki/marki/${ID}/pliki`, 'GET', null],
    [`/kreator-marki/marki/${ID}/stopka-email`, 'POST', null],
    [`/kreator-marki/marki/${ID}`, 'DELETE', null],
  ]);
});

it('operacje AI mają dłuższy budżet czasu niż domyślne 20 s', async () => {
  mockApi.mockResolvedValue({});
  await nowaSeria(ID);
  await drobnaZmiana(ID, { rodzaj: 'haslo', polecenie: '  krótko  ' });
  expect(mockApi.mock.calls[0][1]).toMatchObject({ timeoutMs: 200_000 });
  expect(mockApi.mock.calls[1]).toEqual([`/kreator-marki/marki/${ID}/ai`, { method: 'POST', body: JSON.stringify({ rodzaj: 'haslo', polecenie: 'krótko' }), timeoutMs: 90_000 }]);
});

it('409 PODOBNY_ZNAK (kod w zagnieżdżonym obiekcie wyjątku Nest) i 400 z listą błędów briefu', async () => {
  mockApi.mockRejectedValueOnce(new ApiError('Ten znak jest zbyt podobny do wydanego wcześniej.', 409, { message: { message: 'Ten znak jest zbyt podobny do wydanego wcześniej.', kod: 'PODOBNY_ZNAK' } }));
  expect(await wybierzKierunek(ID, { seriaId: 's', kierunekId: 'k' })).toEqual({ ok: false, status: 409, kod: 'PODOBNY_ZNAK', blad: 'Ten znak jest zbyt podobny do wydanego wcześniej.' });
  mockApi.mockRejectedValueOnce(new ApiError('Brief zawiera nazwę znanej marki.', 400, { message: 'Brief zawiera nazwę znanej marki.', kod: 'ZNANA_MARKA', bledy: ['nazwa: znana marka'] }));
  expect(await utworzMarke(BRIEF)).toEqual({ ok: false, status: 400, kod: 'ZNANA_MARKA', blad: 'Brief zawiera nazwę znanej marki.', bledy: ['nazwa: znana marka'] });
});

it('403 MODUL_NIEDOSTEPNY: wynik z kodem (ekran braku dostępu)', async () => {
  mockApi.mockRejectedValueOnce(new ApiError('Kreator marki jest wyłączony.', 403, { message: 'Kreator marki jest wyłączony.', kod: 'MODUL_NIEDOSTEPNY' }));
  expect(await stanKreatoraMarki()).toMatchObject({ ok: false, status: 403, kod: 'MODUL_NIEDOSTEPNY' });
});

it('identyfikator spoza wzorca nie dochodzi do API', async () => {
  expect(await usunMarke('../../users/me')).toMatchObject({ ok: false, status: 404 });
  expect(await pobierzMarke('a/b')).toMatchObject({ ok: false, status: 404 });
  expect(mockApi).not.toHaveBeenCalled();
});

it('zakup: bez zgody na treść cyfrową i z nieznaną metodą – bez zapytania; ze zgodą – POST z zgodaTresciCyfrowej: true', async () => {
  expect(await kupMarke('pakiet', 'portfel', false)).toMatchObject({ ok: false, status: 400 });
  expect(await kupMarke('pakiet', 'gotowka' as never, true)).toMatchObject({ ok: false, status: 400 });
  expect(await kupMarke('x' as never, 'portfel', true)).toMatchObject({ ok: false, status: 400 });
  expect(mockApi).not.toHaveBeenCalled();
  mockApi.mockResolvedValue({ status: 'brak-srodkow', brakuje: 12.5 });
  expect(await kupMarke('druga-marka', 'portfel', true)).toEqual({ ok: true, dane: { status: 'brak-srodkow', brakuje: 12.5 } });
  expect(mockApi).toHaveBeenCalledWith('/kreator-marki/druga-marka', { method: 'POST', body: JSON.stringify({ metoda: 'portfel', zgodaTresciCyfrowej: true }), timeoutMs: 60_000 });
  await kupMarke('pakiet', 'karta', true);
  expect(mockApi).toHaveBeenLastCalledWith('/kreator-marki/pakiet', { method: 'POST', body: JSON.stringify({ metoda: 'karta', zgodaTresciCyfrowej: true }), timeoutMs: 60_000 });
});

it('awaria sieci (status 0): komunikat z apiFetch', async () => {
  mockApi.mockRejectedValue(new ApiError('Nie udało się połączyć z API.', 0, null));
  expect(await listaPlikow(ID)).toEqual({ ok: false, status: 0, blad: 'Nie udało się połączyć z API.' });
});
