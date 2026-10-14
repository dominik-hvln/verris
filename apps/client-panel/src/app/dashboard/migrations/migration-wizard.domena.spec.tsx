/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * 14.10 — domena docelowa z listy domen konta (API przyjmuje tylko domenę tej usługi). Wcześniej pole tekstowe:
 * literówka albo cudza domena kończyły się odmową dopiero przy starcie migracji.
 */
const mockDomeny = jest.fn();
jest.mock('./actions', () => ({ preflightMigrationAction: jest.fn(), createMigrationBundleAction: jest.fn(), discoverMigrationSourceAction: jest.fn() }));
jest.mock('../services/[id]/hosting-domains-action', () => ({ fetchHostingDomainsAction: (...a: unknown[]) => mockDomeny(...a) }));

import { MigrationWizard } from './migration-wizard';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = () => {};

let root: Root;
let el: HTMLDivElement;
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
const klik = (n: Element) => act(async () => void n.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const poleDomeny = () => [...el.querySelectorAll('label')].find((l) => l.textContent?.trim().startsWith('Domena docelowa'))!;

async function otworz() {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root.render(<MigrationWizard serviceId="s1" zakres="pliki" />));
  await klik(przycisk('Ręcznie'));
  await klik(przycisk('Dalej: co przenosimy'));
}
afterEach(() => act(() => root.unmount()));

it('lista domen konta → wybór z listy (domena konta domyślnie), bez pola do wpisania', async () => {
  mockDomeny.mockResolvedValue({ ok: true, dane: { domains: [{ name: 'firma.pl' }, { name: 'Sklep.pl' }], primaryDomain: 'firma.pl', daUsername: 'u', fetchError: null } });
  await otworz();
  expect(mockDomeny).toHaveBeenCalledWith('s1');
  const pole = poleDomeny();
  expect(pole.querySelector('input')).toBeNull();
  expect(pole.textContent).toContain('firma.pl (domena konta)');
});

it('bez listy (błąd serwera) — pole tekstowe jak dotąd', async () => {
  mockDomeny.mockResolvedValue({ ok: false, blad: 'serwer niedostępny' });
  await otworz();
  expect(poleDomeny().querySelector('input')).not.toBeNull();
});
