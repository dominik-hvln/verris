/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const createTicketWithFiles = jest.fn();
jest.mock('@/app/dashboard/support/actions', () => ({
  createTicketWithFiles: (...a: unknown[]) => createTicketWithFiles(...a),
}));
const zrobZrzutStrony = jest.fn();
jest.mock('@/lib/zrzut-strony', () => ({
  ATRYBUT_POMIN: 'data-zglos-uwage-ui',
  zrobZrzutStrony: (...a: unknown[]) => zrobZrzutStrony(...a),
}));
const ZRZUT = new File(['jpeg'], 'zrzut-ekranu.jpg', { type: 'image/jpeg' });
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
  createTicketWithFiles.mockReset();
  zrobZrzutStrony.mockReset().mockResolvedValue(ZRZUT);
  window.localStorage.clear();
  Object.assign(URL, { createObjectURL: jest.fn(() => 'blob:podglad'), revokeObjectURL: jest.fn() });
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

describe('ZglosUwage — widoczność (tester albo flaga beta.zglos-uwage)', () => {
  it('ani tester, ani flaga → przycisku nie ma', () => {
    render({ flagi: {}, mozeZglaszac: true });
    expect(przycisk()).toBeNull();
    render({ flagi: { 'beta.zglos-uwage': false }, mozeZglaszac: true, tester: false });
    expect(przycisk()).toBeNull();
  });

  it('flaga włączona → przycisk „Zgłoś uwagę”', () => {
    render({ flagi: WLACZONA, mozeZglaszac: true });
    expect(przycisk()?.textContent).toBe('Zgłoś uwagę');
  });

  it('tester (kod z zaproszenia) widzi przycisk bez flagi', () => {
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    expect(przycisk()?.textContent).toBe('Zgłoś uwagę');
  });

  it('subkonto bez prawa do zgłoszeń → przycisku nie ma mimo flagi i bety', () => {
    render({ flagi: WLACZONA, mozeZglaszac: false, tester: true });
    expect(przycisk()).toBeNull();
  });

  it('da się schować do zakładki przy krawędzi i pokazać z powrotem; wybór zostaje w przeglądarce', () => {
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    act(() => el.querySelector<HTMLButtonElement>('[data-schowaj-uwage]')!.click());
    expect(przycisk()).toBeNull();
    expect(el.querySelector('[data-pokaz-uwage]')).not.toBeNull();
    expect(window.localStorage.getItem('verris.zglos-uwage.schowany')).toBe('1');
    act(() => el.querySelector<HTMLButtonElement>('[data-pokaz-uwage]')!.click());
    expect(przycisk()).not.toBeNull();
    expect(window.localStorage.getItem('verris.zglos-uwage.schowany')).toBeNull();
  });

  it('przycisk i okno nie trafiają na zrzut (atrybut pomijania)', () => {
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    expect(przycisk()!.closest('[data-zglos-uwage-ui]')).not.toBeNull();
  });
});

