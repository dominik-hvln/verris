import { walidujLimityIndywidualne, formatLimitu } from '@verris/contracts';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import {
  limityIndywidualneDlaKlienta,
  limityKontaNaWezle,
  maNadpisania,
  nadpisaniaDoZapisu,
  opisLimitow,
  planZNadpisaniami,
} from './limity-indywidualne.js';
import type { PlanResourceFields } from '../servers/da-package-spec.js';

/**
 * K3 (PB-53.5) — limity indywidualne usługi: wyliczenie efektywnych limitów (plan + nadpisania), walidacja wejścia
 * i dokładne wywołanie DirectAdmina (CMD_API_MODIFY_USER action=customize) na atrapie HTTP.
 */
const PLAN: PlanResourceFields = {
  slug: 'starter',
  diskLimitMb: 10240,
  includedTransferGb: 100,
  cpuLimit: 100,
  ramLimitMb: 1024,
  ioLimitKbps: 10240,
  iopsLimit: 1024,
  entryProcesses: 40,
  nprocLimit: 20,
  productKind: 'HOSTING',
};

describe('walidacja limitów indywidualnych (contracts)', () => {
  it('puste pola = jak w planie; liczby z formularza jako tekst', () => {
    expect(walidujLimityIndywidualne({ diskLimitMb: '20480', domains: '', databases: null, emailAccounts: undefined })).toEqual({
      ok: true,
      limity: { diskLimitMb: 20480 },
    });
    expect(walidujLimityIndywidualne(null)).toEqual({ ok: true, limity: {} });
  });

  it('nieznane pole, ułamek, poza zakresem, ujemne, tekst — błąd z nazwą limitu', () => {
    expect(walidujLimityIndywidualne({ inodes: 5 })).toEqual({ ok: false, blad: 'Nieznany limit: inodes.' });
    expect(walidujLimityIndywidualne({ diskLimitMb: 1.5 })).toMatchObject({ ok: false, blad: expect.stringContaining('Dysk') });
    expect(walidujLimityIndywidualne({ diskLimitMb: 50 })).toMatchObject({ ok: false });
    expect(walidujLimityIndywidualne({ domains: 0 })).toMatchObject({ ok: false, blad: expect.stringContaining('Domeny') });
    expect(walidujLimityIndywidualne({ emailAccounts: -1 })).toMatchObject({ ok: false });
    expect(walidujLimityIndywidualne({ databases: 'dużo' })).toMatchObject({ ok: false });
    expect(walidujLimityIndywidualne([1, 2])).toMatchObject({ ok: false });
    // Zero skrzynek/baz to świadoma decyzja (konto bez poczty) — dozwolone.
    expect(walidujLimityIndywidualne({ emailAccounts: 0, databases: 0 })).toEqual({ ok: true, limity: { emailAccounts: 0, databases: 0 } });
  });

  it('format dla klienta i admina', () => {
    expect(formatLimitu('diskLimitMb', 51200)).toBe('50 GB');
    expect(formatLimitu('diskLimitMb', 512)).toBe('512 MB');
    expect(formatLimitu('includedTransferGb', 500)).toBe('500 GB');
    expect(formatLimitu('emailAccounts', 200)).toBe('200');
    expect(formatLimitu('domains', null)).toBe('bez limitu');
  });
});

