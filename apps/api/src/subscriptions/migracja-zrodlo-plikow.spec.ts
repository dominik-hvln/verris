import { BadRequestException } from '@nestjs/common';

vi.mock('./migration-net.util.js', () => ({
  resolvePublicHost: vi.fn(async (host: string) => {
    if (host.endsWith('.wewn')) throw new BadRequestException('Host wskazuje na sieć prywatną — odrzucono.');
    return '203.0.113.5';
  }),
}));

import { BladLogowania, MigracjaZrodloPlikowService, kolejnoscProb, normalizujSciezke, type Polacz } from './migracja-zrodlo-plikow.service.js';

/**
 * 14.10 (uwagi Dominika po e2e PB-45): bez wybierania protokołu — test połączenia próbuje SFTP → FTPS → FTP,
 * pokazuje czym skopiujemy (rsync?), a podgląd katalogów podstawia dane bazy z pliku konfiguracyjnego CMS-a.
 */
const dostep = { host: 'ftp.stary.pl', username: 'konto', password: 'tajne' };
const kto = { userId: 'u1', actorUserId: 'u1', subscriptionId: 's1' };

function zbuduj(zachowanie: Record<string, 'ok' | 'auth' | 'brak'>, opcje: { rsync?: boolean; pliki?: Record<string, string>; katalog?: { katalogi: string[]; pliki: string[] } } = {}) {
  const audit = { record: vi.fn() };
  const svc = new MigracjaZrodloPlikowService(audit as never);
  const zamkniete: string[] = [];
  const odczytane: string[] = [];
  const wywolania: string[] = [];
  const polacz: Polacz = async (o) => {
    const klucz = `${o.protocol}:${o.port}`;
    wywolania.push(`${klucz}@${o.ip}`);
    const z = zachowanie[klucz] ?? 'brak';
    if (z === 'brak') throw new Error('connect ECONNREFUSED');
    if (z === 'auth') throw new BladLogowania('Serwer odrzucił login lub hasło.');
    return {
      listuj: async () => opcje.katalog ?? { katalogi: [], pliki: [] },
      czytaj: async (sciezka) => {
        odczytane.push(sciezka);
        return opcje.pliki?.[sciezka] ?? null;
      },
      rsync: async () => !!opcje.rsync,
      zamknij: () => zamkniete.push(klucz),
    };
  };
  svc.polacz = polacz;
  return { svc, audit, zamkniete, odczytane, wywolania };
}

describe('kolejność prób', () => {
  it('bez portu: SFTP 22 → FTPS 21 → FTP 21; port 21: najpierw FTP-y; nietypowy port: najpierw on', () => {
    expect(kolejnoscProb({})).toEqual([
      { protocol: 'sftp', port: 22 },
      { protocol: 'ftps', port: 21 },
      { protocol: 'ftp', port: 21 },
    ]);
    expect(kolejnoscProb({ port: 21 }).map((p) => `${p.protocol}:${p.port}`)).toEqual(['ftps:21', 'ftp:21', 'sftp:22']);
    expect(kolejnoscProb({ port: 2222 }).map((p) => `${p.protocol}:${p.port}`)).toEqual([
      'sftp:2222', 'ftps:2222', 'ftp:2222', 'sftp:22', 'ftps:21', 'ftp:21',
    ]);
    expect(kolejnoscProb({ protocol: 'ftps' })).toEqual([{ protocol: 'ftps', port: 21 }]);
  });
});

