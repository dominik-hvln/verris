import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import { PlatformSettingsService } from './platform-settings.service.js';
import { ocenPoswiadczenKsef } from '../admin-readiness/live-readiness.service.js';

/**
 * KSeF 07.11 — certyfikat KSeF w Ustawienia → Firma → KSeF: klucz prywatny zapisany WYŁĄCZNIE zaszyfrowany
 * (jak token), hasło nigdzie, odpowiedź i dziennik bez klucza; walidacja daty i typu certyfikatu.
 */
function usluga() {
  const wiersze = new Map<string, string>([['faktury.tryb', 'panel']]);
  const audyt: Array<{ action: string; details?: unknown }> = [];
  const prisma = {
    invoice: { count: async () => 0, findMany: async () => [] },
    platformSetting: {
      findMany: async () => [...wiersze].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, update }: { where: { key: string }; update: { value: string } }) => {
        wiersze.set(where.key, update.value);
      },
    },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  };
  const crypto = {
    encrypt: (t: string) => `enc:${Buffer.from(t).toString('base64')}`,
    decrypt: (t: string) => Buffer.from(t.slice(4), 'base64').toString(),
  };
  const s = new PlatformSettingsService(prisma as never, { record: async (a: { action: string }) => void audyt.push(a) } as never, crypto as never);
  return { s, wiersze, audyt };
}

describe('KSeF – certyfikat w ustawieniach', () => {
  const auth = certyfikatTestowy({ uzycie: 'Authentication' });
  const off = certyfikatTestowy({ uzycie: 'Offline', algorytm: 'EC', numerSeryjnyHex: '0A0B0C' });

  it('wgranie (klucz z hasłem): klucz w bazie tylko zaszyfrowany, bez hasła; odpowiedź i dziennik bez klucza', async () => {
    const { s, wiersze, audyt } = usluga();
    const wynik = await s.wgrajCertyfikatKsef(
      { rodzaj: 'uwierzytelnianie', certyfikat: auth.certPem, klucz: auth.kluczPemZHaslem('haslo-123'), haslo: 'haslo-123' },
      'admin-1',
    );
    expect(wynik.ustawienia.certyfikatUwierzytelniania).toMatchObject({ numerSeryjny: '01F20A5D352AE590', algorytm: 'RSA', typIdentyfikatora: 'certificateSubject' });
    const zapisane = [...wiersze.values()].join('\n');
    expect(zapisane).not.toContain('PRIVATE KEY');
    expect(zapisane).not.toContain('haslo-123');
    expect(wiersze.get('ksef.certAuthKluczEnc')).toMatch(/^enc:/);
    const odpowiedz = JSON.stringify(wynik) + JSON.stringify(audyt);
    expect(odpowiedz).not.toContain('PRIVATE KEY');
    expect(odpowiedz).not.toContain('haslo-123');
    expect(audyt.map((a) => a.action)).toEqual(['KSEF_CERTYFIKAT_WGRANY']);
    // Runtime (tylko KsefService): klucz odszyfrowany, bez hasła.
    const rt = await s.getKsefRuntimeConfig();
    expect(rt.certyfikat?.kluczPem).toContain('-----BEGIN PRIVATE KEY-----');
  });

  it('złe hasło, klucz od innego certyfikatu, certyfikat Authentication w miejscu Offline: 400 z polskim powodem, nic nie zapisane', async () => {
    const { s, wiersze } = usluga();
    await expect(s.wgrajCertyfikatKsef({ rodzaj: 'uwierzytelnianie', certyfikat: auth.certPem, klucz: auth.kluczPemZHaslem('a'), haslo: 'b' }, 'x')).rejects.toThrow(/hasło/);
    await expect(s.wgrajCertyfikatKsef({ rodzaj: 'uwierzytelnianie', certyfikat: auth.certPem, klucz: off.kluczPem }, 'x')).rejects.toThrow(/nie pasuje/);
    await expect(s.wgrajCertyfikatKsef({ rodzaj: 'offline', certyfikat: auth.certPem, klucz: auth.kluczPem }, 'x')).rejects.toThrow(/typu Offline/);
    expect(wiersze.has('ksef.certAuthPem')).toBe(false);
  });

  it('metoda „certyfikat” bez wgranego certyfikatu: włączenie odrzucone; po wgraniu – zapisane', async () => {
    const { s, wiersze } = usluga();
    await expect(s.updateKsefSettings({ enabled: true, env: 'test', nip: '9292069367', metoda: 'certyfikat' }, 'a')).rejects.toThrow(/wgranego certyfikatu/);
    await s.wgrajCertyfikatKsef({ rodzaj: 'uwierzytelnianie', certyfikat: auth.certPem, klucz: auth.kluczPem, typIdentyfikatora: 'certificateFingerprint' }, 'a');
    const k = await s.updateKsefSettings({ enabled: true, env: 'test', nip: '9292069367', metoda: 'certyfikat' }, 'a');
    expect(k.metoda).toBe('certyfikat');
    expect(wiersze.get('ksef.certAuthTyp')).toBe('certificateFingerprint');
    // Certyfikatu w użyciu nie da się usunąć.
    await expect(s.usunCertyfikatKsef('uwierzytelnianie', 'a')).rejects.toThrow(/najpierw przełącz/);
    await s.wgrajCertyfikatKsef({ rodzaj: 'offline', certyfikat: off.certPem, klucz: off.kluczPem }, 'a');
    expect((await s.usunCertyfikatKsef('offline', 'a')).certyfikatOffline).toBeNull();
  });
});

describe('KSeF – go/no-go: poświadczenia', () => {
  const cert = (dni: number) => ({ podmiot: 'x', wystawca: 'y', numerSeryjny: '01', waznyOd: '2026-01-01T00:00:00Z', waznyDo: '2027-01-01T00:00:00Z', odciskSha256: 'a', algorytm: 'EC' as const, dniDoWygasniecia: dni });
  it('token = ostrzeżenie (tokeny przed startem sprzedaży); wygasły certyfikat = fail; < 30 dni = warn; brak Offline = fail', () => {
    expect(ocenPoswiadczenKsef({ enabled: true, metoda: 'token', tokenSet: true, certyfikatUwierzytelniania: null, certyfikatOffline: cert(200) }).map((o) => o.status)).toEqual(['warn', 'ok']);
    expect(ocenPoswiadczenKsef({ enabled: true, metoda: 'certyfikat', tokenSet: false, certyfikatUwierzytelniania: cert(-1), certyfikatOffline: null }).map((o) => o.status)).toEqual(['fail', 'fail']);
    expect(ocenPoswiadczenKsef({ enabled: true, metoda: 'certyfikat', tokenSet: false, certyfikatUwierzytelniania: cert(10), certyfikatOffline: cert(100) }).map((o) => o.status)).toEqual(['warn', 'ok']);
    expect(ocenPoswiadczenKsef({ enabled: false, metoda: 'token', tokenSet: false, certyfikatUwierzytelniania: null, certyfikatOffline: null })).toEqual([]);
  });
});
