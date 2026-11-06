/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PlanDto } from '@verris/contracts/klient';

/**
 * Paczka 109 — znaleziska z testów bety (3.11.2026) w zamówieniu usługi i decyzje Dominika 6 i 7.
 * Krok domeny jest prawdziwy (bez atrapy) — sprawdzamy też walidację domeny i podpowiedź o domenie u rejestratora.
 */
const mockParams = { value: new URLSearchParams() };
const mockPush = jest.fn();
const mockCreate = jest.fn();
jest.mock('@/lib/client-features', () => ({ clientFeatures: { emailMarketing: false } }));
jest.mock('@/lib/feature-flags-action', () => ({ pobierzFlagiAction: async () => ({}) }));
jest.mock('next/navigation', () => ({
  useSearchParams: () => mockParams.value,
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));
jest.mock('next/link', () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock('./actions', () => ({
  createSubscriptionAction: (...a: unknown[]) => mockCreate(...a),
  getTrialEligibilityAction: async () => ({ eligible: true }),
}));
jest.mock('./promo-actions', () => ({ previewSubscriptionPromoAction: jest.fn() }));
jest.mock('./trial-callout', () => ({ TrialCallout: () => null }));
jest.mock('@/app/dashboard/domains/actions', () => ({
  abonentZProfiluAction: jest.fn(),
  registerDomainClientAction: jest.fn(),
  searchDomainsAction: jest.fn(),
}));
jest.mock('@/app/dashboard/domains/components/registrant-fields', () => ({
  RegistrantFields: () => null,
  PUSTY_ABONENT: {},
  brakiAbonenta: () => [],
}));
jest.mock('@/lib/analytics-events', () => ({ trackBeginCheckout: jest.fn(), trackPurchase: jest.fn() }));

import { OrderFlow } from './order-flow';
import type { TrialOffer } from '../data';
import { FeatureFlagsProvider } from '@/lib/feature-flags';
import { sprawdzDomene } from './domena';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom nie przewija — kafelek „Rok z góry” przewija do formularza.
Element.prototype.scrollIntoView = jest.fn();

const plan = (over: Partial<PlanDto>): PlanDto => ({
  id: 'p', slug: 'p', name: 'P', description: null, cpuLimit: 1, ramLimitMb: 1, diskLimitMb: 1, ioLimitKbps: 1, iopsLimit: 1,
  entryProcesses: 1, nprocLimit: 17, includedTransferGb: null, priceMonthly: '45.00', priceYearly: '449.00', currency: 'PLN',
  isPublic: true, isActive: true, sortOrder: 1, trialDays: 0, productKind: 'HOSTING', supportSlaHours: 0, ...over,
});
const HOSTING = plan({ id: 'h1', slug: 'verris-hosting', name: 'Hosting Verris', cpuLimit: 200, ramLimitMb: 8192, diskLimitMb: 51200 });
const POCZTA = plan({ id: 'e1', slug: 'poczta-standard', name: 'Poczta Verris', productKind: 'EMAIL', cpuLimit: 100, ramLimitMb: 512, diskLimitMb: 10240, priceMonthly: '9.99', priceYearly: '99.99' });
const OFERTA: TrialOffer = { freeEnabled: false, cardEnabled: true, annualAutoscalingCredit: 60, monthlyAutoscalingCredit: 10, autoscalingCreditValidityMonths: 12 };

let root: Root;
let el: HTMLDivElement;
async function pokaz(query: string, offer: TrialOffer = OFERTA, plans: PlanDto[] = [HOSTING, POCZTA]) {
  mockParams.value = new URLSearchParams(query);
  await act(async () =>
    root.render(
      <FeatureFlagsProvider>
        <OrderFlow plans={plans} offer={offer} />
      </FeatureFlagsProvider>,
    ),
  );
  return el.textContent ?? '';
}
const przycisk = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst)) as HTMLButtonElement;
/** Kafelek okresu w formularzu (tekst dokładnie równy etykiecie — kafelek nad formularzem ma dłuższy opis). */
const okresBtn = (tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === tekst) as HTMLButtonElement;
const doZaplaty = () => el.textContent?.match(/Do zapłaty teraz(?:[\d\s ,]+zł)?([\d\s ,]+)zł brutto/)?.[1]?.replace(/\s| /g, '');
async function wpiszDomene(v: string) {
  const input = el.querySelector('#domena-wlasna') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function zaznaczZgody() {
  for (const i of [...el.querySelectorAll('input')].filter((x) => x.type === 'checkbox')) {
    if (!i.checked) await act(async () => void i.click());
  }
}

beforeEach(() => {
  mockPush.mockReset();
  mockCreate.mockReset();
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => act(() => root.unmount()));

// P2-02: kafelek „Rok z góry” zmieniał tylko adres — formularz zostawał na miesiącu i klient płacił za miesiąc.
it('P2-02: kafelek „Rok z góry” przestawia okres w formularzu i kwotę do zapłaty (i odwrotnie)', async () => {
  await pokaz('type=hosting');
  // Decyzja 6.11.2026 — bez rabatu na start: do zapłaty cena z cennika.
  expect(doZaplaty()).toBe('45,00');
  await act(async () => przycisk('Rok z góry').click());
  expect(okresBtn('Rocznie (taniej)').getAttribute('aria-pressed')).toBe('true');
  expect(przycisk('Rok z góry').getAttribute('aria-pressed')).toBe('true');
  expect(doZaplaty()).toBe('449,00');
  // Wybór w formularzu też przestawia kafelek nad nim.
  await act(async () => okresBtn('Miesięcznie').click());
  expect(doZaplaty()).toBe('45,00');
  expect(przycisk('Rok z góry').getAttribute('aria-pressed')).toBe('false');
  expect(mockPush).not.toHaveBeenCalled();
});

// A3-1: czytnik ekranu nie wiedział, który plan, okres i sposób płatności jest wybrany.
it('A3-1: przyciski wyboru planu, okresu, płatności i trybu domeny mają aria-pressed', async () => {
  await pokaz('type=hosting');
  expect(przycisk('Hosting Verris').getAttribute('aria-pressed')).toBe('true');
  expect(okresBtn('Miesięcznie').getAttribute('aria-pressed')).toBe('true');
  expect(okresBtn('Rocznie (taniej)').getAttribute('aria-pressed')).toBe('false');
  expect(przycisk('Z portfela').getAttribute('aria-pressed')).toBe('true');
  expect(przycisk('Karta płatnicza').getAttribute('aria-pressed')).toBe('false');
  expect(przycisk('Mam własną domenę').getAttribute('aria-pressed')).toBe('true');
});

// A3-2: „Zamów i opłać” był wyłączony bez słowa i znikał z kolejności Tab.
it('A3-2: przycisk zamówienia osiągalny, mówi, czego brakuje, i nie wysyła niepełnego zamówienia', async () => {
  await pokaz('type=hosting');
  const zamow = przycisk('Zamów i opłać');
  expect(zamow.disabled).toBe(false);
  expect(zamow.getAttribute('aria-disabled')).toBe('true');
  const braki = el.querySelector('#braki-zamowienia')!;
  expect(zamow.getAttribute('aria-describedby')).toBe('braki-zamowienia');
  expect(braki.textContent).toContain('wpisz domenę');
  expect(braki.textContent).toContain('zaakceptuj Regulamin');
  await act(async () => zamow.click());
  expect(mockCreate).not.toHaveBeenCalled();
  expect(braki.getAttribute('role')).toBe('alert');
  expect(document.activeElement?.id).toBe('domena-wlasna');
});

// Decyzja 6 (P2-01): domyślnie bez limitu, z opcją „Ustaw własny limit”; limit idzie do API przy zamówieniu.
it('decyzja 6: autoskalowanie bez limitu domyślnie, własny limit trafia do zamówienia', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 's1' } } });
  await pokaz('type=hosting');
  await wpiszDomene('kawa-marka.pl');
  await zaznaczZgody();
  await act(async () => el.querySelector<HTMLButtonElement>('[role="switch"][aria-checked="false"]')!.click());
  expect(przycisk('Bez limitu').getAttribute('aria-pressed')).toBe('true');
  expect(el.textContent).toContain('płacisz za to, czego strona faktycznie użyje');
  expect(el.textContent).not.toMatch(/nie zaskoczy/);

  await act(async () => przycisk('Ustaw własny limit').click());
  expect(el.querySelector('#braki-zamowienia')?.textContent).toContain('limit kosztu');
  const pole = el.querySelector('#limit-autoskalowania') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(pole, '30');
    pole.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(el.textContent).toContain('Twój limit: 30,00');
  await act(async () => przycisk('Zamów i opłać').click());
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ autoscalingEnabled: true, autoscalingMaxCost: 30 }));
});

