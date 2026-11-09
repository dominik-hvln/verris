/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { StanPrzejsciaCms, WidokCms } from './typy';

/**
 * Paczka 124 – sekcja „Przejdź na CMS”: karta celu z API, instalacja podglądu z danymi logowania pokazanymi raz,
 * odpytywanie stanu zadania, zamiana z potwierdzeniem, cofnięcie w okresie kopii.
 */
const stanCms = jest.fn();
const zainstalujPodgladWordpress = jest.fn();
const zamienNaWordpress = jest.fn();
const cofnijWordpress = jest.fn();
jest.mock('./akcje', () => ({
  stanCms: (...a: unknown[]) => stanCms(...a),
  zainstalujPodgladWordpress: (...a: unknown[]) => zainstalujPodgladWordpress(...a),
  zamienNaWordpress: (...a: unknown[]) => zamienNaWordpress(...a),
  cofnijWordpress: (...a: unknown[]) => cofnijWordpress(...a),
}));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: jest.fn(async () => true) }));

import { potwierdz } from '@/components/panel/potwierdz';
import { ODSTEP_ODPYTYWANIA_MS, PrzejscieNaCms } from './przejscie-na-cms';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ID = '11111111-1111-4111-8111-111111111111';
const CEL = {
  id: 'wordpress',
  nazwa: 'WordPress',
  opis: 'Strona przechodzi na WordPressa.',
  kiedyWarto: ['chcesz sklep internetowy na WooCommerce'],
  coSieZmienia: ['kreator przestaje publikować na tę domenę'],
};
const widok = (o: Partial<WidokCms>): WidokCms => ({
  cel: 'wordpress', stan: 'PODGLAD', domena: 'x.pl', adresPodgladu: null, adresPanelu: null, adminLogin: 'admin_abc123', blad: null, bladEtap: null,
  podgladAt: null, przeniesionaAt: null, cofnietaAt: null, cofnijDo: null, kopia: null, kopiaWp: null, ...o,
});
const stan = (wordpress: WidokCms | null, o: Partial<StanPrzejsciaCms> = {}): { ok: true; dane: StanPrzejsciaCms } => ({
  ok: true,
  dane: { cele: [CEL], dostepny: true, domena: 'x.pl', wordpress, ...o },
});

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  jest.useRealTimers();
});

const przycisk = (tekst: RegExp) => [...el.querySelectorAll('button')].find((b) => tekst.test(b.textContent ?? ''));
async function pokaz() {
  await act(async () => root.render(<PrzejscieNaCms id={ID} />));
}