describe('efektywne limity = plan + nadpisania', () => {
  it('bez nadpisań — plan bez zmian (ta sama referencja)', () => {
    expect(planZNadpisaniami(PLAN, null)).toBe(PLAN);
    expect(maNadpisania(null)).toBe(false);
    expect(maNadpisania({})).toBe(false);
  });

  it('dysk i transfer podmienione, reszta planu nietknięta; śmieci w bazie = plan', () => {
    expect(planZNadpisaniami(PLAN, { diskLimitMb: 51200 })).toEqual({ ...PLAN, diskLimitMb: 51200 });
    expect(planZNadpisaniami(PLAN, { includedTransferGb: 500, emailAccounts: 100 })).toEqual({ ...PLAN, includedTransferGb: 500 });
    expect(planZNadpisaniami(PLAN, { diskLimitMb: 'x' })).toBe(PLAN);
    expect(maNadpisania({ emailAccounts: 100 })).toBe(true);
  });

  it('limity konta na serwerze: pakiet planu + nadpisania, quota = baza + nadwyżka autoskalowania', () => {
    expect(limityKontaNaWezle(PLAN, null, 0)).toEqual({
      diskQuotaMb: 10240,
      bandwidthMb: 100 * 1024,
      domains: 1,
      subdomains: 25,
      emailAccounts: 25,
      emailForwarders: 50,
      mailingLists: 5,
      autoresponders: 25,
      databases: 5,
      domainPointers: 5,
      ftpAccounts: 10,
    });
    expect(limityKontaNaWezle(PLAN, { diskLimitMb: 20480, includedTransferGb: 300, domains: 3, emailAccounts: 100, databases: 10 }, 2048)).toMatchObject({
      diskQuotaMb: 20480 + 2048,
      bandwidthMb: 300 * 1024,
      domains: 3,
      emailAccounts: 100,
      databases: 10,
      subdomains: 25,
      ftpAccounts: 10,
    });
  });

  it('plan „bez limitu” (verris-hosting): nadpisanie liczby zakłada limit; transfer null = bez limitu', () => {
    const vh = { ...PLAN, slug: 'verris-hosting', includedTransferGb: null };
    const l = limityKontaNaWezle(vh, { emailAccounts: 50 }, 0);
    expect(l.emailAccounts).toBe(50);
    expect(l.domains).toBe('unlimited');
    expect(l.bandwidthMb).toBe('unlimited');
    expect(opisLimitow(vh, { emailAccounts: 50 }).find((p) => p.pole === 'emailAccounts')).toEqual({
      pole: 'emailAccounts',
      etykieta: 'Skrzynki e-mail',
      plan: null,
      nadpisanie: 50,
      efektywny: 50,
    });
  });

  it('do zapisu wypadają wartości równe planowi; klient widzi tylko nadpisane pola', () => {
    expect(nadpisaniaDoZapisu(PLAN, { diskLimitMb: 10240, emailAccounts: 25, databases: 7 })).toEqual({ databases: 7 });
    expect(limityIndywidualneDlaKlienta(PLAN, { databases: 7 }).map((p) => p.pole)).toEqual(['databases']);
    expect(opisLimitow(PLAN, null).every((p) => p.nadpisanie === null && p.efektywny === p.plan)).toBe(true);
  });
});