it('decyzja 6: przy „Bez limitu” zamówienie nie wysyła limitu', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 's1' } } });
  await pokaz('type=hosting');
  await wpiszDomene('kawa-marka.pl');
  await zaznaczZgody();
  await act(async () => el.querySelector<HTMLButtonElement>('[role="switch"][aria-checked="false"]')!.click());
  await act(async () => przycisk('Zamów i opłać').click());
  const wyslane = mockCreate.mock.calls[0][0];
  expect(wyslane.autoscalingEnabled).toBe(true);
  expect(wyslane).not.toHaveProperty('autoscalingMaxCost');
});

// Decyzja 7 (P1-03 / P4-9): Tryb EKO domyślnie wyłączony, ostrzeżenie po włączeniu.
it('decyzja 7 i P1-15: Tryb EKO domyślnie wyłączony, po włączeniu ostrzeżenie; przełączniki podpisane', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 's1' } } });
  await pokaz('type=hosting');
  expect(el.textContent).not.toContain('ECO Mode');
  const eko = [...el.querySelectorAll<HTMLButtonElement>('[role="switch"]')].find((b) => b.textContent?.includes('Tryb EKO'))!;
  expect(eko.getAttribute('aria-checked')).toBe('false');
  expect(eko.textContent).toContain('Wyłączone');
  expect(el.textContent).not.toContain('raz w tygodniu zamiast codziennie');
  await act(async () => eko.click());
  expect(eko.textContent).toContain('Włączone');
  expect(el.textContent).toContain('raz w tygodniu zamiast codziennie');
  await act(async () => eko.click());
  await wpiszDomene('kawa-marka.pl');
  await zaznaczZgody();
  await act(async () => przycisk('Zamów i opłać').click());
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ ecoModeEnabled: false }));
});

