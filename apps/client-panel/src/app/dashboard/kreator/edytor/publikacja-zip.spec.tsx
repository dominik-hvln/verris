/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { StanPublikacji, WynikPublikacji } from '@/lib/kreator';
import { opublikuj, stanPublikacji } from '../akcje';
import { Publikacja } from './publikacja';

/**
 * Paczka 134 – ZIP strony za progiem (3 opłacone miesiące hostingu albo plan roczny): okno publikacji pokazuje
 * link „Pobierz ZIP” tylko przy `zip.dostepny`, w przeciwnym razie powód z API – przed publikacją i w wyniku po niej.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
jest.mock('../akcje', () => ({
  stanPublikacji: jest.fn(),
  opublikuj: jest.fn(),
  wycofajPublikacje: jest.fn(),
}));
jest.mock('../cms/przejscie-na-cms', () => ({ PrzejscieNaCms: () => null }));

const ID = '11111111-2222-4333-8444-555555555555';
const PROG = 'Pobranie strony w pliku ZIP jest dostępne po 3 opłaconych miesiącach hostingu albo od razu przy planie rocznym.';

const stan = (zip: StanPublikacji['zip']): StanPublikacji => ({
  wersja: 'hosting',
  mozliwa: true,
  domeny: [{ domena: 'x.pl', subskrypcjaId: 'sub1', stan: 'pusta' }],
  zmianyPlanu: [],
  zip,
});

let kontener: HTMLDivElement;
let root: Root;
beforeEach(() => {
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
});
afterEach(() => {
  act(() => root.unmount());
  kontener.remove();
  jest.clearAllMocks();
});

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

async function otworz(s: StanPublikacji) {
  (stanPublikacji as jest.Mock).mockResolvedValue({ ok: true, dane: s });
  act(() => root.render(<Publikacja id={ID} otwarta onZamknij={() => undefined} przedPublikacja={async () => true} onOpublikowano={() => undefined} />));
  await flush();
}

const linkZip = () => [...kontener.querySelectorAll('a')].find((a) => a.textContent?.includes('Pobierz ZIP')) ?? null;

async function opublikujNaDomene() {
  const w: WynikPublikacji = { tryb: 'domena', adres: 'https://x.pl/', pliki: 12, ostrzezenia: [] };
  (opublikuj as jest.Mock).mockResolvedValue({ ok: true, dane: w });
  const przycisk = [...kontener.querySelectorAll('button')].find((b) => b.textContent?.includes('Opublikuj na x.pl'))!;
  await act(async () => przycisk.click());
  await flush();
  expect(kontener.textContent).toContain('Strona opublikowana');
}

describe('Publikacja – ZIP strony za progiem (paczka 134)', () => {
  it('zip.dostepny = false: brak linku „Pobierz ZIP”, widoczny powód – przed publikacją i po niej', async () => {
    await otworz(stan({ dostepny: false, powod: PROG }));
    expect(linkZip()).toBeNull();
    expect(kontener.textContent).toContain(PROG);

    await opublikujNaDomene();
    expect(linkZip()).toBeNull();
    expect(kontener.textContent).toContain(PROG);
  });

  it('zip.dostepny = true: link „Pobierz ZIP” jest – przed publikacją i po niej', async () => {
    await otworz(stan({ dostepny: true }));
    expect(linkZip()?.getAttribute('href')).toBe(`/api/kreator/zip/${ID}`);
    expect(kontener.textContent).not.toContain(PROG);

    await opublikujNaDomene();
    expect(linkZip()?.getAttribute('href')).toBe(`/api/kreator/zip/${ID}`);
  });
});
