/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * C-27 — t1 04.10: po pushu webhook pobrał zmiany, a lista w panelu dalej pokazywała „jeszcze nie wywołany”
 * aż do przeładowania strony — „Odśwież” zakładki nie wczytywał sekcji repozytorium.
 * 21.10 — budowanie po pobraniu zmian, zmienne .env (same nazwy, nigdy wartości) i log wdrożenia w historii.
 */
const mockFetchGit = jest.fn();
const mockZapisz = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-git-actions', () => ({
  fetchGit: (...a: unknown[]) => mockFetchGit(...a),
  createGitWebhook: jest.fn(),
  deleteGitWebhook: jest.fn(),
  gitOp: jest.fn(),
  zapiszKonfiguracjeGit: (...a: unknown[]) => mockZapisz(...a),
}));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { GitRepoPanel, czasTrwania } from './GitRepoPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const baza = { domena: 'a.pl', wToku: false, klucz: null, webhooki: [], operacje: [] };
const operacja = {
  id: 'o1', tryb: 'pull', katalog: '', adres: null, status: 'FAILED', utworzone: '2026-10-21T10:00:00.000Z',
  webhook: true, head: 'abc123 fix', kopia: null, blad: 'budowanie nie powiodło się', budowanie: 'blad', zmienne: 2, trwaloS: 75,
  log: 'npm ERR! missing script: build',
};

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  mockFetchGit.mockReset();
  mockZapisz.mockReset();
  mockPotwierdz.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

const ustawPole = (pole: HTMLInputElement, wartosc: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(pole, wartosc);
  pole.dispatchEvent(new Event('input', { bubbles: true }));
};

it('zmiana odswiezNr wczytuje stan repozytorium ponownie', async () => {
  mockFetchGit.mockResolvedValue({ ok: true, status: baza });
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} odswiezNr={0} />));
  expect(mockFetchGit).toHaveBeenCalledTimes(1);
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} odswiezNr={1} />));
  expect(mockFetchGit).toHaveBeenCalledTimes(2);
});

it('zmienne: lista pokazuje same nazwy, nigdy wartości; nowa zmienna i preset idą do zapisu', async () => {
  mockFetchGit.mockResolvedValue({
    ok: true,
    status: { ...baza, konfiguracje: [{ katalog: '', budowanie: 'npm-build', zmienne: ['API_KEY'], zmieniono: '2026-10-21T09:00:00.000Z' }] },
  });
  mockZapisz.mockResolvedValue({ ok: true, status: baza });
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} />));
  const lista = el.querySelector('[data-lista-zmiennych]')!;
  expect(lista.textContent).toContain('API_KEY');
  expect(lista.textContent).toContain('••••••');

  await act(async () => ustawPole(el.querySelector<HTMLInputElement>('[data-nazwa-zmiennej]')!, 'db_pass'));
  await act(async () => ustawPole(el.querySelector<HTMLInputElement>('[data-wartosc-zmiennej]')!, 'tajne-haslo-123'));
  expect(el.querySelector<HTMLInputElement>('[data-wartosc-zmiennej]')!.type).toBe('password');
  await act(async () => el.querySelector<HTMLButtonElement>('[data-dodaj-zmienna]')!.click());
  expect(el.querySelector('[data-lista-zmiennych]')!.textContent).toContain('DB_PASS');
  expect(el.textContent).not.toContain('tajne-haslo-123');

  await act(async () => el.querySelector<HTMLButtonElement>('[data-zapisz-konfiguracje]')!.click());
  expect(mockZapisz).toHaveBeenCalledWith('s1', { domain: 'a.pl', budowanie: 'npm-build', zmienne: { ustaw: { DB_PASS: 'tajne-haslo-123' } } });
});

it('usunięcie zmiennej po potwierdzeniu trafia do zapisu jako usun', async () => {
  mockFetchGit.mockResolvedValue({
    ok: true,
    status: { ...baza, konfiguracje: [{ katalog: '', budowanie: '', zmienne: ['API_KEY'], zmieniono: '2026-10-21T09:00:00.000Z' }] },
  });
  mockPotwierdz.mockResolvedValue(true);
  mockZapisz.mockResolvedValue({ ok: true, status: baza });
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} />));
  const usun = [...el.querySelectorAll<HTMLButtonElement>('[data-lista-zmiennych] button')].find((b) => b.textContent === 'Usuń')!;
  await act(async () => usun.click());
  expect(mockPotwierdz).toHaveBeenCalled();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-zapisz-konfiguracje]')!.click());
  expect(mockZapisz).toHaveBeenCalledWith('s1', { domain: 'a.pl', budowanie: '', zmienne: { usun: ['API_KEY'] } });
});

it('historia: błąd budowania widoczny, czas trwania i liczba zmiennych; log rozwija się po kliknięciu', async () => {
  mockFetchGit.mockResolvedValue({ ok: true, status: { ...baza, operacje: [operacja] } });
  await act(async () => root.render(<GitRepoPanel serviceId="s1" domains={['a.pl']} />));
  expect(el.querySelector('[data-budowanie="blad"]')?.textContent).toContain('Budowanie: błąd');
  expect(el.textContent).toContain('Trwało 1 min 15 s');
  expect(el.textContent).toContain('Zapisano 2 zmienne do .env');
  expect(el.querySelector('[data-log="o1"]')).toBeNull();
  await act(async () => el.querySelector<HTMLButtonElement>('[data-pokaz-log="o1"]')!.click());
  expect(el.querySelector('[data-log="o1"]')?.textContent).toContain('npm ERR! missing script: build');
});

it('czasTrwania', () => {
  expect(czasTrwania(42)).toBe('42 s');
  expect(czasTrwania(120)).toBe('2 min');
  expect(czasTrwania(75)).toBe('1 min 15 s');
});
