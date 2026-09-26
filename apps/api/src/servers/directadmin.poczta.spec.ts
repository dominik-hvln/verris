import { BadRequestException } from '@nestjs/common';
import { DirectAdminClient } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service.js';

/**
 * Poczta w DirectAdminService: skrzynki, przekierowania, autorespondery, catch-all, antyspam.
 * Mock na granicy HTTP (axios wewnątrz prawdziwego DirectAdminClient), więc sprawdzamy
 * dokładnie to, co poleciałoby do DA. Pilnujemy trzech rzeczy:
 *  - dane klienta nie doklejają pól do formularza (ciało jest urlencoded, walidacja przed DA),
 *  - DA odpowiada 200 z error=1 w treści — to MA być błąd, a nie „zrobione” + wpis w audycie,
 *  - konto zawieszone (SEC-2) nie wysyła do DA żadnej mutacji.
 */
type Odp = { data: unknown };
const odp = (v: unknown): Promise<Odp> => (v instanceof Error ? Promise.reject(v) : Promise.resolve({ data: v }));

function stanowisko(o: { status?: string; get?: Record<string, unknown>; post?: Record<string, unknown> } = {}) {
  const trasyGet: Record<string, unknown> = {
    '/CMD_API_SHOW_DOMAINS': 'list0=firma.pl',
    '/CMD_API_SHOW_USER_CONFIG': 'domain=firma.pl',
    ...o.get,
  };
  const get = vi.fn((path: string, _cfg?: Record<string, unknown>) => odp(trasyGet[path] ?? ''));
  const post = vi.fn((path: string, _body?: unknown, _cfg?: Record<string, unknown>) =>
    odp(o.post?.[path] ?? 'error=0&text=OK'),
  );
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'klient1', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', daUsername: 'klient1', domain: 'firma.pl', daPasswordEnc: 'enc' };
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    account: { update: vi.fn(async () => account) },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new DirectAdminService(prisma as never, {} as never, {} as never, audit as never);
  vi.spyOn(svc, 'getClientForHostingAccount').mockResolvedValue(klient);
  /** Pola formularza z n-tego POST (ciało urlencoded → obiekt). */
  const wyslane = (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? '')));
  return { svc, get, post, audit, wyslane };
}

const BLEDY_DA: Array<[string, unknown]> = [
  ['tekst error=1', 'error=1&text=Skrzynka%20ju%C5%BC%20istnieje'],
  ['JSON error=1', { error: '1', text: 'Skrzynka już istnieje' }],
];

