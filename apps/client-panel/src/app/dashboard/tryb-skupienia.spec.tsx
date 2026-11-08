/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { PasekSkupienia, trybSkupienia } from '@/components/panel/tryb-skupienia';

/**
 * Paczka 121 (prośba właściciela 8.11) – edytor kreatora i kreator nowej strony w trybie skupienia: layout panelu
 * nie renderuje menu bocznego, górnego paska ani stopki; banery globalne zostają. Decyzja z adresu przy renderze
 * na serwerze (bez mignięcia menu). „Menu” w pasku edytora otwiera menu panelu jako szufladę (dialog, Esc, fokus).
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let sciezka = '/dashboard/kreator/11111111-1111-4111-8111-111111111111';
jest.mock('next/navigation', () => ({
  usePathname: () => sciezka,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));
// Akcje serwera i komponenty z własnym pobieraniem danych – zastępniki (test dotyczy układu, nie danych).
jest.mock('./actions', () => ({ logoutAction: jest.fn() }));
jest.mock('./sidebar-actions', () => ({
  fetchSidebarUserState: jest.fn(() => new Promise(() => undefined)),
  savePanelPreferences: jest.fn(),
}));
jest.mock('./impersonation-actions', () => ({ getImpersonationContext: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('./rail-actions', () => ({ fetchRailDataAction: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('./support/actions', () => ({ fetchBetaStatus: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('@/lib/analytics-events', () => ({ pushUserData: jest.fn() }));
jest.mock('./impersonation-banner', () => ({ ImpersonationBanner: () => <div data-test="baner-impersonacji" /> }));
jest.mock('./incident-banner', () => ({ IncidentBanner: () => <div data-test="baner-awarii" /> }));
jest.mock('./notices-banner', () => ({ NoticesBanner: () => <div data-test="baner-komunikatow" /> }));
jest.mock('./baner-braku-dostepu', () => ({ BanerBrakuDostepu: () => <div data-test="baner-braku-dostepu" /> }));
jest.mock('./przelacznik-kont', () => ({ PrzelacznikKont: () => null, PasekCudzegoKonta: () => <div data-test="pasek-cudzego-konta" /> }));
jest.mock('./wallet-badge', () => ({ WalletBadge: () => <span data-test="portfel" /> }));
jest.mock('./notification-bell', () => ({ NotificationBell: () => null }));
jest.mock('./reconsent-modal', () => ({ ReConsentModal: () => null }));
jest.mock('@/components/platform-config-loader', () => ({ PlatformConfigLoader: () => <span data-test="strażnik-sesji" /> }));
jest.mock('@/components/cookie-consent', () => ({ CookiePreferencesButton: () => null }));
jest.mock('@/components/assistant/HostingAssistant', () => ({ __esModule: true, default: () => <span data-test="asystent" /> }));
jest.mock('@/components/panel/zglos-uwage', () => ({ ZglosUwage: () => null }));
jest.mock('@/components/panel/service-nav', () => ({ ServiceNav: () => null }));
jest.mock('@/components/panel/command-palette', () => ({ CommandPalette: () => <span data-test="wyszukiwarka" />, tylkoDostepne: (_f: unknown, i: unknown[]) => i }));
jest.mock('@/components/panel/theme-toggle', () => ({ THEME_KEY: 'verris-theme', ThemeToggle: () => null, applyTheme: jest.fn() }));
jest.mock('@/lib/feature-flags', () => ({
  FeatureFlagsProvider: ({ children }: { children: React.ReactNode }) => children,
  useFlagi: () => ({}),
  useModul: () => true,
}));
jest.mock('@verris/ui', () => ({ BanerNowejWersji: () => <div data-test="baner-nowej-wersji" /> }));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- import po jest.mock (moduł layoutu z zależnościami)
const DashboardLayout = (require('./layout') as typeof import('./layout')).default;

const EDYTOR = '/dashboard/kreator/11111111-1111-4111-8111-111111111111';

describe('trybSkupienia – które adresy', () => {
  it('edytor (id strony) i kreator nowej strony – tak; lista stron i inne strony panelu – nie', () => {
    expect(trybSkupienia(EDYTOR)).toBe(true);
    expect(trybSkupienia(`${EDYTOR}/`)).toBe(true);
    expect(trybSkupienia('/dashboard/kreator/nowa')).toBe(true);
    expect(trybSkupienia('/dashboard/kreator')).toBe(false);
    expect(trybSkupienia('/dashboard/kreator/pro')).toBe(false);
    expect(trybSkupienia('/dashboard/services')).toBe(false);
    expect(trybSkupienia(null)).toBe(false);
  });
});

describe('layout panelu w trybie skupienia (HTML z serwera)', () => {
  const html = (adres: string) => {
    sciezka = adres;
    const el = document.createElement('div');
    el.innerHTML = renderToString(
      <DashboardLayout>
        <PasekSkupienia />
        <p>treść strony</p>
      </DashboardLayout>,
    );
    return el;
  };

  it('edytor: bez menu bocznego, górnego paska (wyszukiwarka, portfel) i stopki; jest „← Panel”, banery zostają', () => {
    const el = html(EDYTOR);
    expect(el.querySelector('nav[aria-label="Główne"]')).toBeNull();
    expect(el.querySelector('aside')).toBeNull();
    expect(el.querySelector('[aria-label="Otwórz menu"]')).toBeNull();
    expect(el.querySelector('[data-test="wyszukiwarka"]')).toBeNull();
    expect(el.querySelector('[data-test="portfel"]')).toBeNull();
    expect(el.querySelector('footer')).toBeNull();
    const powrot = el.querySelector<HTMLAnchorElement>('a[aria-label="Wróć do listy stron w panelu"]')!;
    expect(powrot.getAttribute('href')).toBe('/dashboard/kreator');
    expect(powrot.textContent).toContain('Panel');
    for (const b of ['baner-impersonacji', 'baner-awarii', 'baner-komunikatow', 'baner-nowej-wersji', 'baner-braku-dostepu', 'pasek-cudzego-konta']) {
      expect(el.querySelector(`[data-test="${b}"]`)).not.toBeNull();
    }
    // Strażnik bezczynności sesji siedział w górnym pasku – w trybie skupienia musi zostać.
    expect(el.querySelector('[data-test="strażnik-sesji"]')).not.toBeNull();
    expect(el.querySelector('main#main')?.textContent).toContain('treść strony');
  });

  it('kreator nowej strony – też tryb skupienia', () => {
    expect(html('/dashboard/kreator/nowa').querySelector('nav[aria-label="Główne"]')).toBeNull();
  });

  it('lista stron kreatora: zwykły layout z menu, paskiem i stopką', () => {
    const el = html('/dashboard/kreator');
    expect(el.querySelector('nav[aria-label="Główne"]')).not.toBeNull();
    expect(el.querySelector('[data-test="wyszukiwarka"]')).not.toBeNull();
    expect(el.querySelector('footer')).not.toBeNull();
  });
});

describe('„Menu” w pasku edytora – menu panelu jako szuflada', () => {
  let root: Root;
  let kontener: HTMLElement;
  beforeEach(() => {
    sciezka = EDYTOR;
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    kontener = document.createElement('div');
    document.body.appendChild(kontener);
    root = createRoot(kontener);
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('otwiera dialog z fokusem w środku, Esc zamyka i oddaje fokus przyciskowi „Menu”', async () => {
    await act(async () =>
      root.render(
        <DashboardLayout>
          <PasekSkupienia />
        </DashboardLayout>,
      ),
    );
    const menu = kontener.querySelector<HTMLButtonElement>('button[aria-label="Menu panelu"]')!;
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    await act(async () => menu.click());

    const szuflada = kontener.querySelector('aside')!;
    expect(szuflada.getAttribute('role')).toBe('dialog');
    expect(szuflada.getAttribute('aria-modal')).toBe('true');
    expect(szuflada.getAttribute('aria-label')).toBe('Menu panelu');
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(menu.getAttribute('aria-controls')).toBe(szuflada.id);
    expect(szuflada.contains(document.activeElement)).toBe(true);

    await act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(kontener.querySelector('aside')).toBeNull();
    expect(document.activeElement).toBe(menu);
  });
});
