import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Flagi modułów panelu klienta.
 *
 * CO PILNUJE. Next podstawia w buildzie tylko LITERALNE `process.env.NEXT_PUBLIC_…`.
 * Dynamiczne `process.env[name]` w module używanym przez komponenty klienckie (menu
 * w `dashboard/layout.tsx`) dawało w przeglądarce zawsze wartość domyślną: operator
 * wyłączał EKO, a menu dalej je pokazywało; włączenie VPS nigdy nie docierało do menu.
 */
describe('client-features', () => {
  const ORYG = { ...process.env };
  afterEach(() => {
    process.env = { ...ORYG };
    jest.resetModules();
  });

  const zaladuj = () => jest.requireActual<typeof import('./client-features')>('./client-features');

  it('bez zmiennych: EKO, polecenia i IAM włączone, e-mail marketing wyłączony; VPS i narzutu tu nie ma (z API)', () => {
    for (const k of ['NEXT_PUBLIC_FEATURE_ECO', 'NEXT_PUBLIC_FEATURE_REFERRAL', 'NEXT_PUBLIC_FEATURE_IAM', 'NEXT_PUBLIC_FEATURE_EMAIL_MARKETING']) delete process.env[k];
    expect(zaladuj().clientFeatures).toEqual({ eco: true, iam: true, referral: true, emailMarketing: false });
  });

  it('jawne false/0 wyłącza, true/1 włącza', () => {
    process.env.NEXT_PUBLIC_FEATURE_ECO = 'false';
    process.env.NEXT_PUBLIC_FEATURE_IAM = '0';
    process.env.NEXT_PUBLIC_FEATURE_EMAIL_MARKETING = '1';
    const f = zaladuj().clientFeatures;
    expect(f.eco).toBe(false);
    expect(f.iam).toBe(false);
    expect(f.emailMarketing).toBe(true);
  });

  it('źródło czyta flagi wyłącznie literalnie (inaczej przeglądarka widzi same domyślne)', () => {
    const zrodlo = readFileSync(join(__dirname, 'client-features.ts'), 'utf8');
    expect(zrodlo).not.toMatch(/process\.env\[/);
  });
});
