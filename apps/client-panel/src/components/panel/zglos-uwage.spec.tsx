/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const createTicket = jest.fn();
jest.mock('@/app/dashboard/support/actions', () => ({
  createTicket: (...a: unknown[]) => createTicket(...a),
}));
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/services/3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f',
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { ZglosUwage } from './zglos-uwage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const WLACZONA = { 'beta.zglos-uwage': true };
const USLUGA = { id: '3f2b8c1e-9a4d-4c6b-8e2f-1a2b3c4d5e6f', nazwa: 'Hosting Start · sklep.pl' };

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  createTicket.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const render = (props: Parameters<typeof ZglosUwage>[0]) => act(() => root.render(<ZglosUwage {...props} />));
const przycisk = () => el.querySelector<HTMLButtonElement>('[data-zglos-uwage]');
const button = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === tekst)!;

/** Pole kontrolowane przez Reacta — wartość przez setter prototypu, inaczej onChange nie zobaczy zmiany. */
function wpisz(tekst: string) {
  const pole = el.querySelector('textarea')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function wyslij() {
  await act(async () => {
    el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('ZglosUwage — widoczność (flaga beta.zglos-uwage, domyślnie wyłączona)', () => {
  it('brak flagi albo flaga wyłączona → przycisku nie ma', () => {
    render({ flagi: {}, mozeZglaszac: true });
    expect(przycisk()).toBeNull();
    render({ flagi: { 'beta.zglos-uwage': false }, mozeZglaszac: true });
    expect(przycisk()).toBeNull();
  });

  it('flaga włączona → przycisk „Zgłoś uwagę”', () => {
    render({ flagi: WLACZONA, mozeZglaszac: true });
    expect(przycisk()?.textContent).toBe('Zgłoś uwagę');
  });

  it('subkonto bez prawa do zgłoszeń → przycisku nie ma mimo flagi', () => {
    render({ flagi: WLACZONA, mozeZglaszac: false });
    expect(przycisk()).toBeNull();
  });
});

describe('ZglosUwage — formularz', () => {
  it('mniej niż 10 znaków → komunikat, bez wysyłki', async () => {
    render({ flagi: WLACZONA, mozeZglaszac: true });
    act(() => przycisk()!.click());
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    wpisz('za krótko');
    await wyslij();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Napisz co najmniej 10 znaków (brakuje 1).');
    expect(createTicket).not.toHaveBeenCalled();
  });

  it('wysyłka: zgłoszenie BETA z usługą i blokiem kontekstu → podziękowanie z linkiem do zgłoszenia', async () => {
    createTicket.mockResolvedValue({ success: true, data: { id: 'ab12cd34-0000-4000-8000-000000000000' } });
    render({ flagi: WLACZONA, mozeZglaszac: true, usluga: USLUGA });
    act(() => przycisk()!.click());
    act(() => button('Pomysł').click());
    wpisz('Brakuje sortowania listy domen');
    await wyslij();
    expect(createTicket).toHaveBeenCalledTimes(1);
    const [temat, tresc, extra] = createTicket.mock.calls[0] as [string, string, unknown];
    expect(temat).toBe('Uwaga z bety: Brakuje sortowania listy domen');
    expect(tresc).toContain('Brakuje sortowania listy domen\n\n---\nKontekst (dodany automatycznie):');
    expect(tresc).toContain(`• Strona: /dashboard/services/${USLUGA.id}`);
    expect(tresc).toContain('• Rodzaj: pomysł');
    expect(tresc).toContain('• Usługa: Hosting Start · sklep.pl');
    expect(tresc).toMatch(/• Szerokość okna: \d+ px/);
    expect(extra).toEqual({ topic: 'BETA', subscriptionId: USLUGA.id });
    const status = el.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Dziękujemy — zgłoszenie #ab12cd34 utworzone');
    expect(status.querySelector('a')?.getAttribute('href')).toBe('/dashboard/support/ab12cd34-0000-4000-8000-000000000000');
  });

  it('błąd API → komunikat z API, formularz zostaje', async () => {
    createTicket.mockResolvedValue({ error: 'Brak uprawnień' });
    render({ flagi: WLACZONA, mozeZglaszac: true });
    act(() => przycisk()!.click());
    wpisz('Coś poszło nie tak przy zapisie');
    await wyslij();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Brak uprawnień');
    expect(el.querySelector('textarea')).not.toBeNull();
    expect((createTicket.mock.calls[0] as unknown[])[2]).toEqual({ topic: 'BETA' });
  });
});
