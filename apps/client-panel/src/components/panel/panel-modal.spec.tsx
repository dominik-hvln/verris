/**
 * @jest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';
import { PanelModal } from './panel-modal';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

function Strona() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Zrezygnuj z usługi
      </button>
      <PanelModal open={open} onClose={() => setOpen(false)} title="Zrezygnować z usługi?" description="Hosting zostanie zawieszony.">
        <button type="button">Anuluj</button>
        <button type="button">Zrezygnuj</button>
      </PanelModal>
    </>
  );
}

let root: Root;
let kontener: HTMLElement;
beforeEach(() => {
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
  act(() => root.render(<Strona />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const tab = (el: Element, shiftKey = false) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
  });

function otworz() {
  const przycisk = kontener.querySelector('button')!;
  przycisk.focus();
  act(() => przycisk.click());
  return { przycisk, okno: kontener.querySelector<HTMLElement>('[role="dialog"]')! };
}

describe('PanelModal (P-12)', () => {
  it('fokus wchodzi do okna, axe bez naruszeń', async () => {
    const { okno } = otworz();
    expect(okno.contains(document.activeElement)).toBe(true);
    expect(okno.getAttribute('aria-labelledby')).not.toBe('panel-modal-title');
    const wynik = await axe.run(okno, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] });
    expect(wynik.violations.map((v) => v.id)).toEqual([]);
  });

  it('Tab i Shift+Tab krążą w oknie, także zaraz po otwarciu', () => {
    const { okno } = otworz();
    const [anuluj, zrezygnuj] = [...okno.querySelectorAll('button')];
    tab(okno, true);
    expect(document.activeElement).toBe(zrezygnuj);
    tab(zrezygnuj);
    expect(document.activeElement).toBe(anuluj);
    tab(anuluj, true);
    expect(document.activeElement).toBe(zrezygnuj);
  });

  it('Esc zamyka i oddaje fokus przyciskowi, który otworzył okno', () => {
    const { przycisk } = otworz();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(kontener.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(przycisk);
  });
});
