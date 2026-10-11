import { DirectAdminClient, parseEmailBlacklist } from '@verris/directadmin-sdk';
import { DirectAdminService } from './directadmin.service.js';

/**
 * F3.1 (D4) — blokada wysyłki konta na węźle wg dokumentacji DirectAdmina (changelog 1.60.0 „Admin Settings: JSON:
 * Manage E-Mail blacklist_usernames…”): odczyt CMD_ADMIN_SETTINGS?json=yes → email_settings, zapis POST
 * CMD_ADMIN_SETTINGS action=add_to_email_blacklist|remove_from_email_blacklist, blacklist_usernames=yes, select0.
 * Sukces dopiero, gdy ponowny odczyt listy potwierdza zmianę; węzeł bez obsługi listy = błąd, bez zapisu.
 */
type Odp = { data: unknown };
const ustawienia = (lista: Record<string, string> | string[], dostepne = 'yes') => ({
  email_settings: { HAVE_BLACKLIST_USERNAMES: dostepne, blacklist_usernames: lista, blacklist_smtp_usernames: {}, blacklist_script_usernames: {} },
  ns1: 'ns1.verris.test',
});

function wezel(o: { dostepne?: string; ignorujZapis?: boolean; odpowiedzZapisu?: unknown; odpowiedzOdczytu?: unknown } = {}) {
  const lista: Record<string, string> = {};
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, string> }): Promise<Odp> => {
    expect(path).toBe('/CMD_ADMIN_SETTINGS');
    expect(cfg?.params).toEqual({ json: 'yes' });
    return { data: o.odpowiedzOdczytu ?? ustawienia({ ...lista }, o.dostepne ?? 'yes') };
  });
  const post = vi.fn(async (path: string, body: string): Promise<Odp> => {
    expect(path).toBe('/CMD_ADMIN_SETTINGS');
    const p = new URLSearchParams(body);
    if (!o.ignorujZapis) {
      if (p.get('action') === 'add_to_email_blacklist') lista[p.get('select0')!] = '1760090000';
      if (p.get('action') === 'remove_from_email_blacklist') delete lista[p.get('select0')!];
    }
    return { data: o.odpowiedzZapisu ?? { success: 'Saved', result: '' } };
  });
  const klient = new DirectAdminClient({ host: 'da.test', port: 2222, username: 'admin', loginKey: 'x', secure: true });
  Object.assign(klient, { client: { get, post } });
  const svc = new DirectAdminService({} as never, {} as never, {} as never, {} as never);
  vi.spyOn(svc, 'getClientForServer').mockResolvedValue(klient);
  return { svc, get, post, lista, wyslane: (n = 0) => Object.fromEntries(new URLSearchParams(String(post.mock.calls[n]?.[1] ?? ''))) };
}

describe('parseEmailBlacklist', () => {
  it('obiekt {"user": "czas"} albo tablica; brak sekcji → pusta lista i niedostępna', () => {
    expect(parseEmailBlacklist(ustawienia({ emailtest: '1579479488' }))).toEqual({ dostepne: true, uzytkownicy: ['emailtest'] });
    expect(parseEmailBlacklist(ustawienia(['fred']))).toEqual({ dostepne: true, uzytkownicy: ['fred'] });
    expect(parseEmailBlacklist({ ns1: 'x' })).toEqual({ dostepne: false, uzytkownicy: [] });
    expect(parseEmailBlacklist('<html>')).toEqual({ dostepne: false, uzytkownicy: [] });
  });
});

