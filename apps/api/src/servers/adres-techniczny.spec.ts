import { Prisma } from '@verris/database';
import {
  etykietaWStrefie,
  konfiguracjaDomenyTechnicznej,
  losowyIdentyfikator,
  wDomenieTechnicznej,
  WZORZEC_IDENTYFIKATORA,
} from './adres-techniczny.js';
import { AdresTechnicznyService, StrefaDnsOvh, TTL_ADRESU_TECHNICZNEGO } from './adres-techniczny.service.js';

/**
 * Paczka 129 (feedback bety 19.11.2026) – adres techniczny usługi `<id>.<HOSTING_TECH_DOMAIN>`: konfiguracja (osobna
 * domena, nie w domenie paneli – ciasteczka), identyfikator bez danych osobowych, rekord A w strefie OVH na IP węzła
 * konta (każde konto na innym węźle – wildcard nie wystarczy), przepięcie przy przeniesieniu konta (H-16).
 */
const PANELE = {
  CLIENT_PANEL_URL: 'https://panel.verris.pl',
  STAFF_PANEL_URL: 'https://staff.verris.pl',
  ADMIN_PANEL_URL: 'https://admin.verris.pl',
  AUTH_COOKIE_DOMAIN: '.verris.pl',
};

describe('konfiguracja domeny technicznej', () => {
  it('bez zmiennej – funkcja wyłączona, bez błędu', () => {
    expect(konfiguracjaDomenyTechnicznej({ ...PANELE })).toEqual({ domena: null, blad: null });
    expect(konfiguracjaDomenyTechnicznej({ ...PANELE, HOSTING_TECH_DOMAIN: '  ' })).toEqual({ domena: null, blad: null });
  });

  it('osobna domena – przyjęta (małe litery, bez kropek na brzegach)', () => {
    expect(konfiguracjaDomenyTechnicznej({ ...PANELE, HOSTING_TECH_DOMAIN: ' Verris-Host.PL. ' })).toEqual({ domena: 'verris-host.pl', blad: null });
  });

  it.each(['verris.pl', 'host.verris.pl', 'uslugi.panel.verris.pl'])('%s w domenie paneli – wyłączona z błędem o ciasteczkach', (d) => {
    const k = konfiguracjaDomenyTechnicznej({ ...PANELE, HOSTING_TECH_DOMAIN: d });
    expect(k.domena).toBeNull();
    expect(k.blad).toMatch(/ciasteczka z panelami/);
  });

  it('domena paneli inna niż verris.pl (np. stage) też jest pilnowana – z adresów paneli i AUTH_COOKIE_DOMAIN', () => {
    const k = konfiguracjaDomenyTechnicznej({ CLIENT_PANEL_URL: 'https://panel.stage-verris.eu', HOSTING_TECH_DOMAIN: 'apps.stage-verris.eu' });
    expect(k.domena).toBeNull();
    const c = konfiguracjaDomenyTechnicznej({ AUTH_COOKIE_DOMAIN: '.firma.dev', HOSTING_TECH_DOMAIN: 'x.firma.dev' });
    expect(c.domena).toBeNull();
  });

  it('niepoprawna domena – wyłączona z błędem', () => {
    expect(konfiguracjaDomenyTechnicznej({ HOSTING_TECH_DOMAIN: 'zła domena' }).blad).toMatch(/nie jest poprawną domeną/);
  });
});

describe('identyfikator i strefa', () => {
  it('identyfikator: v + 7 znaków [a-z0-9], losowy', () => {
    const ids = new Set(Array.from({ length: 200 }, () => losowyIdentyfikator()));
    for (const id of ids) expect(id).toMatch(WZORZEC_IDENTYFIKATORA);
    expect(ids.size).toBeGreaterThan(190);
  });

  it('etykieta w strefie tylko dla adresu technicznego tej domeny', () => {
    expect(etykietaWStrefie('v7k2m9qx.verris-host.pl', 'verris-host.pl')).toBe('v7k2m9qx');
    expect(etykietaWStrefie('v7k2m9qx.inna.pl', 'verris-host.pl')).toBeNull();
    expect(etykietaWStrefie('www.v7k2m9qx.verris-host.pl', 'verris-host.pl')).toBeNull();
  });

  it('domena techniczna i jej poddomeny są zarezerwowane', () => {
    expect(wDomenieTechnicznej('verris-host.pl', 'verris-host.pl')).toBe(true);
    expect(wDomenieTechnicznej('V1234567.verris-host.pl', 'verris-host.pl')).toBe(true);
    expect(wDomenieTechnicznej('mojverris-host.pl', 'verris-host.pl')).toBe(false);
    expect(wDomenieTechnicznej('firma.pl', null)).toBe(false);
  });
});