describe('SDK: customizeUserLimits (CMD_API_MODIFY_USER action=customize)', () => {
  type Odp = { data: unknown };
  const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));
  const KONFIG = 'username=klient1&quota=10240&bandwidth=102400&php=ON&cgi=ON&ssl=ON&spam=ON&cron=ON&catchall=ON&dnscontrol=ON&ssh=OFF&login_keys=ON&sysinfo=OFF&aftp=OFF&suspend_at_limit=OFF&redis=ON&git=ON&wordpress=ON&skin=evolution&package=starter';

  function atrapa(o: { konfig?: string; zapis?: unknown } = {}) {
    const get = vi.fn((_p: string, _c?: unknown) => odp(o.konfig ?? KONFIG));
    const post = vi.fn((_p: string, _b?: unknown, _c?: unknown) => odp(o.zapis ?? 'error=0&text=Saved'));
    const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });
    Object.assign(klient, { client: { get, post } });
    const wyslane = () => Object.fromEntries(new URLSearchParams(String(post.mock.calls[0]?.[1] ?? '')));
    return { klient, get, post, wyslane };
  }

  it('dokładne pola: liczby limitów, „bez limitu” jako u<pole>=ON, przełączniki konta odesłane bez zmian', async () => {
    const a = atrapa();
    await a.klient.customizeUserLimits('klient1', limityKontaNaWezle({ ...PLAN, slug: 'verris-hosting', includedTransferGb: null }, { diskLimitMb: 51200, emailAccounts: 100 }, 1024));
    expect(a.get).toHaveBeenCalledWith('/CMD_API_SHOW_USER_CONFIG', { params: { user: 'klient1' } });
    expect(a.post.mock.calls[0]?.[0]).toBe('/CMD_API_MODIFY_USER');
    expect(a.wyslane()).toEqual({
      action: 'customize',
      user: 'klient1',
      ubandwidth: 'ON',
      quota: String(51200 + 1024),
      uvdomains: 'ON',
      unsubdomains: 'ON',
      nemails: '100',
      unemailf: 'ON',
      nemailml: '100',
      unemailr: 'ON',
      umysql: 'ON',
      udomainptr: 'ON',
      uftp: 'ON',
      aftp: 'OFF',
      cgi: 'ON',
      php: 'ON',
      spam: 'ON',
      cron: 'ON',
      catchall: 'ON',
      ssl: 'ON',
      ssh: 'OFF',
      sysinfo: 'OFF',
      login_keys: 'ON',
      dnscontrol: 'ON',
      suspend_at_limit: 'OFF',
      redis: 'ON',
      git: 'ON',
      wordpress: 'ON',
      skin: 'evolution',
    });
  });

  it('limit liczbowy bez u<pole> (obecność u<pole> = „bez limitu” w DA)', async () => {
    const a = atrapa();
    await a.klient.customizeUserLimits('klient1', limityKontaNaWezle(PLAN, { databases: 0 }, 0));
    const w = a.wyslane();
    expect(w).toMatchObject({ quota: '10240', bandwidth: String(100 * 1024), vdomains: '1', nemails: '25', mysql: '0' });
    expect(Object.keys(w).filter((k) => /^u(quota|bandwidth|vdomains|nemails|mysql)$/.test(k))).toEqual([]);
  });

  it('DA odrzuca (error=1) albo odpowiada stroną HTML — błąd, nie sukces', async () => {
    await expect(atrapa({ zapis: 'error=1&text=Cannot+modify&details=quota' }).klient.customizeUserLimits('klient1', limityKontaNaWezle(PLAN, {}, 0))).rejects.toThrow(
      'Cannot modify — quota',
    );
    await expect(atrapa({ zapis: '<html><body>Login</body></html>' }).klient.customizeUserLimits('klient1', limityKontaNaWezle(PLAN, {}, 0))).rejects.toThrow('stroną HTML');
  });

  it('powrót do pakietu planu: action=package z nazwą pakietu; error=1 i strona HTML to błąd', async () => {
    const a = atrapa();
    await a.klient.assignUserPackage('klient1', 'verris-hosting');
    expect(a.post.mock.calls[0]?.[0]).toBe('/CMD_API_MODIFY_USER');
    expect(a.wyslane()).toEqual({ action: 'package', user: 'klient1', package: 'verris-hosting' });
    await expect(atrapa({ zapis: 'error=1&text=No+such+package' }).klient.assignUserPackage('klient1', 'x')).rejects.toThrow('No such package');
    await expect(atrapa({ zapis: '<html>Login</html>' }).klient.assignUserPackage('klient1', 'x')).rejects.toThrow('stroną HTML');
  });

  it('bez czytelnych ustawień konta nic nie wysyła (customize wyłączyłby nieodesłane przełączniki)', async () => {
    const pusta = atrapa({ konfig: '' });
    await expect(pusta.klient.customizeUserLimits('klient1', limityKontaNaWezle(PLAN, {}, 0))).rejects.toThrow('nie odczytano ustawień konta');
    expect(pusta.post).not.toHaveBeenCalled();
    const blad = atrapa({ konfig: 'error=1&text=No+such+user' });
    await expect(blad.klient.customizeUserLimits('nieznany', limityKontaNaWezle(PLAN, {}, 0))).rejects.toThrow('No such user');
    expect(blad.post).not.toHaveBeenCalled();
  });
});