describe('test połączenia plików', () => {
  it('SFTP nie odpowiada, FTPS działa → FTPS, bez rsync, łączymy się z rozwiązanym IP, sesja zamknięta, wpis w dzienniku', async () => {
    const s = zbuduj({ 'ftps:21': 'ok' });
    const w = await s.svc.testPolaczenia(dostep, kto);
    expect(w).toMatchObject({ ok: true, protocol: 'ftps', port: 21, rsync: false, nieszyfrowane: false, metoda: 'FTPS (FTP z szyfrowaniem)' });
    expect(w.proby.map((p) => `${p.protocol}:${p.port}:${p.status}`)).toEqual(['sftp:22:unreachable', 'ftps:21:ok']);
    expect(s.wywolania).toEqual(['sftp:22@203.0.113.5', 'ftps:21@203.0.113.5']);
    expect(s.zamkniete).toEqual(['ftps:21']);
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ rodzaj: 'test-polaczenia-plikow', ok: true }) }));
  });

  it('SFTP z rsync → „SFTP + rsync”; samo FTP → ostrzeżenie o braku szyfrowania', async () => {
    const a = await zbuduj({ 'sftp:22': 'ok' }, { rsync: true }).svc.testPolaczenia(dostep, kto);
    expect(a).toMatchObject({ protocol: 'sftp', rsync: true, metoda: 'SFTP + rsync — najszybciej, z dosyłaniem zmian' });
    const b = await zbuduj({ 'ftp:21': 'ok' }).svc.testPolaczenia(dostep, kto);
    expect(b).toMatchObject({ protocol: 'ftp', nieszyfrowane: true });
  });

  it('SFTP odrzuca hasło, reszta nie odpowiada → „odrzucił login lub hasło” (ważniejsze niż brak połączenia)', async () => {
    const w = await zbuduj({ 'sftp:22': 'auth' }).svc.testPolaczenia(dostep, kto);
    expect(w).toMatchObject({ ok: false, metoda: 'Serwer odrzucił login lub hasło' });
    expect(w.proby[0]).toMatchObject({ protocol: 'sftp', status: 'auth_failed' });
  });

  it('nic nie działa → ok:false, bez protokołu', async () => {
    const w = await zbuduj({}).svc.testPolaczenia(dostep, kto);
    expect(w).toMatchObject({ ok: false, protocol: null, metoda: 'Nie udało się połączyć żadnym sposobem' });
    expect(w.proby).toHaveLength(3);
  });

  it('host prywatny / serwer Verris → odmowa przed jakimkolwiek połączeniem', async () => {
    const s = zbuduj({ 'sftp:22': 'ok' });
    await expect(s.svc.testPolaczenia({ ...dostep, host: 'baza.wewn' }, kto)).rejects.toThrow(BadRequestException);
    expect(s.wywolania).toEqual([]);
  });
});

describe('podgląd katalogów', () => {
  const wp = `<?php define('DB_NAME','sklep'); define('DB_USER','sklepu'); define('DB_PASSWORD','h@slo'); define('DB_HOST','localhost');`;
  const katalog = { katalogi: ['wp-admin', 'wp-content', 'wp-includes'], pliki: ['index.php', 'wp-config.php'] };

  it('WordPress w katalogu: strona, CMS i dane bazy (localhost → host plików); hasło tylko dla klienta', async () => {
    const s = zbuduj({ 'sftp:22': 'ok' }, { katalog, pliki: { '/public_html/wp-config.php': wp } });
    const klient = await s.svc.katalogi({ ...dostep, protocol: 'sftp', sciezka: '//public_html/./' }, { zHaslemBazy: true });
    expect(klient).toEqual({
      sciezka: '/public_html',
      katalogi: ['wp-admin', 'wp-content', 'wp-includes'],
      uciete: false,
      strona: true,
      cms: { cms: 'wordpress', nazwa: 'WordPress', plik: 'wp-config.php' },
      baza: { host: 'ftp.stary.pl', port: null, nazwa: 'sklep', uzytkownik: 'sklepu', haslo: 'h@slo', hasloZPliku: true },
    });
    expect(s.zamkniete).toEqual(['sftp:22']);

    const obsluga = await zbuduj({ 'sftp:22': 'ok' }, { katalog, pliki: { '/public_html/wp-config.php': wp } }).svc.katalogi(
      { ...dostep, protocol: 'sftp', sciezka: '/public_html' },
      { zHaslemBazy: false },
    );
    expect(obsluga.baza).toEqual({ host: 'ftp.stary.pl', port: null, nazwa: 'sklep', uzytkownik: 'sklepu', hasloZPliku: true });
  });

  it('PrestaShop bez parameters.php → settings.inc.php (1.6); katalog bez CMS → tylko lista', async () => {
    const ps = zbuduj(
      { 'ftps:21': 'ok' },
      {
        katalog: { katalogi: ['app', 'classes', 'config', 'modules', 'themes'], pliki: ['index.php'] },
        pliki: { '/sklep/config/settings.inc.php': `<?php define('_DB_SERVER_','mysql.stary.pl'); define('_DB_NAME_','ps'); define('_DB_USER_','psu'); define('_DB_PASSWD_','x');` },
      },
    );
    const w = await ps.svc.katalogi({ ...dostep, protocol: 'ftps', sciezka: '/sklep' }, { zHaslemBazy: false });
    expect(ps.odczytane).toEqual(['/sklep/app/config/parameters.php', '/sklep/config/settings.inc.php']);
    expect(w.cms?.cms).toBe('prestashop16');
    expect(w.baza).toMatchObject({ host: 'mysql.stary.pl', nazwa: 'ps' });

    const pusty = await zbuduj({ 'sftp:22': 'ok' }, { katalog: { katalogi: ['domains', 'mail'], pliki: [] } }).svc.katalogi(
      { ...dostep, protocol: 'sftp', sciezka: '/' },
      { zHaslemBazy: true },
    );
    expect(pusty).toMatchObject({ sciezka: '/', katalogi: ['domains', 'mail'], strona: false, cms: null, baza: null });
  });

  it('ścieżka z „..” → odmowa', () => {
    expect(() => normalizujSciezke('/public_html/../etc')).toThrow(BadRequestException);
  });
});