// P1-02: obietnica „darmowego okresu próbnego”, którego nie ma.
it('P1-02: bez dostępnej próby nie ma tekstów o darmowym okresie próbnym', async () => {
  const t = await pokaz('');
  expect(t).not.toContain('darmowym okresem próbnym');
  expect(t).not.toContain('WAF');
  const h = await pokaz('type=hosting');
  expect(h).not.toContain('Wypróbuj bez zobowiązań');
  expect(await pokaz('', { ...OFERTA, freeEnabled: true }, [{ ...HOSTING, trialDays: 14 }, POCZTA])).toContain('darmowym okresem próbnym');
});

// P1-05, P4-2, P1-06, P4-8, P4-10: parametry jak na www, bez kodów i angielskich słów, ceny w zł brutto.
it('P4-2/P1-05/P4-8/P4-10: hosting — limity jak na www, ceny w zł brutto z netto; bez kodów planu i MONTH/YEAR', async () => {
  const t = await pokaz('type=hosting');
  expect(t).toContain('do 2 vCPU (limit)');
  expect(t).toContain('do 8 GB RAM (limit)');
  expect(t).toContain('50 GB miejsca NVMe');
  expect(t).not.toMatch(/% CPU|SSD|godzinowo|verris-hosting|MONTH|YEAR/);
  expect(t).toMatch(/45,00\s?zł\s*brutto \/ mies\./);
  expect(t).toMatch(/36,59\s?zł netto · z portfela 45,00\s?K/);
});

it('P4-2/P4-8: poczta — miejsce, skrzynki i wysyłka zamiast CPU i RAM; tekst domeny bez „hostingu”', async () => {
  const t = await pokaz('type=email');
  expect(t).toContain('10 GB miejsca na pocztę (NVMe)');
  expect(t).toContain('Skrzynki bez limitu liczby');
  expect(t).toMatch(/Wysyłka do 1\s?000 wiadomości na dobę/);
  expect(t).not.toMatch(/vCPU|RAM|CPU|Roundcube|POCZTA-STANDARD|poczta-standard|ECO Mode|lub roboczą/);
  expect(t).toContain('razem z pocztą');
  // P4-3 — co z domeną u obecnej firmy.
  expect(t).toContain('Domena może zostać tam, gdzie jest teraz');
});

