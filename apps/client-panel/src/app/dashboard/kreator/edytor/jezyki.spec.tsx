/**
 * @jest-environment jsdom
 */
import { TextEncoder as TE } from 'node:util';
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PRZYKLAD_SALON, PRZYKLAD_SALON_EN } from '@verris/kreator';
import { PLANY_KREATORA, skrotTresci, walidujStrone, type Strona } from '@verris/kreator/klient';
import { Struktura } from './struktura';
import { brakujacePodstrony, jezykiDoDodania, kopiaWersjiJezykowej } from './jezyki';

/**
 * Paczka 124 – wersje językowe w edytorze: przełącznik języka nad listą podstron (lista w wybranym języku),
 * „Dodaj wersję językową” (AI albo kopia, bez Pro z kłódką), oznaczenie nieaktualnego tłumaczenia.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
globalThis.structuredClone ??= <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
// jsdom bez TextEncoder (skrót treści tłumaczenia – w przeglądarce jest).
globalThis.TextEncoder ??= TE as unknown as typeof TextEncoder;
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn(), message: jest.fn() } }));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: jest.fn(async () => true), zapytaj: jest.fn(async () => null) }));

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

const model = (w: unknown): Strona => {
  const r = walidujStrone(w);
  if (!r.ok) throw new Error(r.bledy.join('\n'));
  return r.strona;
};
const przyciski = () => [...el.querySelectorAll('button')];
const przycisk = (tekst: string) => przyciski().find((b) => b.textContent?.includes(tekst) || b.getAttribute('aria-label') === tekst);

describe('wersje językowe w strukturze edytora', () => {
  function Uchwyt({ start, funkcjePro = true, wynik, onDodajWersje, onPrzetlumacz }: {
    start: Strona;
    funkcjePro?: boolean;
    wynik: { model?: Strona; ip?: number };
    onDodajWersje?: jest.Mock;
    onPrzetlumacz?: jest.Mock;
  }) {
    const [m, setM] = useState(start);
    const [ip, setIp] = useState(0);
    wynik.model = m;
    wynik.ip = ip;
    return (
      <Struktura
        model={m}
        podstrona={ip}
        zaznaczona={null}
        plan={funkcjePro ? PLANY_KREATORA.pro : PLANY_KREATORA.hosting}
        funkcjePro={funkcjePro}
        bledy={new Map()}
        onPodstrona={setIp}
        onZaznacz={jest.fn()}
        onZmiana={(fn) => setM(fn)}
        onKomunikat={jest.fn()}
        onDodajWersje={onDodajWersje ?? jest.fn()}
        onUsunWersje={jest.fn()}
        onPrzetlumacz={onPrzetlumacz ?? jest.fn()}
      />
    );
  }

  describe('przełącznik języka nad listą podstron', () => {
    it('PL / EN; lista podstron w wybranym języku; przełączenie na wersję tej samej podstrony', async () => {
      const start = model(PRZYKLAD_SALON_EN);
      const wynik: { model?: Strona; ip?: number } = {};
      await act(async () => root.render(<Uchwyt start={start} wynik={wynik} />));
      const grupa = el.querySelector('[role="group"][aria-label="Wersja językowa w edytorze"]')!;
      expect([...grupa.querySelectorAll('button[aria-pressed]')].map((b) => `${b.textContent}:${b.getAttribute('aria-pressed')}`)).toEqual(['PL:true', 'EN:false']);
      expect(el.textContent).toContain('Podstrony');
      await act(async () => przycisk('Wersja angielska')!.click());
      expect(wynik.ip).toBe(start.strony.findIndex((p) => p.slug === 'en'));
      expect(el.textContent).toContain('Podstrony – wersja angielska');
      expect([...grupa.querySelectorAll('button[aria-pressed]')].map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
      // W wersji językowej: usuwanie całej wersji, bez „Dodaj podstronę”.
      expect(przycisk('Usuń wersję angielską')).toBeTruthy();
      expect(przycisk('Dodaj podstronę')).toBeUndefined();
    });

    it('strona jednojęzyczna: bez przełącznika, z „Dodaj wersję językową”', async () => {
      await act(async () => root.render(<Uchwyt start={model(PRZYKLAD_SALON)} wynik={{}} />));
      expect(el.querySelector('[aria-label="Wersja językowa w edytorze"]')).toBeNull();
      expect(przycisk('Dodaj wersję językową')).toBeTruthy();
    });

    it('nieaktualne tłumaczenie: znacznik na liście i „Przetłumacz ponownie” z kluczem podstrony', async () => {
      const start = model(PRZYKLAD_SALON_EN); // fikstura ma celowo nieaktualny skrót
      const onPrzetlumacz = jest.fn();
      await act(async () => root.render(<Uchwyt start={start} wynik={{}} onPrzetlumacz={onPrzetlumacz} />));
      await act(async () => przycisk('Wersja angielska')!.click());
      expect(el.textContent).toContain('nieaktualna');
      expect(el.textContent).toContain('Wersja EN może być nieaktualna – podstrona „Start” zmieniła się od tłumaczenia.');
      await act(async () => przycisk('Przetłumacz ponownie')!.click());
      expect(onPrzetlumacz).toHaveBeenCalledWith('en', ['']);
    });

    it('aktualne tłumaczenie: bez ostrzeżenia', async () => {
      const start = model(PRZYKLAD_SALON_EN);
      start.strony.find((p) => p.slug === 'en')!.tlumaczenie = { zrodlo: skrotTresci(start.strony[0]!) };
      await act(async () => root.render(<Uchwyt start={start} wynik={{}} />));
      await act(async () => przycisk('Wersja angielska')!.click());
      expect(el.textContent).not.toContain('nieaktualna');
    });
  });

  describe('Dodaj wersję językową', () => {
    it('Pro: wybór języka i trybu → onDodajWersje(język, tryb); tylko języki jeszcze niedodane', async () => {
      const onDodajWersje = jest.fn();
      await act(async () => root.render(<Uchwyt start={model(PRZYKLAD_SALON_EN)} wynik={{}} onDodajWersje={onDodajWersje} />));
      await act(async () => przycisk('Dodaj wersję językową')!.click());
      const radia = [...document.querySelectorAll('[role="radio"]')].map((r) => r.textContent);
      expect(radia.some((t) => t?.includes('Angielski'))).toBe(false);
      expect(radia.some((t) => t?.includes('Niemiecki'))).toBe(true);
      expect(radia.some((t) => t?.includes('Ukraiński'))).toBe(true);
      const kopia = [...document.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((r) => r.textContent?.includes('Skopiuj bez tłumaczenia'))!;
      await act(async () => kopia.click());
      await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Dodaj wersję') && !b.textContent.includes('językową'))!.click());
      expect(onDodajWersje).toHaveBeenCalledWith('de', 'kopia');
    });

    it('bez Pro: opcja z kłódką i opisem, przycisk dodania nieaktywny', async () => {
      const onDodajWersje = jest.fn();
      await act(async () => root.render(<Uchwyt start={model(PRZYKLAD_SALON)} funkcjePro={false} wynik={{}} onDodajWersje={onDodajWersje} />));
      const otworz = przycisk('Dodaj wersję językową')!;
      expect(otworz.textContent).toContain('Pro');
      await act(async () => otworz.click());
      expect(document.body.textContent).toContain('Wersje językowe są w Kreatorze Pro: do 3 dodatkowych języków (angielski, niemiecki, ukraiński)');
      const dodaj = [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Dodaj wersję') && !b.textContent.includes('językową'))!;
      expect(dodaj.disabled).toBe(true);
      expect(onDodajWersje).not.toHaveBeenCalled();
    });
  });
});

describe('logika wersji w edytorze', () => {
  it('kopia bez tłumaczenia: podstrony z prefiksem, klucz i skrót oryginału, model poprawny', () => {
    const s = model(PRZYKLAD_SALON);
    s.strony.push({ ...structuredClone(s.strony[0]!), slug: 'cennik', tytul: 'Cennik' });
    const k = kopiaWersjiJezykowej(s, 'de');
    expect(k.strony.map((p) => p.slug)).toEqual(['', 'cennik', 'de', 'de/cennik']);
    expect(k.strony[3]).toMatchObject({ jezyk: 'de', klucz: 'cennik', tlumaczenie: { zrodlo: skrotTresci(s.strony[1]!) } });
    expect(walidujStrone(k).ok).toBe(true);
    expect(jezykiDoDodania(k)).toEqual(['en', 'uk']);
    expect(brakujacePodstrony(k, 'de')).toEqual([]);
    expect(brakujacePodstrony(model(PRZYKLAD_SALON_EN), 'en')).toEqual([]);
  });
});
