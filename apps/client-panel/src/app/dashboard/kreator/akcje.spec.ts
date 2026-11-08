/**
 * Paczka 120 – akcje serwera kreatora: właściwe metody i ścieżki API, wynik zamiast wyjątku (z kodem HTTP),
 * 409 KATALOG_ZAJETY z listą plików i 400 z listą błędów modelu, ochrona identyfikatora przed doklejeniem ścieżki.
 */
const mockApi = jest.fn();
jest.mock('@/lib/api', () => {
  const prawdziwy = jest.requireActual('@/lib/api') as typeof import('@/lib/api');
  return { ApiError: prawdziwy.ApiError, apiFetch: (...a: unknown[]) => mockApi(...a) };
});

import { ApiError } from '@/lib/api';
import { generujPonownie, opublikuj, polecenieAi, przywrocWersje, stanPublikacji, usunStrone, utworzStrone, zapiszModel, zmienNazweStrony, zmienOkresPro } from './akcje';

const ID = '0b8f6a52-5f0e-4b39-9a51-6a1f3c2d4e5f';

beforeEach(() => mockApi.mockReset());

it('zapis modelu: PUT /kreator/strony/:id z { model }', async () => {
  mockApi.mockResolvedValue({ id: ID });
  const r = await zapiszModel(ID, { a: 1 });
  expect(r).toEqual({ ok: true, dane: { id: ID } });
  expect(mockApi).toHaveBeenCalledWith(`/kreator/strony/${ID}`, { method: 'PUT', body: JSON.stringify({ model: { a: 1 } }) });
});

it('400 z API: komunikat i lista błędów modelu przechodzą do edytora', async () => {
  mockApi.mockRejectedValue(new ApiError('Strona zawiera błędy – popraw zaznaczone pola.', 400, { message: 'Strona zawiera błędy – popraw zaznaczone pola.', bledy: ['seo.tytul: za długi'] }));
  const r = await zapiszModel(ID, {});
  expect(r).toEqual({ ok: false, status: 400, blad: 'Strona zawiera błędy – popraw zaznaczone pola.', bledy: ['seo.tytul: za długi'] });
});

it('nieprawidłowy identyfikator nie dochodzi do API (bez doklejania ścieżek)', async () => {
  const r = await usunStrone('../../users/me');
  expect(r).toMatchObject({ ok: false, status: 404 });
  expect(mockApi).not.toHaveBeenCalled();
  expect(await przywrocWersje(ID, 0)).toMatchObject({ ok: false, status: 404 });
  expect(mockApi).not.toHaveBeenCalled();
});

it('nowa strona: POST /kreator/strony z nazwą i briefem', async () => {
  mockApi.mockResolvedValue({ id: ID });
  const dane = { nazwa: 'Salon Ola', brief: { opis: 'Salon fryzjerski na Jeżycach, strzyżenie i koloryzacja.', typ: 'wizytowka' as const } };
  expect(await utworzStrone(dane)).toEqual({ ok: true, dane: { id: ID } });
  expect(mockApi).toHaveBeenCalledWith('/kreator/strony', { method: 'POST', body: JSON.stringify(dane) });
});

it('polecenie AI: sekcja opcjonalna, dłuższy budżet czasu niż domyślne 20 s', async () => {
  mockApi.mockResolvedValue({});
  await polecenieAi(ID, '  Krócej  ', 'hero');
  expect(mockApi).toHaveBeenLastCalledWith(`/kreator/strony/${ID}/ai`, expect.objectContaining({ method: 'POST', body: JSON.stringify({ polecenie: 'Krócej', sekcjaId: 'hero' }) }));
  expect((mockApi.mock.calls[0]![1] as { timeoutMs: number }).timeoutMs).toBeGreaterThan(90_000);
  await polecenieAi(ID, 'Krócej', null);
  expect(mockApi).toHaveBeenLastCalledWith(`/kreator/strony/${ID}/ai`, expect.objectContaining({ body: JSON.stringify({ polecenie: 'Krócej' }) }));
});

