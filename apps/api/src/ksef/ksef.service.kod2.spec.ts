import { constants, verify } from 'node:crypto';
import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import { fakturaB2B, xmlFaktury } from '../test/faktury-ksef-testowe.js';
import { renderujFaktureKsefZTekstem } from './faktura-ksef-pdf.js';
import { skrotFakturyBase64Url, trescDoPodpisuKoduII } from './kod-qr-ksef.js';
import { KsefService } from './ksef.service.js';
import { wizualizacjaFa3 } from './wizualizacja-fa3.js';
import { wczytajCertyfikat } from './ksef-certyfikat.js';

/**
 * KSeF 07.11 — faktura offline ma na PDF-ie DWA kody QR (kody-qr.md): KOD I („OFFLINE” do czasu numeru)
 * i KOD II („CERTYFIKAT”) podpisany certyfikatem KSeF typu Offline z ustawień. Plus przypomnienia
 * o wygasających certyfikatach.
 */
const off = certyfikatTestowy({ uzycie: 'Offline', algorytm: 'RSA', numerSeryjnyHex: '0A0B0C0D' });

function serwis(certyfikatOffline: { pem: string; kluczPem: string } | null, certy: Record<string, unknown> = {}) {
  const powiadomienia: Array<{ title: string; severity: string }> = [];
  const prisma = {
    user: { findMany: async () => [{ id: 'admin' }] },
    notification: { createMany: async ({ data }: { data: Array<{ title: string; severity: string }> }) => void powiadomienia.push(...data) },
  };
  const settings = {
    getKsefRuntimeConfig: async () => ({ enabled: true, env: 'test', nip: '9292069367', token: '', metoda: 'certyfikat', certyfikatOffline }),
    getKsefSettings: async () => ({ enabled: true, env: 'test', nip: '9292069367', tokenSet: false, metoda: 'certyfikat', certyfikatUwierzytelniania: null, certyfikatOffline: null, ...certy }),
  };
  return { s: new KsefService(prisma as never, { get: () => undefined } as never, {} as never, settings as never), powiadomienia };
}

describe('KSeF – KOD II na fakturze offline', () => {
  const xml = xmlFaktury(fakturaB2B());
  const plik = { xml, sha256: skrotFakturyBase64Url(xml), srodowisko: 'test' as const };

  it('link KOD II: kontekst NIP z ustawień, NIP sprzedawcy z pliku, numer seryjny certyfikatu Offline, podpis RSA-PSS weryfikowalny', async () => {
    const link = (await serwis({ pem: off.certPem, kluczPem: off.kluczPem }).s.linkKoduII(plik))!;
    const dane = trescDoPodpisuKoduII('test', { typKontekstu: 'Nip', kontekst: '9292069367', nipSprzedawcy: '9292069367', numerSeryjny: '0A0B0C0D', skrot: plik.sha256 });
    expect(link.startsWith(`https://${dane}/`)).toBe(true);
    const podpis = Buffer.from(link.slice(`https://${dane}/`.length), 'base64url');
    expect(verify('sha256', Buffer.from(dane), { key: wczytajCertyfikat(off.certPem).x509.publicKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 32 }, podpis)).toBe(true);
  });

  it('bez certyfikatu Offline: brak KODU II (null), nie wymyślony link', async () => {
    expect(await serwis(null).s.linkKoduII(plik)).toBeNull();
  });

  it('PDF faktury offline: oba kody, napisy OFFLINE i CERTYFIKAT; faktura online – bez CERTYFIKAT', async () => {
    const wiz = wizualizacjaFa3(xml);
    const meta = { numerKsef: null, przyjetoWKsef: null, linkWeryfikacji: 'https://qr-test.ksef.mf.gov.pl/invoice/9292069367/12-10-2026/' + plik.sha256, srodowisko: 'test' as const };
    const offline = await renderujFaktureKsefZTekstem(wiz, { ...meta, linkCertyfikatu: 'https://qr-test.ksef.mf.gov.pl/certificate/Nip/9292069367/9292069367/0A0B0C0D/' + plik.sha256 + '/podpis' });
    expect(offline.teksty).toEqual(expect.arrayContaining(['OFFLINE', 'CERTYFIKAT']));
    const online = await renderujFaktureKsefZTekstem(wiz, meta);
    expect(online.teksty).not.toContain('CERTYFIKAT');
  });
});

describe('KSeF – przypomnienia o ważności certyfikatów', () => {
  const c = (dni: number) => ({ numerSeryjny: '01', waznyDo: '2026-12-01T00:00:00Z', dniDoWygasniecia: dni });
  it('progi 30/14/7/3/1/0 dni i po wygaśnięciu; poza progami cisza', async () => {
    const a = serwis(null, { certyfikatUwierzytelniania: c(14), certyfikatOffline: c(13) });
    expect(await a.s.sprawdzWaznoscPoswiadczen()).toEqual(['KSeF: certyfikat do uwierzytelnienia wygasa za 14 dni']);
    const b = serwis(null, { certyfikatUwierzytelniania: c(-2), certyfikatOffline: c(1) });
    expect(await b.s.sprawdzWaznoscPoswiadczen()).toEqual(['KSeF: certyfikat do uwierzytelnienia wygasł', 'KSeF: certyfikat Offline (KOD II) wygasa za 1 dzień']);
    expect(b.powiadomienia.map((p) => p.severity)).toEqual(['critical', 'critical']);
  });
});