// Decyzja 6.11.2026 — zamiast rabatu na start kredyty na autoskalowanie: cena pierwszego okresu = cena odnowienia,
// bez przekreślenia i „najniższej ceny z 30 dni”; korzyść przy kwocie i w informacjach przedumownych.
it('kredyty na start: +60 zł przy rocznym, +10 zł przy miesięcznym, pierwszy okres = odnowienie, bez Omnibusa', async () => {
  await pokaz('type=hosting');
  await act(async () => przycisk('Rok z góry').click());
  let t = el.textContent ?? '';
  expect(t).toContain('+60 zł na autoskalowanie przy pierwszym zakupie (plan roczny), ważne 12 miesięcy.');
  expect(t).toMatch(/Odnowienie co rok: 449,00\s?zł brutto/);
  expect(t).toContain('Kredyty na start60 zł na autoskalowanie przy pierwszym zakupie, ważne 12 miesięcy od przyznania.');
  expect(t).not.toMatch(/Najniższa cena z 30 dni|Rabat na start|−15%/);
  expect(el.querySelector('.line-through')).toBeNull();
  await act(async () => okresBtn('Miesięcznie').click());
  t = el.textContent ?? '';
  expect(t).toContain('+10 zł na autoskalowanie przy pierwszym zakupie (plan miesięczny), ważne 12 miesięcy.');
  expect(doZaplaty()).toBe('45,00');
  // Karta (Stripe) — jak dawny rabat: kredyty tylko przy płatności z portfela.
  await act(async () => przycisk('Karta płatnicza').click());
  expect(el.textContent).toContain('Pobieramy opłatę z karty');
  expect(el.textContent).not.toContain('na autoskalowanie przy pierwszym zakupie');
});

it('kredyty na start: poczta ich nie daje (tylko hosting)', async () => {
  const t = await pokaz('type=email');
  expect(t).not.toContain('na autoskalowanie przy pierwszym zakupie');
});

// A2-08: informacje przedumowne w zamówieniu i osobne zgody zamiast zbiorczego pola.
it('A2-08: dane sprzedawcy, cena, odnowienie, odstąpienie i osobne zgody', async () => {
  const t = await pokaz('type=hosting');
  expect(t).toContain('HVLN Dominik Kowalski, Zacisze 2A, 65-775 Zielona Góra, NIP 9292069367');
  expect(t).toContain('Automatycznie co miesiąc');
  expect(t).toContain('Wyłączysz je w panelu');
  expect(t).toContain('14 dni od zamówienia na odstąpienie');
  // Decyzja 4 — kredyty z kodu to nie zakup.
  expect(t).toContain('nie ma za nie faktury');
  const zgody = [...el.querySelectorAll('input')].filter((i) => i.type === 'checkbox');
  expect(zgody).toHaveLength(2);
  expect(el.querySelector('#zgoda-regulamin')?.closest('label')?.textContent).not.toContain('Politykę prywatności');
  expect(el.querySelector('#zgoda-swiadczenie')?.closest('label')?.textContent).toContain('uruchomienie usługi od razu');
});

// P5-04 (część w zamówieniu): błędna domena zatrzymana w panelu, IDN przyjęta i wysłana w zapisie ASCII.
it('P5-04: „example..com” zatrzymane z komunikatem, „żółw.pl” wysłane jako xn--', async () => {
  mockCreate.mockResolvedValue({ ok: true, data: { subscription: { id: 's1' } } });
  await pokaz('type=hosting');
  await zaznaczZgody();
  await wpiszDomene('example..com');
  expect(el.querySelector('#domena-blad')?.textContent).toContain('poprawną domenę');
  await act(async () => przycisk('Zamów i opłać').click());
  expect(mockCreate).not.toHaveBeenCalled();
  await wpiszDomene('żółw.pl');
  expect(el.querySelector('#domena-blad')).toBeNull();
  await act(async () => przycisk('Zamów i opłać').click());
  expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ domain: 'xn--w-uga1v8h.pl' }));
});

describe('sprawdzDomene', () => {
  it.each(['example..com', '-zla-.pl', 'https://firma.pl', 'firma', 'fir ma.pl'])('odrzuca %s', (d) => {
    expect(sprawdzDomene(d).ok).toBe(false);
  });
  it.each([
    ['Firma.PL', 'firma.pl'],
    ['sklep-kawy.com.pl.', 'sklep-kawy.com.pl'],
    ['żółw.pl', 'xn--w-uga1v8h.pl'],
  ])('przyjmuje %s', (d, ascii) => {
    const w = sprawdzDomene(d);
    expect(w.ok && w.ascii).toBe(ascii);
  });
});
