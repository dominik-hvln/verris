import { constants, verify } from 'node:crypto';
import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import { fakturaB2B, NIP_SPRZEDAWCY, xmlFaktury } from '../test/faktury-ksef-testowe.js';
import { podpiszKodII, wczytajCertyfikat } from './ksef-certyfikat.js';
import { daneLinkuZPliku, linkKoduII, PODPIS_QR_CERTYFIKAT, trescDoPodpisuKoduII } from './kod-qr-ksef.js';

/**
 * KSeF 07.11 — KOD II (faktura offline) wg https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md („2. KOD II”).
 * Do dziś panel nie umiał go zbudować („KOD II jest POZA zakresem”), więc faktura offline miała tylko KOD I.
 */

// Przykład z dokumentacji MF (sekcja „Generowanie linku” w KODZIE II).
const PRZYKLAD = {
  typKontekstu: 'Nip' as const,
  kontekst: '1111111111',
  nipSprzedawcy: '1111111111',
  numerSeryjny: '01F20A5D352AE590',
  skrot: 'UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE',
};
const PODPIS_MF =
  'mSkm_XmM9fq7PgAJwiL32L9ujhyguOEV48cDB0ncemD2r9TMGa3lr0iRoFk588agCi8QPsOuscUY1rZ7ff76STbGquO-gZtQys5_fHdf2HUfDqPqVTnUS6HknBu0zLkyf9ygoW7WbH06Ty_8BgQTlOmJFzNWSt9WZa7tAGuAE9JOooNps-KG2PYkkIP4q4jPMp3FKypAygHVnXtS0RDGgOxhhM7LWtFP7D-dWINbh5yXD8Lr-JVbeOpyQjHa6WmMYavCDQJ3X_Z-iS01LZu2s1B3xuOykl1h0sLObCdADrbxOONsXrvQa61Xt_rxyprVraj2Uf9pANQgR4-12HEcMw';
const LINK_MF = `https://qr-test.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE/${PODPIS_MF}`;

describe('KSeF 07.11 – KOD II (weryfikacja certyfikatu wystawcy)', () => {
  it('podpisywany ciąg: ścieżka bez https:// i bez końcowego „/” — dokładnie jak w dokumentacji', () => {
    expect(trescDoPodpisuKoduII('test', PRZYKLAD)).toBe(
      'qr-test.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/UtQp9Gpc51y-u3xApZjIjgkpZ01js-J8KflSPW8WzIE',
    );
  });

  it('link z przykładu MF: ten sam ciąg + podpis w Base64URL (podpis z dokumentacji podstawiony)', () => {
    let podpisane: string | null = null;
    const link = linkKoduII('test', PRZYKLAD, (dane) => {
      podpisane = dane.toString('utf8');
      return Buffer.from(PODPIS_MF, 'base64url');
    });
    expect(link).toBe(LINK_MF);
    expect(podpisane).toBe(trescDoPodpisuKoduII('test', PRZYKLAD));
  });

  it.each([['RSA', 'RSA' as const], ['EC P-256', 'EC' as const]])('%s: podpis w linku weryfikuje się kluczem publicznym certyfikatu Offline', (_n, algorytm) => {
    const t = certyfikatTestowy({ algorytm, uzycie: 'Offline' });
    const link = linkKoduII('prod', PRZYKLAD, (d) => podpiszKodII(t.klucz, d));
    expect(link.startsWith('https://qr.ksef.mf.gov.pl/certificate/Nip/1111111111/1111111111/01F20A5D352AE590/')).toBe(true);
    const podpis = Buffer.from(link.split('/').at(-1)!, 'base64url');
    const klucz = wczytajCertyfikat(t.certPem).x509.publicKey;
    const dane = Buffer.from(trescDoPodpisuKoduII('prod', PRZYKLAD));
    const ok =
      algorytm === 'RSA'
        ? verify('sha256', dane, { key: klucz, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, podpis)
        : verify('sha256', dane, { key: klucz, dsaEncoding: 'ieee-p1363' }, podpis);
    expect(ok).toBe(true);
  });

  it('napis pod kodem: CERTYFIKAT; złe dane odrzucone przed podpisem', () => {
    expect(PODPIS_QR_CERTYFIKAT).toBe('CERTYFIKAT');
    expect(() => trescDoPodpisuKoduII('test', { ...PRZYKLAD, kontekst: '12' })).toThrow(/10 cyfr/);
    expect(() => trescDoPodpisuKoduII('test', { ...PRZYKLAD, numerSeryjny: '01f2' })).toThrow(/szesnastkowy/);
    expect(() => trescDoPodpisuKoduII('test', { ...PRZYKLAD, skrot: 'abc' })).toThrow(/Base64URL/);
  });

  it('NIP sprzedawcy i P_1 do linków czytane z zapisanego pliku FA(3)', () => {
    expect(daneLinkuZPliku(xmlFaktury(fakturaB2B()))).toEqual({ nipSprzedawcy: NIP_SPRZEDAWCY, dataWystawienia: '2026-10-12' });
    expect(() => daneLinkuZPliku('<Faktura/>')).toThrow(/Podmiot1/);
  });
});
