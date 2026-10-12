/**
 * @jest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import axe from 'axe-core';
import { Select, type SelectOption } from './select';
import { nazwaDostepna } from '@/a11y/nazwa-dostepna';

/**
 * P-12 (przejście VoiceOverem 12.10): czytnik nie czytał nazwy pola, wybranej wartości ani opcji —
 * na „Nowym zgłoszeniu” słychać było tylko placeholder „— wybierz temat —”. Select ma działać jak
 * wzorzec WAI-ARIA APG „Select-Only Combobox”:
 * https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/
 */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;
Element.prototype.scrollIntoView = jest.fn();

const OPCJE: SelectOption[] = [
  { value: 'hosting', label: 'Hosting' },
  { value: 'domeny', label: 'Domeny' },
  { value: 'faktury', label: 'Faktury', disabled: true },
  { value: 'poczta', label: 'Poczta' },
];

let root: Root;
let kontener: HTMLElement;
let onChange: jest.Mock;

function Etykietowany({ start = '', disabled = false }: { start?: string; disabled?: boolean }) {
  const [v, setV] = useState(start);
  return (
    <div>
      <label htmlFor="temat">Czego dotyczy zgłoszenie?</label>
      <Select
        id="temat"
        value={v}
        onChange={(x) => {
          onChange(x);
          setV(x);
        }}
        options={OPCJE}
        placeholder="— wybierz temat —"
        disabled={disabled}
      />
      <button type="button">Dalej</button>
    </div>
  );
}

function renderuj(el: React.ReactNode) {
  act(() => root.render(el));
  return kontener.querySelector<HTMLElement>('[role="combobox"]')!;
}

beforeEach(() => {
  onChange = jest.fn();
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const klawisz = (el: Element, key: string, opcje: KeyboardEventInit = {}) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opcje }));
  });
const klik = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    (el as HTMLElement).click();
  });
const lista = (combo: HTMLElement) => document.getElementById(combo.getAttribute('aria-controls')!)!;
const opcje = (combo: HTMLElement) => [...lista(combo).querySelectorAll<HTMLElement>('[role="option"]')];
const aktywna = (combo: HTMLElement) => document.getElementById(combo.getAttribute('aria-activedescendant') ?? '')?.textContent;

