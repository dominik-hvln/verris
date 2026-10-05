/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Wykres } from './wykres';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const punkty = [
  { t: 0, v: 10, label: 'pon. 10:00' },
  { t: 3_600_000, v: 20, label: 'pon. 11:00' },
  { t: 7_200_000, v: 30, label: 'pon. 12:00' },
];

let root: Root;
let el: HTMLElement;
function zamontuj(props: Partial<Parameters<typeof Wykres>[0]> = {}) {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root.render(<Wykres punkty={punkty} format={(v) => `${v}%`} nazwa="CPU" {...props} />));
  const obraz = el.querySelector<HTMLElement>('[role="slider"]')!;
  obraz.getBoundingClientRect = () => ({ left: 100, width: 200, top: 0, height: 150, right: 300, bottom: 150, x: 100, y: 0, toJSON: () => ({}) });
  return obraz;
}
const dymek = () => el.querySelector('[role="tooltip"]')?.textContent ?? null;
const czytnik = () => el.querySelector('[role="slider"]')!.getAttribute('aria-valuetext');
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('Wykres — dymek myszą i z klawiatury', () => {
  it('ruch kursora pokazuje wartość i czas najbliższego punktu, wyjście chowa dymek', () => {
    const obraz = zamontuj();
    expect(dymek()).toBeNull();
    act(() => {
      obraz.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200 })); // środek → punkt 2
    });
    expect(dymek()).toBe('20%pon. 11:00');
    expect(czytnik()).toBe('pon. 11:00: 20%');
    act(() => {
      obraz.dispatchEvent(new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });
    expect(dymek()).toBeNull();
  });

  it('fokus pokazuje ostatni punkt, strzałki przesuwają aktywny punkt (z granicami), blur chowa', () => {
    const obraz = zamontuj();
    expect(obraz.tabIndex).toBe(0);
    act(() => obraz.focus());
    expect(dymek()).toBe('30%pon. 12:00');
    const klawisz = (key: string) =>
      act(() => {
        obraz.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    klawisz('ArrowLeft');
    klawisz('ArrowLeft');
    klawisz('ArrowLeft');
    expect(czytnik()).toBe('pon. 10:00: 10%');
    klawisz('ArrowRight');
    expect(dymek()).toBe('20%pon. 11:00');
    klawisz('End');
    expect(czytnik()).toBe('pon. 12:00: 30%');
    act(() => obraz.blur());
    expect(dymek()).toBeNull();
  });

  it('prognoza: przerywana linia, punkt końcowy w dymku oznaczony; linia limitu', () => {
    const obraz = zamontuj({ prognoza: [{ t: 7_200_000, v: 30, label: 'teraz' }, { t: 14_400_000, v: 60, label: 'za 2 h' }], limit: 100 });
    expect(el.querySelectorAll('polyline')).toHaveLength(2);
    expect(el.querySelectorAll('polyline')[1]!.getAttribute('stroke-dasharray')).toBe('6 5');
    expect(el.querySelector('line[stroke="var(--crit)"]')).not.toBeNull();
    act(() => obraz.focus());
    expect(dymek()).toBe('60%za 2 h · prognoza');
    expect(czytnik()).toBe('za 2 h: 60% (prognoza)');
  });

  it('słupki: ruch kursora wybiera słupek po szerokości, słupek ≥ 80% limitu w kolorze ostrzeżenia', () => {
    const obraz = zamontuj({ wariant: 'slupki', punkty: [{ v: 10, label: '10:00' }, { v: 90, label: '11:00' }], limit: 100 });
    expect(el.querySelectorAll('rect')[1]!.getAttribute('fill')).toBe('var(--warn)');
    act(() => {
      obraz.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 140 }));
    });
    expect(dymek()).toBe('10%10:00');
  });
});
