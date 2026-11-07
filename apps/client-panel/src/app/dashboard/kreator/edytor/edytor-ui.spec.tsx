/**
 * @jest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PRZYKLAD_SALON } from '@verris/kreator';
import { PLANY_KREATORA, type Strona } from '@verris/kreator/klient';
import { FormularzPol } from './formularz-sekcji';
import { PanelSekcji } from './panel-sekcji';
import { Struktura } from './struktura';
import { nowaSekcja, polaSekcji, ustaw, walidujWEdytorze, type Sciezka } from './schemat';

/**
 * Paczka 120 – edytor kreatora: formularz sekcji generowany z typu (zmiana pola → model, błąd przy polu),
 * zasady wersji w UI (kłódki Pro tylko bez Pro, limit podstron z planu).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom nie ma structuredClone (przeglądarki i Node – mają); model to czysty JSON.
globalThis.structuredClone ??= <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
});

const zCennikiem = (): { model: Strona; idx: number } => {
  const model = structuredClone(PRZYKLAD_SALON) as unknown as Strona;
  model.strony[0]!.sekcje.push(nowaSekcja('cennik', 'cennik-kolumny', new Set(model.strony[0]!.sekcje.map((s) => s.id))));
  return { model, idx: model.strony[0]!.sekcje.length - 1 };
};

function wpisz(pole: HTMLInputElement | HTMLTextAreaElement, tekst: string) {
  const proto = pole instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(pole, tekst);
  pole.dispatchEvent(new Event('input', { bubbles: true }));
}

const poEtykiecie = (tekst: string) => {
  const label = [...el.querySelectorAll('label')].find((l) => l.textContent?.startsWith(tekst));
  if (!label) throw new Error(`Brak pola „${tekst}”`);
  return document.getElementById(label.htmlFor) as HTMLInputElement;
};

describe('formularz sekcji z typu', () => {
  function Uchwyt({ start, sciezka, wynik }: { start: Strona; sciezka: Sciezka; wynik: { model?: Strona } }) {
    const [model, setModel] = useState(start);
    wynik.model = model;
    const k = { model, bledy: walidujWEdytorze(model).bledy, onZmiana: (s: Sciezka, w: unknown) => setModel((m) => ustaw(m, s, w)) };
    return <FormularzPol pola={polaSekcji('cennik')} sciezka={sciezka} k={k} />;
  }

  it('zmiana pola trafia do modelu pod ścieżką sekcji; pusty wymagany nagłówek → błąd przy polu', async () => {
    const { model, idx } = zCennikiem();
    const wynik: { model?: Strona } = {};
    const sciezka: Sciezka = ['strony', 0, 'sekcje', idx, 'dane'];
    await act(async () => root.render(<Uchwyt start={model} sciezka={sciezka} wynik={wynik} />));

    await act(async () => wpisz(poEtykiecie('Nagłówek'), 'Cennik zabiegów'));
    expect((wynik.model!.strony[0]!.sekcje[idx]!.dane as { naglowek: string }).naglowek).toBe('Cennik zabiegów');

    await act(async () => wpisz(poEtykiecie('Nagłówek'), ''));
    const pole = poEtykiecie('Nagłówek');
    expect(pole.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(pole.getAttribute('aria-describedby')!.split(' ').pop()!)?.textContent).toBe('Uzupełnij to pole.');
  });

  it('cena brutto z podpowiedzią netto; lista pakietów: dodawanie do limitu ze schematu', async () => {
    const { model, idx } = zCennikiem();
    const wynik: { model?: Strona } = {};
    await act(async () => root.render(<Uchwyt start={model} sciezka={['strony', 0, 'sekcje', idx, 'dane']} wynik={wynik} />));
    const pakiety = () => (wynik.model!.strony[0]!.sekcje[idx]!.dane as { pakiety: { cenaBrutto: number | null }[] }).pakiety;

    // Nowy pakiet startuje z „wyceną indywidualną” (null) – odznaczenie włącza pole ceny.
    const indywidualna = [...el.querySelectorAll('label')].find((l) => l.textContent?.includes('Wycena indywidualna'))!.querySelector('input')!;
    await act(async () => indywidualna.click());
    await act(async () => wpisz(poEtykiecie('Cena brutto'), '123'));
    expect(pakiety()[0]!.cenaBrutto).toBe(123);
    expect(el.textContent).toContain('Netto: 100 zł (brutto / 1,23).');

    const dodaj = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Dodaj pakiet'))!;
    for (let i = pakiety().length; i < 6; i++) await act(async () => dodaj().click());
    expect(pakiety()).toHaveLength(6);
    expect(dodaj().disabled).toBe(true);
    expect(el.textContent).toContain('To już najwięcej w tej sekcji.');
  });
});

describe('zasady wersji w edytorze', () => {
  const k = (model: Strona) => ({ model, bledy: new Map<string, string>(), onZmiana: jest.fn() });

  it('wariant Pro: kłódka i opis zamiennika bez Pro; w Kreatorze Pro bez kłódki; wybór włącza podgląd Pro', async () => {
    const model = structuredClone(PRZYKLAD_SALON) as unknown as Strona;
    const hero = model.strony[0]!.sekcje.find((s) => s.typ === 'hero')!;
    const i = model.strony[0]!.sekcje.indexOf(hero);
    const wybranoPro = jest.fn();
    const kontekst = k(model);
    await act(async () => root.render(<PanelSekcji sekcja={hero} sciezka={['strony', 0, 'sekcje', i]} k={kontekst} funkcjePro={false} onWybranoPro={wybranoPro} />));
    const mozaika = [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith('Mozaika'))!;
    expect(mozaika.textContent).toContain('funkcja Kreatora Pro');
    expect(mozaika.querySelector('svg')).not.toBeNull();
    expect(mozaika.textContent).toContain('Bez Pro na stronie: „Podzielony”');
    await act(async () => (mozaika as HTMLButtonElement).click());
    expect(kontekst.onZmiana).toHaveBeenCalledWith(['strony', 0, 'sekcje', i, 'wariant'], 'hero-mozaika');
    expect(wybranoPro).toHaveBeenCalled();

    await act(async () => root.render(<PanelSekcji sekcja={hero} sciezka={['strony', 0, 'sekcje', i]} k={k(model)} funkcjePro onWybranoPro={wybranoPro} />));
    const mozaikaPro = [...el.querySelectorAll('[role="radio"]')].find((b) => b.textContent?.startsWith('Mozaika'))!;
    expect(mozaikaPro.textContent).toContain('Pro');
    expect(mozaikaPro.textContent).not.toContain('funkcja Kreatora Pro');
    expect(mozaikaPro.textContent).not.toContain('Bez Pro na stronie');
  });

  it('limit podstron z planu: przy 5 podstronach w wersji „hosting” przycisk zablokowany z wyjaśnieniem; Pro bez limitu', async () => {
    const model = structuredClone(PRZYKLAD_SALON) as unknown as Strona;
    while (model.strony.length < 5) {
      const n = model.strony.length;
      model.strony.push({ slug: `p${n}`, tytul: `Podstrona ${n}`, seo: {}, sekcje: [nowaSekcja('cta', 'cta-pasek', new Set())] });
    }
    const props = {
      model,
      podstrona: 0,
      zaznaczona: null,
      funkcjePro: false,
      bledy: new Map<string, string>(),
      onPodstrona: jest.fn(),
      onZaznacz: jest.fn(),
      onZmiana: jest.fn(),
      onKomunikat: jest.fn(),
    };
    await act(async () => root.render(<Struktura {...props} plan={PLANY_KREATORA.hosting} />));
    const dodaj = () => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Dodaj podstronę'))!;
    expect(dodaj().disabled).toBe(true);
    expect(document.getElementById(dodaj().getAttribute('aria-describedby')!)?.textContent).toBe('W tej wersji strona może mieć najwyżej 5 podstron. W Kreatorze Pro – bez limitu.');

    await act(async () => root.render(<Struktura {...props} plan={PLANY_KREATORA.pro} funkcjePro />));
    expect(dodaj().disabled).toBe(false);
    expect(el.textContent).not.toContain('najwyżej');
  });
});
