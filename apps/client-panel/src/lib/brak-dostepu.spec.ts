import { readFileSync } from 'fs';
import { join } from 'path';
import { canAccessDashboardRoute } from './client-nav-access';
import { adresBrakuDostepu, komunikatBrakuDostepu, nazwaSekcji, PARAM_BRAK_DOSTEPU } from './brak-dostepu';
import { tylkoDostepne, type PaletteItem } from '@/components/panel/command-palette';

/**
 * P3-08 — Piotr (subkonto z podglądem usług i zgłoszeń) w wyszukiwarce widział „Faktury” i „Doładuj portfel”,
 * a Enter albo wpisany adres przenosiły go bez słowa na pulpit.
 */
const PIOTR = { isSubaccount: true, customerPermissions: ['SERVICES_READ', 'TICKETS_READ'] };
const WLASCICIEL = { isSubaccount: false, customerPermissions: null };

describe('P3-08 — komunikat zamiast cichego przekierowania', () => {
  it('adres pulpitu niesie ścieżkę zablokowanej strony', () => {
    expect(adresBrakuDostepu('/dashboard/billing/invoices')).toBe(`/dashboard?${PARAM_BRAK_DOSTEPU}=%2Fdashboard%2Fbilling%2Finvoices`);
  });

  it('nazwa sekcji po najdłuższym prefiksie; nieznana → „tej strony”', () => {
    expect(nazwaSekcji('/dashboard/billing/invoices')).toBe('Płatności');
    expect(nazwaSekcji('/dashboard/services/new?plan=x')).toBe('zamawiania nowych usług');
    expect(nazwaSekcji('/dashboard/services/abc')).toBe('Usług');
    expect(nazwaSekcji('/dashboard/coś-nowego')).toBe('tej strony');
  });

  it('subkonto: „Nie masz uprawnienia do Płatności” z prośbą do właściciela', () => {
    expect(komunikatBrakuDostepu('/dashboard/billing', PIOTR)).toBe('Nie masz uprawnienia do Płatności. Poproś właściciela konta o dostęp.');
    expect(komunikatBrakuDostepu('/dashboard/iam', PIOTR)).toMatch(/^Nie masz uprawnienia do IAM i subkont\./);
  });

  it('konto rozliczane poza Verris (właściciel): bez prośby do właściciela', () => {
    expect(komunikatBrakuDostepu('/dashboard/billing', { ...WLASCICIEL, billingOutside: true })).toBe('Nie masz dostępu do Płatności na tym koncie.');
  });

  it('bez komunikatu: brak parametru, adres spoza panelu, strona jednak dostępna', () => {
    expect(komunikatBrakuDostepu(null, PIOTR)).toBeNull();
    expect(komunikatBrakuDostepu('https://zly.example/x', PIOTR)).toBeNull();
    expect(komunikatBrakuDostepu('//zly.example', PIOTR)).toBeNull();
    expect(komunikatBrakuDostepu('/dashboard/services', PIOTR)).toBeNull();
    expect(komunikatBrakuDostepu('/dashboard/billing', WLASCICIEL)).toBeNull();
  });
});

describe('P3-08 — wyszukiwarka bez akcji spoza uprawnień', () => {
  const items: PaletteItem[] = [
    { label: 'Usługi', hint: 'strona', href: '/dashboard/services' },
    { label: 'Zamów nową usługę', hint: 'akcja', href: '/dashboard/services/new' },
    { label: 'Doładuj portfel', hint: 'płatności', href: '/dashboard/billing' },
    { label: 'Faktury', hint: 'płatności', href: '/dashboard/billing/invoices' },
    { label: 'Nowe zgłoszenie do pomocy', hint: 'pomoc', href: '/dashboard/support/new' },
    { label: 'Bezpieczeństwo i logowanie', hint: 'konto', href: '/dashboard/settings?tab=security' },
    { label: 'Widok prosty', hint: 'widok', run: () => undefined },
  ];

  it('subkonto bez płatności i bez zakładania zgłoszeń widzi tylko swoje strony i akcje bez adresu', () => {
    const widzi = tylkoDostepne((h) => canAccessDashboardRoute(h, PIOTR), items).map((i) => i.label);
    expect(widzi).toEqual(['Usługi', 'Bezpieczeństwo i logowanie', 'Widok prosty']);
  });

  it('właściciel widzi wszystko', () => {
    expect(tylkoDostepne((h) => canAccessDashboardRoute(h, WLASCICIEL), items)).toHaveLength(items.length);
  });

  it('nowe zgłoszenie tylko z „Zgłoszenia: zarządzanie” (jak POST /tickets); lista zgłoszeń z podglądem', () => {
    expect(canAccessDashboardRoute('/dashboard/support/new', PIOTR)).toBe(false);
    expect(canAccessDashboardRoute('/dashboard/support', PIOTR)).toBe(true);
    expect(canAccessDashboardRoute('/dashboard/support/new', { isSubaccount: true, customerPermissions: ['TICKETS_MANAGE'] })).toBe(true);
  });

  it('layout panelu filtruje paletę i przekierowuje z komunikatem (nie na goły /dashboard)', () => {
    const layout = readFileSync(join(__dirname, '../app/dashboard/layout.tsx'), 'utf8');
    expect(layout).toMatch(/const paletteItems: PaletteItem\[\] = tylkoDostepne\(canAccess, \[/);
    expect(layout).toContain('router.replace(adresBrakuDostepu(pathname))');
    expect(layout).not.toContain('router.replace("/dashboard")');
    expect(layout).toContain('<BanerBrakuDostepu navCtx={navCtx} />');
  });
});