function ovhAtrapa(rekordy: Array<{ id: number; subDomain: string; target: string }> = []) {
  const wywolania: string[] = [];
  const ovh = {
    isConfigured: () => true,
    request: vi.fn(async (metoda: string, sciezka: string, body?: { subDomain?: string; target?: string }) => {
      wywolania.push(`${metoda} ${sciezka}${body ? ` ${JSON.stringify(body)}` : ''}`);
      const m = /record\?fieldType=A&subDomain=([^&]+)$/.exec(sciezka);
      if (metoda === 'GET' && m) return rekordy.filter((r) => r.subDomain === decodeURIComponent(m[1])).map((r) => r.id);
      const id = /record\/(\d+)$/.exec(sciezka);
      if (metoda === 'GET' && id) return rekordy.find((r) => r.id === Number(id[1]));
      if (metoda === 'PUT' && id) rekordy.find((r) => r.id === Number(id[1]))!.target = body!.target!;
      if (metoda === 'DELETE' && id) rekordy.splice(rekordy.findIndex((r) => r.id === Number(id[1])), 1);
      if (metoda === 'POST' && sciezka.endsWith('/record')) rekordy.push({ id: 100 + rekordy.length, subDomain: body!.subDomain!, target: body!.target! });
      return undefined;
    }),
  };
  return { ovh, rekordy, wywolania };
}

describe('StrefaDnsOvh – rekord A adresu technicznego', () => {
  it('brak rekordu → utworzenie z krótkim TTL i odświeżenie strefy', async () => {
    const a = ovhAtrapa();
    expect(await new StrefaDnsOvh(a.ovh as never).ustawA('verris-host.pl', 'v1234567', '203.0.113.7')).toBe('utworzono');
    expect(a.wywolania).toContain(
      `POST /domain/zone/verris-host.pl/record ${JSON.stringify({ fieldType: 'A', subDomain: 'v1234567', target: '203.0.113.7', ttl: TTL_ADRESU_TECHNICZNEGO })}`,
    );
    expect(a.wywolania.at(-1)).toBe('POST /domain/zone/verris-host.pl/refresh');
  });

  it('rekord na stary węzeł → zmiana IP, nadmiarowe rekordy tej nazwy usunięte', async () => {
    const a = ovhAtrapa([
      { id: 1, subDomain: 'v1234567', target: '198.51.100.1' },
      { id: 2, subDomain: 'v1234567', target: '198.51.100.2' },
      { id: 3, subDomain: 'vinnyyyy', target: '198.51.100.1' },
    ]);
    expect(await new StrefaDnsOvh(a.ovh as never).ustawA('verris-host.pl', 'v1234567', '203.0.113.7')).toBe('zmieniono');
    expect(a.rekordy).toEqual([
      { id: 1, subDomain: 'v1234567', target: '203.0.113.7' },
      { id: 3, subDomain: 'vinnyyyy', target: '198.51.100.1' },
    ]);
  });

  it('rekord już wskazuje dobre IP → bez zapisu', async () => {
    const a = ovhAtrapa([{ id: 1, subDomain: 'v1234567', target: '203.0.113.7' }]);
    expect(await new StrefaDnsOvh(a.ovh as never).ustawA('verris-host.pl', 'v1234567', '203.0.113.7')).toBe('bez-zmian');
    expect(a.wywolania.some((w) => w.startsWith('PUT') || w.startsWith('POST'))).toBe(false);
  });
});