describe('ZglosUwage — formularz', () => {
  async function otworz() {
    await act(async () => przycisk()!.click());
  }
  const wyslane = () => createTicketWithFiles.mock.calls[0]![0] as FormData;

  it('mniej niż 10 znaków → komunikat, bez wysyłki', async () => {
    render({ flagi: WLACZONA, mozeZglaszac: true });
    await otworz();
    expect(el.querySelector('[role="dialog"]')).not.toBeNull();
    wpisz('za krótko');
    await wyslij();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Napisz co najmniej 10 znaków (brakuje 1).');
    expect(createTicketWithFiles).not.toHaveBeenCalled();
  });

  it('wysyłka: zgłoszenie BETA z usługą, blokiem kontekstu i zrzutem ekranu → podziękowanie z linkiem', async () => {
    createTicketWithFiles.mockResolvedValue({ success: true, data: { id: 'ab12cd34-0000-4000-8000-000000000000' } });
    render({ flagi: WLACZONA, mozeZglaszac: true, usluga: USLUGA });
    await otworz();
    expect(zrobZrzutStrony).toHaveBeenCalledWith(null);
    expect(el.querySelector('img[alt="Podgląd zrzutu ekranu"]')?.getAttribute('src')).toBe('blob:podglad');
    act(() => button('Pomysł').click());
    wpisz('Brakuje sortowania listy domen');
    await wyslij();
    expect(createTicketWithFiles).toHaveBeenCalledTimes(1);
    const fd = wyslane();
    expect(fd.get('subject')).toBe('Uwaga z bety: Brakuje sortowania listy domen');
    const tresc = fd.get('message') as string;
    expect(tresc).toContain('Brakuje sortowania listy domen\n\n---\nKontekst (dodany automatycznie):');
    expect(tresc).toContain(`• Strona: /dashboard/services/${USLUGA.id}`);
    expect(tresc).toContain('• Rodzaj: pomysł');
    expect(tresc).toContain('• Usługa: Hosting Start · sklep.pl');
    expect(tresc).toMatch(/• Szerokość okna: \d+ px/);
    expect(tresc).toContain('• Zrzut ekranu: w załączniku');
    expect(fd.get('topic')).toBe('BETA');
    expect(fd.get('subscriptionId')).toBe(USLUGA.id);
    expect((fd.getAll('files') as File[]).map((f) => f.name)).toEqual(['zrzut-ekranu.jpg']);
    const status = el.querySelector('[role="status"]')!;
    expect(status.textContent).toContain('Dziękujemy — zgłoszenie #ab12cd34 utworzone');
    expect(status.querySelector('a')?.getAttribute('href')).toBe('/dashboard/support/ab12cd34-0000-4000-8000-000000000000');
  });

  it('odznaczony zrzut → zgłoszenie bez pliku i bez wzmianki o zrzucie', async () => {
    createTicketWithFiles.mockResolvedValue({ success: true, data: { id: 'ab12cd34-0000-4000-8000-000000000000' } });
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    await otworz();
    act(() => el.querySelector<HTMLInputElement>('[data-zrzut-ekranu] input')!.click());
    wpisz('Literówka w nagłówku strony');
    await wyslij();
    const fd = wyslane();
    expect(fd.getAll('files')).toEqual([]);
    expect(fd.get('message')).not.toContain('Zrzut ekranu');
    expect(fd.get('subscriptionId')).toBeNull();
  });

  it('zrzut nie wyszedł → zgłoszenie idzie bez niego, z propozycją ponowienia', async () => {
    zrobZrzutStrony.mockResolvedValue(null);
    createTicketWithFiles.mockResolvedValue({ success: true, data: { id: 'ab12cd34-0000-4000-8000-000000000000' } });
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    await otworz();
    expect(el.textContent).toContain('Nie udało się zrobić zrzutu w tej przeglądarce.');
    wpisz('Strona ładuje się bardzo długo');
    await wyslij();
    expect(wyslane().getAll('files')).toEqual([]);
  });

  it('wskazanie miejsca: klik w element strony go nie uruchamia, opis i ramka trafiają do zgłoszenia i na zrzut', async () => {
    createTicketWithFiles.mockResolvedValue({ success: true, data: { id: 'ab12cd34-0000-4000-8000-000000000000' } });
    const strona = document.createElement('section');
    strona.innerHTML = '<h2>Kopie zapasowe</h2><div><button type="button" id="zapisz-kopie"><svg></svg>Zapisz kopię</button></div>';
    const akcja = jest.fn();
    strona.querySelector('button')!.addEventListener('click', akcja);
    document.body.appendChild(strona);

    render({ flagi: {}, mozeZglaszac: true, tester: true });
    await otworz();
    wpisz('Przycisk nic nie robi po kliknięciu');
    act(() => button('Wskaż miejsce na stronie').click());
    // okno formularza schowane, belka z instrukcją widoczna
    expect(el.querySelector('[role="dialog"]')!.closest('.hidden')).not.toBeNull();
    expect(el.textContent).toContain('Kliknij miejsce na stronie, którego dotyczy uwaga.');

    await act(async () => {
      strona.querySelector('svg')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(akcja).not.toHaveBeenCalled();
    expect(el.querySelector('[role="dialog"]')!.closest('.hidden')).toBeNull();
    expect(el.querySelector('[data-wskazany-element]')?.textContent).toContain('przycisk „Zapisz kopię” · Kopie zapasowe');
    expect(zrobZrzutStrony).toHaveBeenLastCalledWith({ x: 0, y: 0, szer: 0, wys: 0 });

    await wyslij();
    const tresc = wyslane().get('message') as string;
    expect(tresc).toContain('• Wskazany element: przycisk „Zapisz kopię” (sekcja „Kopie zapasowe”)');
    expect(tresc).toContain('• Selektor: button#zapisz-kopie');
    expect(tresc).toContain('• Zrzut ekranu: w załączniku (element zaznaczony ramką)');
  });

  it('Esc w trybie wskazywania wraca do formularza (nie zamyka go) i nic nie wybiera', async () => {
    render({ flagi: {}, mozeZglaszac: true, tester: true });
    await otworz();
    wpisz('Coś jest nie tak z menu');
    act(() => button('Wskaż miejsce na stronie').click());
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    const okno = el.querySelector('[role="dialog"]');
    expect(okno).not.toBeNull();
    expect(okno!.closest('.hidden')).toBeNull();
    expect(el.querySelector('textarea')!.value).toBe('Coś jest nie tak z menu');
    expect(el.querySelector('[data-wskazany-element]')).toBeNull();
  });

  it('błąd API → komunikat z API, formularz zostaje', async () => {
    createTicketWithFiles.mockResolvedValue({ error: 'Brak uprawnień' });
    render({ flagi: WLACZONA, mozeZglaszac: true });
    await otworz();
    wpisz('Coś poszło nie tak przy zapisie');
    await wyslij();
    expect(el.querySelector('[role="alert"]')?.textContent).toBe('Brak uprawnień');
    expect(el.querySelector('textarea')).not.toBeNull();
    expect(wyslane().get('topic')).toBe('BETA');
  });
});
