import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CL-02 — white label: klient nie widzi nazwy panelu serwera. Strażnik czyta źródła panelu bez komentarzy
 * (komentarze i identyfikatory w kodzie zostają) i czerwieni się, gdy w tekście wróci „DirectAdmin”, „DA”,
 * „CustomBuild”, komenda `CMD_API_*` albo port 2222.
 *
 * Wyjątki — tylko z powodem:
 *  - kreator migracji: „DirectAdmin” to panel ŹRÓDŁOWY u innego dostawcy, który klient wybiera sam;
 *  - mapowanie błędów: wyrażenie, które rozpoznaje i chowa te słowa.
 */
const WYJATKI = new Set([
  'app/dashboard/migrations/migration-wizard.tsx',
  'app/dashboard/migrations/actions.ts',
  'app/dashboard/migrations/types.ts',
  'lib/client-hosting-messages.ts',
]);

const PANEL_SERWERA = /DirectAdmin|CustomBuild|CMD_API|\b2222\b/i;
// Przegląd tekstów 30.09: oprogramowanie i węzły serwera, drugi „panel hostingu”, adres sondy.
const INFRASTRUKTURA = /CloudLinux|CageFS|\bLVE\b|węzł|panel(?:u|em)? hostingu|Hosting Manager|status page|probeTarget/i;

export function bezKomentarzy(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\'"`])\/\/.*$/gm, '$1');
}

export function zdradzaPanel(kod: string): boolean {
  const tekst = bezKomentarzy(kod);
  return PANEL_SERWERA.test(tekst) || /\bDA\b/.test(tekst) || INFRASTRUKTURA.test(tekst);
}

it('żaden plik panelu klienta nie pokazuje nazwy panelu serwera', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (/\.tsx?$/.test(n) && !/\.spec\.tsx?$/.test(n)) {
        const sciezka = p.split('/src/')[1]!;
        if (!WYJATKI.has(sciezka) && zdradzaPanel(readFileSync(p, 'utf8'))) trafienia.push(sciezka);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

it('strażnik łapie tekst dla klienta, a nie komentarze i identyfikatory', () => {
  expect(zdradzaPanel('<p>Zaloguj się do DirectAdmina</p>')).toBe(true);
  expect(zdradzaPanel("toast.error('Błąd DA: brak konta')")).toBe(true);
  expect(zdradzaPanel('const url = `https://${host}:2222`;')).toBe(true);
  expect(zdradzaPanel('// dane z DirectAdmina\nconst daUsername = x;')).toBe(false);
  expect(zdradzaPanel('/** CMD_API_DNS_CONTROL (DA) */\nexport const nie = "nie da się";')).toBe(false);
  expect(zdradzaPanel("const u = 'https://verris.pl/pomoc'; // DirectAdmin")).toBe(false);
  expect(zdradzaPanel('<p>Zmiana na serwerze (CloudLinux PHP Selector)</p>')).toBe(true);
  expect(zdradzaPanel("{status.version ?? 'domyślna węzła'}")).toBe(true);
  expect(zdradzaPanel('{incident.probeKind} → {incident.probeTarget}')).toBe(true);
  expect(zdradzaPanel('function ograniczenieWezla() {}')).toBe(false);
});
