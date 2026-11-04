/**
 * @jest-environment jsdom
 */
import { act, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { useSzufladaMenu } from './szuflada-menu';
import { WalletBadge } from '@/app/dashboard/wallet-badge';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** Ekran węższy niż lg (telefon albo laptop przy powiększeniu ≥150%) — matchMedia w jsdom nie istnieje. */
function ustawEkran(waski: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (q: string) => ({ matches: waski, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function Panel() {
  const [open, setOpen] = useState(false);
  const szuflada = useRef<HTMLElement | null>(null);
  const przycisk = useRef<HTMLButtonElement | null>(null);
  const { atrybutySzuflady, atrybutyPrzycisku } = useSzufladaMenu(open, () => setOpen(false), szuflada, przycisk);
  return (
    <>
      <button ref={przycisk} type="button" onClick={() => setOpen(true)} aria-label="Otwórz menu" {...atrybutyPrzycisku}>
        ☰
      </button>
      <aside ref={szuflada} {...atrybutySzuflady}>
        <a href="#pulpit">Pulpit</a>
        <a href="#platnosci">Płatności</a>
      </aside>
      <main>
        <a href="#nowa-usluga">Nowa usługa</a>
      </main>
    </>
  );
}

let root: Root;
let kontener: HTMLElement;
function wyrenderuj() {
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
  act(() => root.render(<Panel />));
}
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const klawisz = (key: string, shiftKey = false) => {
  const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
  act(() => {
    (document.activeElement ?? document.body).dispatchEvent(e);
  });
  return e;
};

/**
 * A3-3 — na starym layoucie zamknięta szuflada (tylko `-translate-x-full`) łapała fokus 9 niewidocznymi linkami,
 * a po otwarciu fokus zostawał na ☰ i Tab szedł w treść pod przyciemnieniem; ☰ bez `aria-expanded`.
 */
describe('szuflada menu panelu (A3-3)', () => {
  it('wąski ekran: zamknięta szuflada jest inert, ☰ ma aria-expanded i aria-controls', () => {
    ustawEkran(true);
    wyrenderuj();
    const aside = kontener.querySelector('aside')!;
    const przycisk = kontener.querySelector('button')!;
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(przycisk.getAttribute('aria-expanded')).toBe('false');
    expect(przycisk.getAttribute('aria-controls')).toBe(aside.id);
  });

  it('po otwarciu fokus w szufladzie, Tab z ostatniego wraca na pierwszy, Esc zamyka i wraca na ☰', () => {
    ustawEkran(true);
    wyrenderuj();
    const przycisk = kontener.querySelector('button')!;
    przycisk.focus();
    act(() => przycisk.click());
    const aside = kontener.querySelector('aside')!;
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(aside.getAttribute('aria-modal')).toBe('true');
    expect(przycisk.getAttribute('aria-expanded')).toBe('true');
    const [pierwszy, ostatni] = [...aside.querySelectorAll('a')];
    expect(document.activeElement).toBe(pierwszy);
    ostatni.focus();
    expect(klawisz('Tab').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(pierwszy);
    klawisz('Escape');
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(document.activeElement).toBe(przycisk);
  });

  it('szeroki ekran: menu stałe — bez inert i bez roli okna', () => {
    ustawEkran(false);
    wyrenderuj();
    const aside = kontener.querySelector('aside')!;
    expect(aside.hasAttribute('inert')).toBe(false);
    expect(aside.getAttribute('role')).toBeNull();
  });
});

/** A3-11 — czytnik czytał „Portfel: Twoje saldo w kredytach Verris…” bez kwoty (aria-label zastępował treść). */
describe('saldo w nagłówku (A3-11)', () => {
  it('nazwa linku zaczyna się od widocznego „Portfel” i zawiera kwotę', () => {
    const html = renderToStaticMarkup(<WalletBadge balance="150.00" />);
    const etykieta = /aria-label="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(etykieta.startsWith('Portfel ')).toBe(true);
    expect(etykieta).toMatch(/150,00/);
  });
});