it('publikacja: 409 KATALOG_ZAJETY → kod i lista plików (obiekt wyjątku wprost albo w `message`)', async () => {
  mockApi.mockRejectedValueOnce(new ApiError('API 409', 409, { kod: 'KATALOG_ZAJETY', pliki: ['index.php', 'wp-config.php'] }));
  const r = await opublikuj(ID, { domena: 'przyklad.pl' });
  expect(r).toMatchObject({ ok: false, status: 409, kod: 'KATALOG_ZAJETY', pliki: ['index.php', 'wp-config.php'] });
  expect(mockApi).toHaveBeenLastCalledWith(`/kreator/strony/${ID}/publikuj`, expect.objectContaining({ body: JSON.stringify({ domena: 'przyklad.pl' }) }));

  mockApi.mockRejectedValueOnce(new ApiError('API 409', 409, { message: { kod: 'KATALOG_ZAJETY', pliki: ['a.html'] }, statusCode: 409 }));
  expect(await opublikuj(ID, { domena: 'przyklad.pl', zastap: true })).toMatchObject({ kod: 'KATALOG_ZAJETY', pliki: ['a.html'] });
  expect(mockApi).toHaveBeenLastCalledWith(`/kreator/strony/${ID}/publikuj`, expect.objectContaining({ body: JSON.stringify({ domena: 'przyklad.pl', zastap: true }) }));
});

it('próba: publikacja bez domeny; brak endpointu publikacji (404) → status 404 dla „wkrótce”', async () => {
  mockApi.mockResolvedValueOnce({ tryb: 'podglad', adres: 'https://podglad.example/x', wazneDo: '2026-11-14T00:00:00Z' });
  await opublikuj(ID, {});
  expect(mockApi).toHaveBeenLastCalledWith(`/kreator/strony/${ID}/publikuj`, expect.objectContaining({ body: '{}' }));
  mockApi.mockRejectedValueOnce(new ApiError('Cannot GET /kreator/strony/x/publikacja', 404, null));
  expect(await stanPublikacji(ID)).toMatchObject({ ok: false, status: 404 });
});

it('zmiana nazwy: PATCH z przyciętą nazwą; pusta nazwa nie idzie do API', async () => {
  mockApi.mockResolvedValue({});
  expect(await zmienNazweStrony(ID, '  Nowa nazwa  ')).toEqual({ ok: true, dane: { nazwa: 'Nowa nazwa' } });
  expect(mockApi).toHaveBeenCalledWith(`/kreator/strony/${ID}`, { method: 'PATCH', body: JSON.stringify({ nazwa: 'Nowa nazwa' }) });
  // Nazwa po normalizacji w API (PATCH zwraca { id, nazwa }) wraca do edytora.
  mockApi.mockResolvedValueOnce({ id: ID, nazwa: 'Salon na Rynku' });
  expect(await zmienNazweStrony(ID, 'Salon   na Rynku')).toEqual({ ok: true, dane: { nazwa: 'Salon na Rynku' } });
  mockApi.mockReset();
  expect(await zmienNazweStrony(ID, '   ')).toMatchObject({ ok: false, status: 400 });
  expect(mockApi).not.toHaveBeenCalled();
});

it('błąd sieci (status 0) – komunikat z apiFetch; „API 500” zamienione na polski', async () => {
  mockApi.mockRejectedValueOnce(new ApiError('Brak połączenia z serwerem.', 0, null));
  expect(await usunStrone(ID)).toMatchObject({ ok: false, status: 0, blad: 'Brak połączenia z serwerem.' });
  mockApi.mockRejectedValueOnce(new ApiError('API 500', 500, null));
  expect(await usunStrone(ID)).toMatchObject({ ok: false, status: 500, blad: 'Operacja nie powiodła się – spróbuj ponownie.' });
});

it('paczka 123 – ponowna generacja: POST /kreator/strony/:id/generuj-ponownie (bez usuwania strony); zły id nie dochodzi do API', async () => {
  mockApi.mockResolvedValue({ id: ID, status: 'GENEROWANIE' });
  expect(await generujPonownie(ID)).toEqual({ ok: true, dane: { id: ID, status: 'GENEROWANIE' } });
  expect(mockApi).toHaveBeenCalledTimes(1);
  expect(mockApi).toHaveBeenCalledWith(`/kreator/strony/${ID}/generuj-ponownie`, { method: 'POST' });
  expect(await generujPonownie('x/../y')).toMatchObject({ ok: false, status: 404 });
  expect(mockApi).toHaveBeenCalledTimes(1);
});

it('paczka 123 – okres Kreatora Pro od następnego odnowienia: POST /kreator/pro/okres { okres }', async () => {
  mockApi.mockResolvedValue({ abonament: null });
  await zmienOkresPro('YEAR');
  expect(mockApi).toHaveBeenCalledWith('/kreator/pro/okres', { method: 'POST', body: JSON.stringify({ okres: 'YEAR' }) });
  expect(await zmienOkresPro('DAY' as never)).toMatchObject({ ok: false, status: 400 });
});
