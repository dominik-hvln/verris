import { X509Certificate, constants, verify } from 'node:crypto';
import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import {
  BladCertyfikatuKsef,
  issuerSerialV2,
  opisCertyfikatu,
  podpiszKodII,
  sprawdzPareKsef,
  wczytajCertyfikat,
  wczytajKluczPrywatny,
} from './ksef-certyfikat.js';

/**
 * KSeF 07.11 — certyfikat KSeF i klucz prywatny (certyfikaty-KSeF.md, auth/podpis-xades.md, kody-qr.md).
 * Do dziś panel nie umiał wczytać certyfikatu w ogóle — jedyną metodą był token KSeF.
 */
describe('KSeF – certyfikat i klucz', () => {
  const auth = certyfikatTestowy({ uzycie: 'Authentication' });
  const offline = certyfikatTestowy({ uzycie: 'Offline', algorytm: 'EC', numerSeryjnyHex: '0A0B0C' });

  it('czyta certyfikat z PEM i z DER w Base64 (np. plik .cer); opis: numer seryjny HEX, odcisk SHA-256, keyUsage', () => {
    const zPem = wczytajCertyfikat(auth.certPem);
    const zDer = wczytajCertyfikat(auth.derB64);
    expect(zDer.der.equals(zPem.der)).toBe(true);
    const o = opisCertyfikatu(zPem);
    expect(o).toMatchObject({ numerSeryjny: '01F20A5D352AE590', algorytm: 'RSA', uzycieKlucza: { podpisCyfrowy: true, niezaprzeczalnosc: false } });
    expect(o.podmiot).toContain('TINPL-9292069367');
    expect(o.odciskSha256).toBe(new X509Certificate(zPem.der).fingerprint256.replace(/:/g, '').toLowerCase());
    expect(opisCertyfikatu(wczytajCertyfikat(offline.certPem)).uzycieKlucza).toEqual({ podpisCyfrowy: false, niezaprzeczalnosc: true });
    expect(() => wczytajCertyfikat('to nie certyfikat')).toThrow(BladCertyfikatuKsef);
  });

  it('klucz zaszyfrowany hasłem (PKCS#8 jak z Aplikacji Podatnika): dobre hasło – odczyt, złe – czytelny błąd', () => {
    const pem = auth.kluczPemZHaslem('tajne-haslo');
    expect(pem).toContain('ENCRYPTED PRIVATE KEY');
    expect(wczytajKluczPrywatny(pem, 'tajne-haslo').asymmetricKeyType).toBe('rsa');
    expect(() => wczytajKluczPrywatny(pem, 'zle')).toThrow(/hasło/);
    expect(() => wczytajKluczPrywatny(pem)).toThrow(/hasło/);
    // DER PKCS#8 bez hasła (Base64) też działa.
    const derB64 = auth.klucz.export({ type: 'pkcs8', format: 'der' }).toString('base64');
    expect(wczytajKluczPrywatny(derB64).asymmetricKeyType).toBe('rsa');
  });

  it('para: klucz musi pasować do certyfikatu; wygasły certyfikat odrzucony; krótko ważny – ostrzeżenie', () => {
    const inny = certyfikatTestowy();
    expect(() => sprawdzPareKsef(wczytajCertyfikat(auth.certPem), inny.klucz, 'uwierzytelnianie')).toThrow(/nie pasuje/);
    const stary = certyfikatTestowy({ od: new Date('2025-01-01'), do: new Date('2025-06-01') });
    expect(() => sprawdzPareKsef(wczytajCertyfikat(stary.certPem), stary.klucz, 'uwierzytelnianie')).toThrow(/wygasł/);
    const krotki = certyfikatTestowy({ do: new Date(Date.now() + 10 * 86_400_000) });
    expect(sprawdzPareKsef(wczytajCertyfikat(krotki.certPem), krotki.klucz, 'uwierzytelnianie').ostrzezenia.join(' ')).toMatch(/wygasa za 9 dni/);
  });

  it('KOD II tylko certyfikatem typu Offline (Non-Repudiation); Authentication odrzucony w tym miejscu (kody-qr.md)', () => {
    expect(() => sprawdzPareKsef(wczytajCertyfikat(auth.certPem), auth.klucz, 'offline')).toThrow(/typu Offline/);
    expect(sprawdzPareKsef(wczytajCertyfikat(offline.certPem), offline.klucz, 'offline').opis.algorytm).toBe('EC');
    // Certyfikat Offline wydany przez KSeF nie loguje (certyfikaty-KSeF.md: „Nie umożliwia uwierzytelnienia”).
    const offKsef = certyfikatTestowy({ uzycie: 'Offline', wystawca: [['CN', 'KSeF CA TEST'], ['C', 'PL']] });
    expect(() => sprawdzPareKsef(wczytajCertyfikat(offKsef.certPem), offKsef.klucz, 'uwierzytelnianie')).toThrow(/Authentication/);
  });

  it('klucz RSA krótszy niż 2048 bitów odrzucony (auth/podpis-xades.md: minimum 2048)', () => {
    const slaby = certyfikatTestowy({ bityRsa: 1024 });
    expect(() => sprawdzPareKsef(wczytajCertyfikat(slaby.certPem), slaby.klucz, 'uwierzytelnianie')).toThrow(/2048/);
  });

  it('IssuerSerialV2: DER SEQUENCE { GeneralNames { [4] Name wystawcy }, numer seryjny } z bajtów certyfikatu', () => {
    const c = wczytajCertyfikat(auth.certPem);
    const d = Buffer.from(issuerSerialV2(c), 'base64');
    expect(d[0]).toBe(0x30);
    const hex = d.toString('hex');
    // [4] (0xa4) z nazwą wystawcy (samopodpisany: wystawca = podmiot, z „TINPL-9292069367”) i INTEGER 01F20A5D352AE590.
    expect(hex).toContain('a4');
    expect(hex).toContain(Buffer.from('TINPL-9292069367').toString('hex'));
    expect(hex.endsWith('020801f20a5d352ae590')).toBe(true);
  });

  it('podpis KODU II: RSASSA-PSS SHA-256 z solą 32 bajty; ECDSA P-256 w formacie IEEE P1363 (64 bajty)', () => {
    const dane = Buffer.from('qr-test.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE');
    const rsa = podpiszKodII(auth.klucz, dane);
    expect(verify('sha256', dane, { key: wczytajCertyfikat(auth.certPem).x509.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, rsa)).toBe(true);
    const ec = podpiszKodII(offline.klucz, dane);
    expect(ec).toHaveLength(64);
    expect(verify('sha256', dane, { key: wczytajCertyfikat(offline.certPem).x509.publicKey, dsaEncoding: 'ieee-p1363' }, ec)).toBe(true);
  });
});