describe('Przejdź na CMS', () => {
  it('karta celu z API (kiedy warto, co się zmienia); bez tras w API (404) sekcja znika', async () => {
    stanCms.mockResolvedValue(stan(null));
    await pokaz();
    expect(el.textContent).toContain('Przejdź na CMS');
    expect(el.textContent).toContain('WordPress');
    expect(el.textContent).toContain('WooCommerce');
    expect(el.textContent).toContain('kreator przestaje publikować');
    expect(przycisk(/Zainstaluj podgląd: WordPress/)).toBeDefined();

    act(() => root.unmount());
    root = createRoot(el);
    stanCms.mockResolvedValue({ ok: false, blad: 'Nie znaleziono', status: 404 });
    await pokaz();
    expect(el.textContent).toBe('');
  });

  it('niedostępne (np. strona nieopublikowana) – powód zamiast przycisku', async () => {
    stanCms.mockResolvedValue(stan(null, { dostepny: false, powod: 'Najpierw opublikuj stronę na swojej domenie.' }));
    await pokaz();
    expect(el.textContent).toContain('Najpierw opublikuj stronę');
    expect(przycisk(/Zainstaluj podgląd/)).toBeUndefined();
  });

  it('instalacja: dane logowania raz, postęp i odpytywanie aż do gotowego podglądu; zamiana z potwierdzeniem', async () => {
    stanCms.mockResolvedValueOnce(stan(null));
    zainstalujPodgladWordpress.mockResolvedValue({
      ok: true,
      dane: { ...widok({ stan: 'PODGLAD_W_TOKU' }), adminHaslo: 'TajneHaslo123', ostrzezenia: ['W WordPressie bez efektu: karuzele.'], uwaga: 'Zapisz hasło administratora WordPressa – nie pokażemy go ponownie.' },
    });
    await pokaz();
    await act(async () => przycisk(/Zainstaluj podgląd/)!.click());
    expect(zainstalujPodgladWordpress).toHaveBeenCalledWith(ID, 'x.pl');
    expect(el.textContent).toContain('TajneHaslo123');
    expect(el.textContent).toContain('admin_abc123');
    expect(el.textContent).toContain('Instalujemy WordPressa');
    expect(el.textContent).toContain('bez efektu: karuzele');

    stanCms.mockResolvedValue(stan(widok({ stan: 'PODGLAD', adresPodgladu: 'https://x.pl/.verris-wp-podglad/abc/', adresPanelu: 'https://x.pl/.verris-wp-podglad/abc/wp-admin/' })));
    await act(async () => {
      jest.advanceTimersByTime(ODSTEP_ODPYTYWANIA_MS);
    });
    expect(stanCms).toHaveBeenCalledTimes(2);
    expect(el.textContent).toContain('Podgląd WordPressa jest gotowy');
    expect(el.querySelector('a[href="https://x.pl/.verris-wp-podglad/abc/"]')).not.toBeNull();

    zamienNaWordpress.mockResolvedValue({ ok: true, dane: widok({ stan: 'ZAMIANA_W_TOKU' }) });
    await act(async () => przycisk(/Zamień stronę na WordPressa/)!.click());
    expect(potwierdz).toHaveBeenCalledWith(expect.stringMatching(/Kreator przestanie publikować/), expect.objectContaining({ niebezpieczne: true }));
    expect(zamienNaWordpress).toHaveBeenCalledWith(ID, 'x.pl');
    expect(el.textContent).toContain('Zamieniamy stronę na WordPressa');
  });

  it('zamiana bez potwierdzenia – nic się nie dzieje', async () => {
    stanCms.mockResolvedValue(stan(widok({ stan: 'PODGLAD', adresPodgladu: 'https://x.pl/.verris-wp-podglad/abc/' })));
    (potwierdz as jest.Mock).mockResolvedValueOnce(false);
    await pokaz();
    await act(async () => przycisk(/Zamień stronę na WordPressa/)!.click());
    expect(zamienNaWordpress).not.toHaveBeenCalled();
  });

  it('po zamianie: adres i panel, cofnięcie tylko w okresie kopii; błąd z API widoczny', async () => {
    stanCms.mockResolvedValue(stan(widok({ stan: 'PRZENIESIONA', adresPanelu: 'https://x.pl/wp-admin/', kopia: '.verris-kopia-20261109-1130', cofnijDo: '2026-12-09T10:00:00.000Z' })));
    cofnijWordpress.mockResolvedValue({ ok: false, blad: 'Kopii strony z kreatora nie ma już na koncie.', status: 409 });
    await pokaz();
    expect(el.textContent).toContain('Strona działa w WordPressie');
    expect(el.textContent).toContain('.verris-kopia-20261109-1130');
    await act(async () => przycisk(/Cofnij/)!.click());
    expect(cofnijWordpress).toHaveBeenCalledWith(ID);
    expect(el.textContent).toContain('Kopii strony z kreatora nie ma już na koncie.');

    act(() => root.unmount());
    root = createRoot(el);
    stanCms.mockResolvedValue(stan(widok({ stan: 'PRZENIESIONA', cofnijDo: null })));
    await pokaz();
    expect(przycisk(/Cofnij/)).toBeUndefined();
  });
});
