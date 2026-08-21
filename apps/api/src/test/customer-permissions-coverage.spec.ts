import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { inferCustomerRoutePermissions } from '../common/guards/customer-permissions.guard';

/**
 * Z-04 — przemiatanie wszystkich tras API pod kątem subkont.
 *
 * Po odwróceniu domyślnej odpowiedzi na ODMOWA pojawia się nowe ryzyko:
 * ktoś dodaje trasę, subkonta dostają 403, a nikt nie wie dlaczego. Ten test
 * zamienia to w komunikat przy pierwszym uruchomieniu testów zamiast
 * w zgłoszenie od klienta.
 *
 * Zasada: **każda trasa musi być sklasyfikowana świadomie.** Lista poniżej to
 * pełny zbiór tras zamkniętych dla subkont. Nowa trasa, która trafi do odmowy
 * bez wpisu tutaj, zapala test — autor musi wtedy podjąć decyzję: dopisać
 * regułę w REGULY_TRAS albo dopisać trasę do tej listy z uzasadnieniem.
 *
 * Analiza jest statyczna: nie importuje kontrolerów, więc nie potrzebuje
 * Prismy ani kontenera DI.
 */

const API_SRC = resolve(__dirname, '..');

/**
 * Trasy świadomie zamknięte dla subkont — rzeczy właściciela konta oraz
 * powierzchnia węzła/agenta, do której konto klienckie i tak nie ma wstępu.
 */
const ODMOWA_OCZEKIWANA: ReadonlyArray<string> = [
  // --- rzeczy właściciela konta ---------------------------------------------
  // Usunięcie konta, eksport RODO, DPA, program partnerski i resellerski,
  // zarządzanie subkontami, zmiana hasła konta nadrzędnego.
  //
  // --- powierzchnia węzła i agenta ------------------------------------------
  // /agent, /node i /servers uwierzytelniają się tokenem tożsamości węzła,
  // nie sesją klienta. Subkonto i tak by tu nie weszło, ale klasyfikujemy
  // jawnie, żeby lista była kompletna i żeby nowa trasa agenta nie wpadła tu
  // po cichu.
  'DELETE /me/account-deletion',
  'DELETE /users/iam/invites/:id',
  'DELETE /users/iam/members/:id',
  'GET /agent/nodes/bootstrap/agent-script',
  'GET /agent/nodes/bootstrap/script',
  'GET /agent/probes/list',
  'GET /agent/tasks/app-install/script',
  'GET /agent/tasks/db-upgrade/script',
  'GET /agent/tasks/deploy-ssh-pubkey',
  'GET /agent/tasks/hosting-profile/default-page/bundle',
  'GET /agent/tasks/hosting-profile/default-page/script',
  'GET /agent/tasks/hosting-profile/script',
  'GET /agent/tasks/lease',
  'GET /agent/tasks/lve/desired',
  'GET /agent/tasks/lve/script',
  'GET /agent/tasks/node-update/script',
  'GET /agent/tasks/offsite-restore/script',
  'GET /agent/tasks/php-apply/script',
  'GET /agent/tasks/staging-sync/script',
  'GET /agent/tasks/waf-apply/script',
  'GET /agent/tasks/wp-install/script',
  'GET /agent/vpn/peers-config',
  'GET /me/account-deletion',
  'GET /me/data-export',
  'GET /me/data-export/download/:token',
  'GET /me/dpa.pdf',
  'GET /node/migration-worker/lease',
  'GET /partners/me/commissions',
  'GET /partners/me/overview',
  'GET /partners/me/payouts',
  'GET /reseller/me/clients',
  'GET /reseller/me/overview',
  'GET /users/iam',
  'GET /users/iam/audit',
  'PATCH /users/iam/members/:id',
  'PATCH /users/password',
  'POST /agent/backup/offsite-report',
  'POST /agent/nodes/bootstrap/report',
  'POST /agent/probes/local',
  'POST /agent/security/alert',
  'POST /agent/tasks/:taskId/complete',
  'POST /agent/tasks/:taskId/fail',
  'POST /agent/tasks/:taskId/progress',
  'POST /me/account-deletion',
  'POST /me/data-export',
  'POST /node/migration-worker/:jobId/complete',
  'POST /node/migration-worker/:jobId/fail',
  'POST /node/migration-worker/:jobId/progress',
  'POST /partners/me/payouts/bank',
  'POST /partners/me/payouts/wallet',
  'POST /servers/handshake',
  'POST /users/iam/invites',
  'POST /users/iam/invites/accept',
];

function plikiTs(katalog: string): string[] {
  let out: string[] = [];
  for (const w of readdirSync(katalog)) {
    const p = join(katalog, w);
    if (statSync(p).isDirectory()) {
      if (w === 'node_modules') continue;
      out = out.concat(plikiTs(p));
    } else if (w.endsWith('.ts') && !w.endsWith('.spec.ts')) {
      out.push(p);
    }
  }
  return out;
}

interface Trasa {
  metoda: string;
  sciezka: string;
  plik: string;
}

/** Trasy kontrolerów, do których w ogóle może dotrzeć konto klienta. */
function trasyKlienckie(): Trasa[] {
  const out: Trasa[] = [];
  for (const plik of plikiTs(API_SRC)) {
    const tresc = readFileSync(plik, 'utf8');
    const mPrefiks = /@Controller\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/.exec(tresc);
    if (!mPrefiks) continue;
    // Kontrolery zamknięte dla ADMIN/STAFF nie są w zasięgu subkonta.
    if (/@Roles\(\s*Role\.(ADMIN|STAFF)/.test(tresc)) continue;
    const prefiks = (mPrefiks[1] ?? '').replace(/^\/*/, '').replace(/\/*$/, '');
    const re = /@(Get|Post|Patch|Put|Delete|All)\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(tresc))) {
      const metoda = m[1].toUpperCase();
      const sub = (m[2] ?? '').replace(/^\/*/, '').replace(/\/*$/, '');
      const sciezka = '/' + [prefiks, sub].filter(Boolean).join('/');
      out.push({ metoda, sciezka, plik: plik.split('/apps/')[1] ?? plik });
    }
  }
  return out;
}

describe('Z-04 — pokrycie tras klasyfikacją uprawnień subkont', () => {
  const trasy = trasyKlienckie();

  it('znajduje sensowną liczbę tras (test sam się nie oszukuje)', () => {
    expect(trasy.length).toBeGreaterThan(200);
  });

  it('zbiór tras zamkniętych dla subkont jest dokładnie taki, jak opisany', () => {
    const odmowione = trasy
      .filter((t) => inferCustomerRoutePermissions(t.metoda, t.sciezka) === 'ODMOWA')
      .map((t) => `${t.metoda} ${t.sciezka}`);

    const unikalne = [...new Set(odmowione)].sort();
    expect(unikalne).toEqual([...ODMOWA_OCZEKIWANA].sort());
  });

  it('żadna trasa hostingu ani rozliczeń nie została przy okazji zamknięta', () => {
    const wrazliwe = trasy.filter((t) =>
      /\/(services|subscriptions|billing|domains|tickets)(\/|$)/.test(t.sciezka),
    );
    expect(wrazliwe.length).toBeGreaterThan(50);
    const zamkniete = wrazliwe
      .filter((t) => inferCustomerRoutePermissions(t.metoda, t.sciezka) === 'ODMOWA')
      .map((t) => `${t.metoda} ${t.sciezka}   ← ${t.plik}`);
    expect(zamkniete).toEqual([]);
  });
});