describe('F3.1 — blokada wysyłki konta na węźle (DirectAdmin blacklist_usernames)', () => {
  it('blokada: dokładnie ciało z dokumentacji, potem potwierdzenie odczytem', async () => {
    const { svc, post, get, wyslane, lista } = wezel();
    expect(await svc.ustawBlokadeWysylki('w1', 'klient1', true)).toEqual({ zmieniono: true });
    expect(post).toHaveBeenCalledTimes(1);
    expect(wyslane()).toEqual({ json: 'yes', action: 'add_to_email_blacklist', blacklist_usernames: 'yes', select0: 'klient1' });
    expect(Object.keys(lista)).toEqual(['klient1']);
    expect(get.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(await svc.blokadaWysylkiNaWezle('w1', 'klient1')).toEqual({ obslugiwana: true, zablokowana: true });
  });

  it('zwolnienie: remove_from_email_blacklist; blokada SMTP/skryptów (pozostałe listy) nie jest ruszana', async () => {
    const { svc, wyslane } = wezel();
    await svc.ustawBlokadeWysylki('w1', 'klient1', true);
    expect(await svc.ustawBlokadeWysylki('w1', 'klient1', false)).toEqual({ zmieniono: true });
    expect(wyslane(1)).toEqual({ json: 'yes', action: 'remove_from_email_blacklist', blacklist_usernames: 'yes', select0: 'klient1' });
    expect(await svc.blokadaWysylkiNaWezle('w1', 'klient1')).toEqual({ obslugiwana: true, zablokowana: false });
  });

  it('idempotentnie: stan już taki → bez zapisu', async () => {
    const { svc, post } = wezel();
    await svc.ustawBlokadeWysylki('w1', 'klient1', true);
    expect(await svc.ustawBlokadeWysylki('w1', 'klient1', true)).toEqual({ zmieniono: false });
    expect(await svc.ustawBlokadeWysylki('w1', 'inny', false)).toEqual({ zmieniono: false });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('węzeł bez HAVE_BLACKLIST_USERNAMES → błąd, bez zapisu', async () => {
    const { svc, post } = wezel({ dostepne: 'no' });
    await expect(svc.ustawBlokadeWysylki('w1', 'klient1', true)).rejects.toThrow(/nie obsługuje blokady wysyłki/);
    expect(post).not.toHaveBeenCalled();
  });

  it('DA odpowiada bez błędu, ale lista się nie zmienia → błąd (nie sukces)', async () => {
    const { svc } = wezel({ ignorujZapis: true });
    await expect(svc.ustawBlokadeWysylki('w1', 'klient1', true)).rejects.toThrow(/nie potwierdził blokady/);
  });

  it('błąd DA w odpowiedzi zapisu i strona HTML → błąd', async () => {
    await expect(wezel({ odpowiedzZapisu: { error: '1', text: 'Nie znaleziono użytkownika' } }).svc.ustawBlokadeWysylki('w1', 'klient1', true)).rejects.toThrow(
      /Nie znaleziono użytkownika/,
    );
    await expect(wezel({ odpowiedzZapisu: '<html>login</html>' }).svc.ustawBlokadeWysylki('w1', 'klient1', true)).rejects.toThrow(/HTML/);
  });

  it('nazwa użytkownika spoza formatu DA → odmowa przed zapisem', async () => {
    const { svc, post } = wezel();
    await expect(svc.ustawBlokadeWysylki('w1', 'klient1&select1=admin', true)).rejects.toThrow(/Niepoprawna nazwa/);
    expect(post).not.toHaveBeenCalled();
  });

  it('audyt Fal 2: odczyt listy dostaje HTML albo tekst zamiast JSON → błąd węzła, nie „nie obsługuje” / „nie zablokowane”', async () => {
    const html = wezel({ odpowiedzOdczytu: '<!DOCTYPE html><html><body>Login</body></html>' });
    await expect(html.svc.blokadaWysylkiNaWezle('w1', 'klient1')).rejects.toThrow(/stroną HTML/);
    await expect(html.svc.ustawBlokadeWysylki('w1', 'klient1', true)).rejects.toThrow(/stroną HTML/);
    expect(html.post).not.toHaveBeenCalled();
    await expect(wezel({ odpowiedzOdczytu: 'Unauthorized' }).svc.blokadaWysylkiNaWezle('w1', 'klient1')).rejects.toThrow(/bez JSON/);
    // Tekstowy błąd DA (error=1) — z treścią DA.
    await expect(wezel({ odpowiedzOdczytu: 'error=1&text=Brak%20uprawnie%C5%84' }).svc.blokadaWysylkiNaWezle('w1', 'klient1')).rejects.toThrow(/Brak uprawnień/);
  });
});
