/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * PB-45 — zgoda na migrację przygotowaną przez obsługę: ten sam tekst upoważnienia co w kreatorze, co i skąd
 * bez haseł, „Zgadzam się” wysyła token z linku, po decyzji przycisków już nie ma.
 */
const mockPrzyjmij = jest.fn();
const mockOdrzuc = jest.fn();
jest.mock('../actions', () => ({
  przyjmijZgodeMigracjiAction: (...a: unknown[]) => mockPrzyjmij(...a),
  odrzucZgodeMigracjiAction: (...a: unknown[]) => mockOdrzuc(...a),
}));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: jest.fn(async () => true) }));

import { ZgodaMigracji } from './zgoda-migracji';
import { TrescUpowaznienia } from '../upowaznienie';
import type { ProsbaOZgode } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const prosba = (zmiany: Partial<ProsbaOZgode> = {}): ProsbaOZgode => ({
  id: 'm1000000-0000-4000-8000-000000000001',
  stan: 'oczekuje',
  targetDomain: 'sklep.example.pl',
  createdAt: '2026-10-08T10:00:00Z',
  wygasa: '2026-10-15T10:00:00Z',
  decyzjaAt: null,
  ticketId: null,
  zrodlo: {
    ftp: { protocol: 'ftp', host: 'ftp.stary.pl', port: 21, username: 'sklep', remotePath: '/public_html' },
    mysql: [{ host: 'mysql.stary.pl', port: 3306, database: 'sklep_db', username: null }, { host: 'mysql.stary.pl', port: 3306, database: 'blog_db', username: 'b' }],
    imap: [{ email: 'biuro@sklep.example.pl', host: 'imap.stary.pl' }],
    utworzBrakujaceSkrzynki: true,
    notes: 'Dane ze zgłoszenia #1234',
  },
  ...zmiany,
});

let el: HTMLDivElement;
let root: Root;
beforeEach(() => {
  jest.clearAllMocks();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst));
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));

it('czeka na decyzję: co i skąd (z odmianą), tekst upoważnienia z kreatora, dwa przyciski', async () => {
  await act(async () => root.render(<ZgodaMigracji serviceId="s1" prosba={prosba()} token="tok-z-maila" />));
  const t = el.textContent!;
  expect(t).toContain('ftp.stary.pl:21');
  expect(t).toContain('2 bazy');
  expect(t).toContain('sklep_db');
  expect(t).toContain('1 skrzynka');
  expect(t).toContain('brakujące założymy');
  expect(t).toContain('Dane ze zgłoszenia #1234');
  // Dokładnie ten sam tekst co w kroku „Start” kreatora klienta.
  const upowaznienie = renderToStaticMarkup(<TrescUpowaznienia />).replace(/<[^>]+>/g, '');
  expect(t).toContain(upowaznienie);
  expect(przycisk('Zgadzam się')).toBeDefined();
  expect(przycisk('Nie zgadzam się')).toBeDefined();
});

it('„Zgadzam się” wysyła token z linku; po sukcesie przyciski znikają', async () => {
  mockPrzyjmij.mockResolvedValue({ ok: true, migration: {} });
  await act(async () => root.render(<ZgodaMigracji serviceId="s1" prosba={prosba()} token="tok-z-maila" />));
  await klik(przycisk('Zgadzam się — uruchom')!);
  expect(mockPrzyjmij).toHaveBeenCalledWith({ serviceId: 's1', migrationId: prosba().id, token: 'tok-z-maila' });
  expect(el.textContent).toContain('Zatwierdzono tę migrację');
  expect(przycisk('Zgadzam się')).toBeUndefined();
});

it('błąd API (np. limit migracji) zostaje na ekranie, przyciski dalej są', async () => {
  mockPrzyjmij.mockResolvedValue({ error: 'Dla tej usługi trwa już migracja.' });
  await act(async () => root.render(<ZgodaMigracji serviceId="s1" prosba={prosba()} />));
  await klik(przycisk('Zgadzam się — uruchom')!);
  expect(el.textContent).toContain('Dla tej usługi trwa już migracja.');
  expect(przycisk('Zgadzam się')).toBeDefined();
});

it('„Nie zgadzam się” → odrzucona, dane usunięte', async () => {
  mockOdrzuc.mockResolvedValue({ ok: true, prosba: {} });
  await act(async () => root.render(<ZgodaMigracji serviceId="s1" prosba={prosba()} token="t" />));
  await klik(przycisk('Nie zgadzam się')!);
  expect(mockOdrzuc).toHaveBeenCalledWith({ serviceId: 's1', migrationId: prosba().id, token: 't' });
  expect(el.textContent).toContain('dane dostępowe usunęliśmy');
});

it.each([
  ['wygasla', 'Prośba wygasła'],
  ['zaakceptowana', 'Zatwierdzono'],
  ['odrzucona', 'Odrzucono'],
] as const)('stan %s: komunikat zamiast przycisków', async (stan, tekst) => {
  await act(async () => root.render(<ZgodaMigracji serviceId="s1" prosba={prosba({ stan, zrodlo: null })} />));
  expect(el.textContent).toContain(tekst);
  expect(przycisk('Zgadzam się')).toBeUndefined();
});