describe('Select — nazwa i stan (APG select-only combobox)', () => {
  it('combobox ma nazwę z widocznej etykiety <label for>, a nie z placeholdera', () => {
    const combo = renderuj(<Etykietowany />);
    expect(combo.getAttribute('role')).toBe('combobox');
    expect(nazwaDostepna(combo)).toBe('Czego dotyczy zgłoszenie?');
    // Powiązanie programowe, nie kopia tekstu w aria-label: etykieta wskazana przez aria-labelledby.
    const etykieta = kontener.querySelector('label')!;
    expect(combo.getAttribute('aria-labelledby')).toBe(etykieta.id);
    expect(etykieta.id).not.toBe('');
    // Placeholder to wartość, nie nazwa.
    expect(combo.textContent).toContain('— wybierz temat —');
  });

  it('aria-labelledby wskazuje etykietę wprost (bez <label for>)', () => {
    const combo = renderuj(
      <div>
        <span id="lbl-waluta">Waluta wpłaty</span>
        <Select aria-labelledby="lbl-waluta" value="PLN" onChange={onChange} options={[{ value: 'PLN', label: 'PLN' }]} />
      </div>,
    );
    expect(nazwaDostepna(combo)).toBe('Waluta wpłaty');
    klik(combo);
    expect(nazwaDostepna(lista(combo))).toBe('Waluta wpłaty');
  });

  it('aria-label nadal działa, gdy obok nie ma widocznej etykiety', () => {
    const combo = renderuj(<Select aria-label="Typ przekierowania" value="" onChange={onChange} options={OPCJE} />);
    expect(nazwaDostepna(combo)).toBe('Typ przekierowania');
  });

  it('zamknięty: aria-expanded=false, aria-haspopup=listbox, aria-controls wskazuje istniejącą (ukrytą) listę', () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(combo.getAttribute('aria-haspopup')).toBe('listbox');
    expect(lista(combo)?.getAttribute('role')).toBe('listbox');
    expect(lista(combo).hidden).toBe(true);
    expect(combo.hasAttribute('aria-activedescendant')).toBe(false);
    expect(combo.tabIndex).toBe(0);
    expect(combo.textContent).toContain('Domeny');
  });

  it('otwarty: opcje role=option z aria-selected, aria-activedescendant na wybranej, nazwa listy z etykiety', () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    klik(combo);
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    expect(lista(combo).hidden).toBe(false);
    expect(nazwaDostepna(lista(combo))).toBe('Czego dotyczy zgłoszenie?');
    const o = opcje(combo);
    expect(o.map((x) => x.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false', 'false']);
    expect(o[2]!.getAttribute('aria-disabled')).toBe('true');
    expect(aktywna(combo)).toBe('Domeny');
  });

  it('axe bez naruszeń — zamknięty i otwarty', async () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    const reguly = { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] };
    expect((await axe.run(kontener, reguly)).violations.map((v) => v.id)).toEqual([]);
    klik(combo);
    expect((await axe.run(kontener, reguly)).violations.map((v) => v.id)).toEqual([]);
  });

  it('wyłączony: aria-disabled, poza kolejnością Tab, nie otwiera się', () => {
    const combo = renderuj(<Etykietowany disabled />);
    expect(combo.getAttribute('aria-disabled')).toBe('true');
    expect(combo.tabIndex).toBe(-1);
    klik(combo);
    klawisz(combo, 'ArrowDown');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Select — klawiatura i fokus', () => {
  it('↓ otwiera, ↓ przechodzi (pomija wyłączone), Enter wybiera, zamyka i zostawia fokus na polu', () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    combo.focus();
    klawisz(combo, 'ArrowDown');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    expect(aktywna(combo)).toBe('Domeny');
    klawisz(combo, 'ArrowDown');
    expect(aktywna(combo)).toBe('Poczta'); // „Faktury” wyłączone
    klawisz(combo, 'Enter');
    expect(onChange).toHaveBeenCalledWith('poczta');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(combo);
    expect(combo.textContent).toContain('Poczta');
  });

  it('Esc zamyka bez zmiany wartości i fokus wraca na pole', () => {
    const combo = renderuj(<Etykietowany start="hosting" />);
    combo.focus();
    klawisz(combo, 'Enter');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    klawisz(combo, 'ArrowDown');
    klawisz(combo, 'Escape');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(combo);
  });

  it('Spacja i Alt+↓ otwierają; Home/End skaczą na pierwszą/ostatnią; Alt+↑ wybiera i zamyka', () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    combo.focus();
    klawisz(combo, ' ');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    klawisz(combo, 'Escape');
    klawisz(combo, 'ArrowDown', { altKey: true });
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    klawisz(combo, 'End');
    expect(aktywna(combo)).toBe('Poczta');
    klawisz(combo, 'Home');
    expect(aktywna(combo)).toBe('Hosting');
    klawisz(combo, 'ArrowUp', { altKey: true });
    expect(onChange).toHaveBeenCalledWith('hosting');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
  });

  it('Home/End przy zamkniętej liście otwierają ją na pierwszej/ostatniej opcji', () => {
    const combo = renderuj(<Etykietowany start="domeny" />);
    combo.focus();
    klawisz(combo, 'End');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    expect(aktywna(combo)).toBe('Poczta');
  });

  it('wpisanie litery skacze do opcji (także przy zamkniętej liście), powtórzenie litery przechodzi dalej', () => {
    const combo = renderuj(
      <Select
        aria-label="Kraj"
        value=""
        onChange={onChange}
        options={[
          { value: 'pl', label: 'Polska' },
          { value: 'de', label: 'Niemcy' },
          { value: 'pt', label: 'Portugalia' },
        ]}
      />,
    );
    combo.focus();
    klawisz(combo, 'p');
    expect(combo.getAttribute('aria-expanded')).toBe('true');
    expect(aktywna(combo)).toBe('Polska');
    klawisz(combo, 'p');
    expect(aktywna(combo)).toBe('Portugalia');
  });

  it('klik w opcję wybiera ją i oddaje fokus polu; klik w etykietę ustawia fokus na polu', () => {
    const combo = renderuj(<Etykietowany />);
    act(() => kontener.querySelector('label')!.click());
    expect(document.activeElement).toBe(combo);
    klik(combo);
    klik(opcje(combo)[3]!);
    expect(onChange).toHaveBeenCalledWith('poczta');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(combo);
  });

  it('Tab zamyka listę bez wyboru', () => {
    const combo = renderuj(<Etykietowany start="hosting" />);
    combo.focus();
    klawisz(combo, 'ArrowDown');
    klawisz(combo, 'Tab');
    expect(combo.getAttribute('aria-expanded')).toBe('false');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('Select — użycia w panelu', () => {
  /**
   * Strażnik: każde pole wyboru ma nazwę — `id` (z `<label htmlFor>` obok), `aria-labelledby` albo,
   * gdy widocznej etykiety nie ma, `aria-label`. Bez tego czytnik czyta tylko wartość/placeholder.
   */
  it('każde <Select> w panelu klienta ma id, aria-labelledby albo aria-label', () => {
    const { readdirSync, readFileSync, statSync } = jest.requireActual<typeof import('node:fs')>('node:fs');
    const { join } = jest.requireActual<typeof import('node:path')>('node:path');
    const bez: string[] = [];
    const przejdz = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) przejdz(p);
        else if (n.endsWith('.tsx') && !n.includes('.spec.')) {
          const kod = readFileSync(p, 'utf8');
          for (const m of kod.matchAll(/<(?:Select|PanelSelect)\b([\s\S]*?)\/>/g)) {
            if (!/\bid=|aria-labelledby=|aria-label=/.test(m[1]!)) bez.push(`${p.split('/src/')[1]}:${kod.slice(0, m.index).split('\n').length}`);
          }
        }
      }
    };
    przejdz(join(__dirname, '..', '..'));
    expect(bez).toEqual([]);
  });
});