describe('AdresTechnicznyService', () => {
  function serwis(o: { env?: Record<string, string>; ovhSkonfigurowany?: boolean; sub?: { adresTechniczny: string | null }; kolizje?: number } = {}) {
    const env: Record<string, string> = { ...PANELE, HOSTING_TECH_DOMAIN: 'verris-host.pl', ...o.env };
    const a = ovhAtrapa();
    a.ovh.isConfigured = () => o.ovhSkonfigurowany ?? true;
    let kolizje = o.kolizje ?? 0;
    const sub = o.sub ?? { adresTechniczny: null };
    const prisma = {
      subscription: {
        findUnique: vi.fn(async () => sub),
        updateMany: vi.fn(async ({ data }: { data: { adresTechniczny: string } }) => {
          if (kolizje-- > 0) throw new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' });
          sub.adresTechniczny = data.adresTechniczny;
          return { count: 1 };
        }),
      },
      account: {
        findUnique: vi.fn(async () => ({ userId: 'u1', subscription: { id: 's1', adresTechniczny: sub.adresTechniczny }, server: { ipAddress: '203.0.113.9' } })),
      },
    };
    const audit = { record: vi.fn(async () => undefined) };
    const svc = new AdresTechnicznyService(prisma as never, { get: (k: string) => env[k] } as never, audit as never, a.ovh as never);
    return { svc, prisma, audit, ...a };
  }

  it('dostępny tylko z domeną techniczną i skonfigurowanym DNS', () => {
    expect(serwis().svc.dostepny()).toBe(true);
    expect(serwis({ env: { HOSTING_TECH_DOMAIN: '' } }).svc.dostepny()).toBe(false);
    expect(serwis({ ovhSkonfigurowany: false }).svc.dostepny()).toBe(false);
    expect(serwis({ env: { HOSTING_TECH_DOMAIN: 'host.verris.pl' } }).svc.dostepny()).toBe(false);
  });

  it('nadaj: nowy adres v…….<domena>, przy zderzeniu losowania kolejna próba; drugi raz – ten sam adres', async () => {
    const t = serwis({ kolizje: 2 });
    const adres = await t.svc.nadaj('s1');
    expect(adres).toMatch(/^v[a-z0-9]{7}\.verris-host\.pl$/);
    expect(t.prisma.subscription.updateMany).toHaveBeenCalledTimes(3);
    expect(await t.svc.nadaj('s1')).toBe(adres);
    expect(t.prisma.subscription.updateMany).toHaveBeenCalledTimes(3);
  });

  it('nadaj przy wyłączonej funkcji – null, bez zapisu', async () => {
    const t = serwis({ env: { HOSTING_TECH_DOMAIN: '' } });
    expect(await t.svc.nadaj('s1')).toBeNull();
    expect(t.prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('ustawRekord: tylko adres ze strefy i publiczne IPv4 węzła', async () => {
    const t = serwis();
    await expect(t.svc.ustawRekord('v1234567.inna.pl', '203.0.113.7')).rejects.toThrow(/nie należy do strefy/);
    await expect(t.svc.ustawRekord('v1234567.verris-host.pl', '0.0.0.0')).rejects.toThrow(/IPv4/);
    await expect(t.svc.ustawRekord('v1234567.verris-host.pl', 'shared')).rejects.toThrow(/IPv4/);
    expect(await t.svc.ustawRekord('v1234567.verris-host.pl', '203.0.113.7')).toBe('utworzono');
  });

  it('H-16: po przeniesieniu konta rekord A wskazuje IP nowego węzła, ślad w audycie', async () => {
    const t = serwis({ sub: { adresTechniczny: 'v1234567.verris-host.pl' } });
    t.rekordy.push({ id: 1, subDomain: 'v1234567', target: '198.51.100.1' });
    expect(await t.svc.poPrzeniesieniu('a1')).toBe('v1234567.verris-host.pl');
    expect(t.rekordy).toEqual([{ id: 1, subDomain: 'v1234567', target: '203.0.113.9' }]);
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'ADRES_TECHNICZNY_DNS_PRZEPIETY' }));
  });

  it('konto bez adresu technicznego (usługa sprzed paczki) – przeniesienie bez zmian w DNS', async () => {
    const t = serwis();
    expect(await t.svc.poPrzeniesieniu('a1')).toBeNull();
    expect(t.ovh.request).not.toHaveBeenCalled();
  });

  it('usunięcie konta zdejmuje rekord A', async () => {
    const t = serwis({ sub: { adresTechniczny: 'v1234567.verris-host.pl' } });
    t.rekordy.push({ id: 1, subDomain: 'v1234567', target: '198.51.100.1' });
    await t.svc.poUsunieciuKonta('s1');
    expect(t.rekordy).toEqual([]);
  });
});