describe('Poczta — skrzynki (CMD_API_POP)', () => {
  it('tworzy skrzynkę z dokładnymi polami; „&” i nowa linia w haśle nie doklejają parametrów', async () => {
    const s = stanowisko();
    const haslo = 'Tajne&quota=0\nx=1';
    await s.svc.createHostingEmailAccount('s1', 'u1', { email: 'jan@firma.pl', password: haslo });
    expect(s.post.mock.calls[0][0]).toBe('/CMD_API_POP');
    expect(s.wyslane()).toEqual({
      action: 'create', user: 'jan', domain: 'firma.pl', passwd: haslo, passwd2: haslo, quota: '1024', api: 'yes',
    });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_EMAIL_CREATED' }));
  });

  it.each(BLEDY_DA)('DA odpowiada 200 z błędem (%s) → wyjątek z tekstem DA, bez audytu', async (_n, body) => {
    const s = stanowisko({ post: { '/CMD_API_POP': body } });
    await expect(s.svc.createHostingEmailAccount('s1', 'u1', { email: 'jan@firma.pl', password: 'Haslo1234' }))
      .rejects.toThrow('Skrzynka już istnieje');
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('błąd sieci → wyjątek, bez audytu (nie udajemy, że skrzynka powstała)', async () => {
    const s = stanowisko({ post: { '/CMD_API_POP': new Error('socket hang up') } });
    await expect(s.svc.createHostingEmailAccount('s1', 'u1', { email: 'jan@firma.pl', password: 'Haslo1234' }))
      .rejects.toThrow('socket hang up');
    expect(s.audit.record).not.toHaveBeenCalled();
  });

  it('konto zawieszone (SEC-2) → 400, nic nie idzie do DA', async () => {
    const s = stanowisko({ status: 'SUSPENDED' });
    await expect(s.svc.createHostingEmailAccount('s1', 'u1', { email: 'jan@firma.pl', password: 'Haslo1234' }))
      .rejects.toThrow('zawieszone');
    expect(s.post).not.toHaveBeenCalled();
  });

  it.each(['bez-malpy', '@firma.pl', 'jan@'])('adres %j bez user@domena → 400 przed DA (tworzenie i usuwanie)', async (email) => {
    const s = stanowisko();
    await expect(s.svc.createHostingEmailAccount('s1', 'u1', { email, password: 'Haslo1234' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.deleteHostingEmailAccount('s1', 'u1', email)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('usuwanie: dokładne pola; błąd DA → wyjątek i brak wpisu „usunięto” w audycie', async () => {
    const ok = stanowisko();
    await ok.svc.deleteHostingEmailAccount('s1', 'u1', 'jan@firma.pl');
    expect(ok.wyslane()).toEqual({ action: 'delete', user: 'jan', domain: 'firma.pl', api: 'yes' });
    expect(ok.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_EMAIL_DELETED' }));

    const zle = stanowisko({ post: { '/CMD_API_POP': 'error=1&text=Nie%20ma%20skrzynki' } });
    await expect(zle.svc.deleteHostingEmailAccount('s1', 'u1', 'jan@firma.pl')).rejects.toThrow('Nie ma skrzynki');
    expect(zle.audit.record).not.toHaveBeenCalled();
  });

  it('zmiana hasła zachowuje bieżący rozmiar skrzynki (DA modify wymaga quota — bez tego by ją wyzerował)', async () => {
    const s = stanowisko();
    vi.spyOn(s.svc, 'listHostingEmailAccounts').mockResolvedValue({
      rows: [{ id: 'jan@firma.pl', email: 'jan@firma.pl', quotaMb: 250 }], fetchError: null,
    });
    await s.svc.changeHostingEmailPassword('s1', 'u1', { email: 'jan@firma.pl', password: 'NoweHaslo1' });
    expect(s.wyslane()).toEqual({
      action: 'modify', user: 'jan', domain: 'firma.pl', passwd: 'NoweHaslo1', passwd2: 'NoweHaslo1', quota: '250', api: 'yes',
    });
  });

  it('zmiana hasła: krótsze niż 8 znaków → 400 przed DA', async () => {
    const s = stanowisko();
    await expect(s.svc.changeHostingEmailPassword('s1', 'u1', { email: 'jan@firma.pl', password: 'krotkie' }))
      .rejects.toThrow('8 znaków');
    expect(s.post).not.toHaveBeenCalled();
  });

  it('zmiana rozmiaru nie wysyła passwd — hasło klienta zostaje nietknięte', async () => {
    const s = stanowisko();
    await s.svc.changeHostingEmailQuota('s1', 'u1', { email: 'jan@firma.pl', quotaMb: 2048 });
    expect(s.wyslane()).toEqual({ action: 'modify', user: 'jan', domain: 'firma.pl', quota: '2048', api: 'yes' });
  });
});

describe('Poczta — przekierowania (CMD_API_EMAIL_FORWARDERS)', () => {
  it('normalizuje alias do lewej części i skleja adresy docelowe przecinkiem', async () => {
    const s = stanowisko();
    await s.svc.createHostingEmailForward('s1', 'u1', { name: ' Biuro@firma.pl ', destinations: 'a@x.pl; b@y.pl\nc@z.pl' });
    expect(s.wyslane()).toEqual({ action: 'create', domain: 'firma.pl', user: 'biuro', email: 'a@x.pl,b@y.pl,c@z.pl', api: 'yes' });
  });

  it.each([
    [{ name: 'biu ro', destinations: 'a@x.pl' }, 'aliasu'],
    [{ name: 'a/../b', destinations: 'a@x.pl' }, 'aliasu'],
    [{ name: 'biuro', destinations: 'nie-adres' }, 'docelowy'],
    [{ name: 'biuro', destinations: ' ; ' }, 'co najmniej jeden'],
  ])('odrzuca %j przed DA', async (input, fragment) => {
    const s = stanowisko();
    await expect(s.svc.createHostingEmailForward('s1', 'u1', input)).rejects.toThrow(fragment);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('usuwanie wskazuje tylko lokalną część aliasu (select0), małymi literami', async () => {
    const s = stanowisko();
    await s.svc.deleteHostingEmailForward('s1', 'u1', 'Biuro@firma.pl');
    expect(s.wyslane()).toEqual({ action: 'delete', domain: 'firma.pl', select0: 'biuro', api: 'yes' });
  });

  it('lista: błąd DA w JSON → fetchError, a nie alias o nazwie „error”', async () => {
    const zle = stanowisko({ get: { '/CMD_API_EMAIL_FORWARDERS': { error: '1', text: 'Brak uprawnień' } } });
    expect(await zle.svc.listHostingEmailForwarders('s1', 'u1')).toEqual({ rows: [], fetchError: 'Brak uprawnień' });

    const ok = stanowisko({ get: { '/CMD_API_EMAIL_FORWARDERS': { biuro: 'a@x.pl,b@y.pl' } } });
    expect((await ok.svc.listHostingEmailForwarders('s1', 'u1')).rows).toEqual([
      { id: 'biuro', name: 'biuro', email: 'biuro@firma.pl', destinations: ['a@x.pl', 'b@y.pl'] },
    ]);
  });
});

describe('Poczta — autorespondery (CMD_API_EMAIL_AUTORESPONDER)', () => {
  it('nowy autoresponder → create; kopia do adresu jako cc=ON + email', async () => {
    const s = stanowisko({ get: { '/CMD_API_EMAIL_AUTORESPONDER': {} } });
    await s.svc.setHostingAutoresponder('s1', 'u1', { name: 'Jan', text: 'Urlop do 5.10', cc: 'szef@firma.pl' });
    expect(s.wyslane()).toEqual({
      action: 'create', domain: 'firma.pl', user: 'jan', text: 'Urlop do 5.10', cc: 'ON', email: 'szef@firma.pl', api: 'yes',
    });
  });

  it('istniejący autoresponder → modify; bez kopii cc=OFF i bez pola email', async () => {
    const s = stanowisko({ get: { '/CMD_API_EMAIL_AUTORESPONDER': { jan: '' } } });
    await s.svc.setHostingAutoresponder('s1', 'u1', { name: 'jan', text: 'Wracam jutro' });
    expect(s.wyslane()).toEqual({ action: 'modify', domain: 'firma.pl', user: 'jan', text: 'Wracam jutro', cc: 'OFF', api: 'yes' });
  });

  it.each([
    [{ name: 'jan kowalski', text: 'x' }, 'Nieprawidłowa nazwa'],
    [{ name: 'jan', text: '   ' }, 'nie może być pusta'],
  ])('odrzuca %j przed DA', async (input, fragment) => {
    const s = stanowisko();
    await expect(s.svc.setHostingAutoresponder('s1', 'u1', input)).rejects.toThrow(fragment);
    expect(s.post).not.toHaveBeenCalled();
  });
});

describe('Poczta — catch-all i antyspam', () => {
  it('catch-all: adres docelowy walidowany; tryby blackhole/fail mapują się na tokeny DA', async () => {
    const s = stanowisko();
    await expect(s.svc.setHostingCatchAll('s1', 'u1', { mode: 'address', address: 'x\ny' })).rejects.toThrow('catch-all');
    expect(s.post).not.toHaveBeenCalled();

    await s.svc.setHostingCatchAll('s1', 'u1', { mode: 'address', address: 'kosz@firma.pl' });
    expect(s.wyslane(0)).toEqual({ domain: 'firma.pl', update: 'Update', catch: 'address', value: 'kosz@firma.pl', api: 'yes' });
    await s.svc.setHostingCatchAll('s1', 'u1', { mode: 'blackhole' });
    expect(s.wyslane(1).catch).toBe(':blackhole:');
    await s.svc.setHostingCatchAll('s1', 'u1', { mode: 'fail' });
    expect(s.wyslane(2).catch).toBe(':fail:');
  });

  it.each([
    ['5; rm -rf ~', '5'],
    ['abc', '5'],
    ['7.5', '7.5'],
  ])('antyspam: próg %j trafia do DA jako %j (tylko cyfry i kropka)', async (score, oczekiwany) => {
    const s = stanowisko({ get: { '/CMD_API_SPAMASSASSIN': { required_score: '5', where: 'spamfolder' } } });
    await s.svc.setHostingSpamFilter('s1', 'u1', { enabled: true, requiredScore: score });
    expect(s.wyslane()).toMatchObject({ action: 'save', is_on: 'yes', required_score: oczekiwany, where: 'spamfolder' });
  });

  it('antyspam wyłączony → action=disable; błąd DA → wyjątek bez audytu', async () => {
    const s = stanowisko();
    await s.svc.setHostingSpamFilter('s1', 'u1', { enabled: false });
    expect(s.wyslane()).toEqual({ action: 'disable', domain: 'firma.pl', api: 'yes' });

    const zle = stanowisko({ post: { '/CMD_API_SPAMASSASSIN': 'error=1&text=SpamAssassin%20wy%C5%82%C4%85czony' } });
    await expect(zle.svc.setHostingSpamFilter('s1', 'u1', { enabled: false })).rejects.toThrow('SpamAssassin wyłączony');
    expect(zle.audit.record).not.toHaveBeenCalled();
  });
});
