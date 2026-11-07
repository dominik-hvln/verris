import {
  X509Certificate,
  createHash,
  createPrivateKey,
  sign,
  constants as cryptoConstants,
  type KeyObject,
} from 'crypto';

/**
 * Certyfikat KSeF i jego klucz prywatny — odczyt, walidacja i podpis.
 *
 * Wg oficjalnej dokumentacji MF:
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/certyfikaty-KSeF.md — dwa typy certyfikatu KSeF:
 *    `Authentication` (keyUsage: Digital Signature) i `Offline` (keyUsage: Non-Repudiation, wyłącznie
 *    do KODU II); klucz RSA 2048 albo EC P-256 (secp256r1),
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/auth/podpis-xades.md — algorytmy podpisu XAdES
 *    (RSASSA-PKCS1-v1_5 z SHA-256, ECDSA z SHA-256 jako R||S),
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/kody-qr.md — podpis linku KODU II
 *    (RSASSA-PSS SHA-256, MGF1 SHA-256, sól 32 bajty; ECDSA P-256 w formacie IEEE P1363).
 *
 * Bez zewnętrznych bibliotek: Node (`crypto`) czyta certyfikat i klucz (także zaszyfrowany PKCS#8
 * z hasłem, w jakim Aplikacja Podatnika wydaje klucz), a pola, których Node nie wystawia (keyUsage,
 * nazwa wystawcy w DER do `IssuerSerialV2`), odczytuje mały czytnik DER poniżej.
 */

export type RodzajCertyfikatuKsef = 'uwierzytelnianie' | 'offline';
export type TypIdentyfikatoraKsef = 'certificateSubject' | 'certificateFingerprint';

export class BladCertyfikatuKsef extends Error {}

export interface CertyfikatKsef {
  x509: X509Certificate;
  der: Buffer;
  pem: string;
}

export interface OpisCertyfikatuKsef {
  podmiot: string;
  wystawca: string;
  /** Numer seryjny szesnastkowo, wielkimi literami — w tej postaci idzie do linku KODU II. */
  numerSeryjny: string;
  waznyOd: string;
  waznyDo: string;
  /** SHA-256 certyfikatu (DER), szesnastkowo małymi literami — „odcisk palca” z podpis-xades.md. */
  odciskSha256: string;
  algorytm: 'RSA' | 'EC';
  /** Bity z rozszerzenia keyUsage; `null` = certyfikat bez tego rozszerzenia. */
  uzycieKlucza: { podpisCyfrowy: boolean; niezaprzeczalnosc: boolean } | null;
}

// ---------------------------------------------------------------------------
// Czytnik DER (X.690) — tylko to, czego potrzeba do certyfikatu X.509
// ---------------------------------------------------------------------------

interface Tlv {
  tag: number;
  /** Przesunięcie pierwszego bajtu (tagu). */
  start: number;
  /** Przesunięcie pierwszego bajtu treści. */
  tresc: number;
  koniec: number;
}

function tlv(buf: Buffer, off: number): Tlv {
  if (off + 2 > buf.length) throw new BladCertyfikatuKsef('Uszkodzony certyfikat (DER).');
  const tag = buf[off];
  let dl = buf[off + 1];
  let tresc = off + 2;
  if (dl & 0x80) {
    const n = dl & 0x7f;
    if (n === 0 || n > 4 || tresc + n > buf.length) throw new BladCertyfikatuKsef('Uszkodzony certyfikat (DER).');
    dl = 0;
    for (let i = 0; i < n; i++) dl = dl * 256 + buf[tresc + i];
    tresc += n;
  }
  const koniec = tresc + dl;
  if (koniec > buf.length) throw new BladCertyfikatuKsef('Uszkodzony certyfikat (DER).');
  return { tag, start: off, tresc, koniec };
}

function dzieci(buf: Buffer, rodzic: Tlv): Tlv[] {
  const wynik: Tlv[] = [];
  let off = rodzic.tresc;
  while (off < rodzic.koniec) {
    const t = tlv(buf, off);
    wynik.push(t);
    off = t.koniec;
  }
  return wynik;
}

interface PolaTbs {
  numerSeryjnyDer: Buffer;
  wystawcaDer: Buffer;
  rozszerzenia: Tlv[];
}

function polaTbs(der: Buffer): PolaTbs {
  const cert = tlv(der, 0);
  const [tbs] = dzieci(der, cert);
  if (!tbs || tbs.tag !== 0x30) throw new BladCertyfikatuKsef('Uszkodzony certyfikat (TBSCertificate).');
  const pola = dzieci(der, tbs);
  // [0] wersja jest opcjonalna (v1) — po niej: numer seryjny, algorytm, wystawca, ważność, podmiot, klucz.
  const i = pola[0]?.tag === 0xa0 ? 1 : 0;
  const numer = pola[i];
  const wystawca = pola[i + 2];
  if (!numer || numer.tag !== 0x02 || !wystawca || wystawca.tag !== 0x30) {
    throw new BladCertyfikatuKsef('Uszkodzony certyfikat (numer seryjny / wystawca).');
  }
  const ext = pola.find((p) => p.tag === 0xa3);
  const rozszerzenia = ext ? dzieci(der, dzieci(der, ext)[0]) : [];
  return {
    numerSeryjnyDer: der.subarray(numer.start, numer.koniec),
    wystawcaDer: der.subarray(wystawca.start, wystawca.koniec),
    rozszerzenia,
  };
}

/** OID 2.5.29.15 (keyUsage) w DER. */
const OID_KEY_USAGE = Buffer.from('0603551d0f', 'hex');

function uzycieKlucza(der: Buffer): OpisCertyfikatuKsef['uzycieKlucza'] {
  for (const ext of polaTbs(der).rozszerzenia) {
    const [oid, ...reszta] = dzieci(der, ext);
    if (!oid || !der.subarray(oid.start, oid.koniec).equals(OID_KEY_USAGE)) continue;
    const oktety = reszta.find((t) => t.tag === 0x04);
    if (!oktety) return null;
    const bity = tlv(der, oktety.tresc);
    if (bity.tag !== 0x03 || bity.koniec - bity.tresc < 2) return null;
    const pierwszy = der[bity.tresc + 1];
    // RFC 5280 4.2.1.3: digitalSignature (0) = 0x80, nonRepudiation (1) = 0x40.
    return { podpisCyfrowy: (pierwszy & 0x80) !== 0, niezaprzeczalnosc: (pierwszy & 0x40) !== 0 };
  }
  return null;
}

function dlugoscDer(n: number): Buffer {
  if (n < 0x80) return Buffer.from([n]);
  const b: number[] = [];
  for (let x = n; x > 0; x = Math.floor(x / 256)) b.unshift(x & 0xff);
  return Buffer.from([0x80 | b.length, ...b]);
}

function derTlv(tag: number, tresc: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), dlugoscDer(tresc.length), tresc]);
}

/**
 * `IssuerSerialV2` (ETSI EN 319 132-1, 5.2.2.2): DER struktury IssuerSerial z RFC 5035 —
 * SEQUENCE { GeneralNames { [4] Name wystawcy }, numer seryjny } — budowany z bajtów certyfikatu,
 * bez przepisywania nazwy wystawcy na tekst (tam łatwo o różnicę kolejności i kodowania).
 */
export function issuerSerialV2(cert: CertyfikatKsef): string {
  const { numerSeryjnyDer, wystawcaDer } = polaTbs(cert.der);
  const generalNames = derTlv(0x30, derTlv(0xa4, wystawcaDer));
  return derTlv(0x30, Buffer.concat([generalNames, numerSeryjnyDer])).toString('base64');
}

// ---------------------------------------------------------------------------
// Odczyt certyfikatu i klucza
// ---------------------------------------------------------------------------

const PEM_CERT = /-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/;

/** Certyfikat w PEM albo DER zakodowanym w Base64 (np. plik .crt/.cer z Aplikacji Podatnika). */
export function wczytajCertyfikat(wejscie: string): CertyfikatKsef {
  const tekst = wejscie.trim();
  const pem = PEM_CERT.exec(tekst);
  const b64 = (pem ? pem[1] : tekst).replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+=*$/.test(b64)) {
    throw new BladCertyfikatuKsef('Certyfikat musi być w formacie PEM albo DER (Base64).');
  }
  const der = Buffer.from(b64, 'base64');
  let x509: X509Certificate;
  try {
    x509 = new X509Certificate(der);
  } catch {
    throw new BladCertyfikatuKsef('Nie udało się odczytać certyfikatu – to nie jest certyfikat X.509.');
  }
  // Sprawdzenie, że nasz czytnik DER rozumie ten certyfikat (potrzebny do podpisu i keyUsage).
  polaTbs(der);
  const linie = der.toString('base64').match(/.{1,64}/g)!.join('\n');
  return { x509, der, pem: `-----BEGIN CERTIFICATE-----\n${linie}\n-----END CERTIFICATE-----\n` };
}

/**
 * Klucz prywatny w PEM (PKCS#8, także zaszyfrowany „ENCRYPTED PRIVATE KEY”, PKCS#1, SEC1) albo DER
 * w Base64. Hasło potrzebne tylko do klucza zaszyfrowanego — po odczycie nie jest nigdzie zapisywane.
 */
export function wczytajKluczPrywatny(wejscie: string, haslo?: string): KeyObject {
  const tekst = wejscie.trim();
  const passphrase = haslo ? haslo : undefined;
  const proby: Array<() => KeyObject> = tekst.includes('-----BEGIN')
    ? [() => createPrivateKey({ key: tekst, format: 'pem', passphrase })]
    : (() => {
        const der = Buffer.from(tekst.replace(/\s+/g, ''), 'base64');
        return [
          () => createPrivateKey({ key: der, format: 'der', type: 'pkcs8', passphrase }),
          () => createPrivateKey({ key: der, format: 'der', type: 'pkcs1' }),
          () => createPrivateKey({ key: der, format: 'der', type: 'sec1' }),
        ];
      })();
  let ostatni: unknown;
  for (const p of proby) {
    try {
      return p();
    } catch (err) {
      ostatni = err;
    }
  }
  const zaszyfrowany = /ENCRYPTED/.test(tekst) || /passphrase|decrypt|bad decrypt/i.test(String((ostatni as Error)?.message));
  throw new BladCertyfikatuKsef(
    zaszyfrowany
      ? 'Nie udało się odszyfrować klucza prywatnego – sprawdź hasło do klucza.'
      : 'Nie udało się odczytać klucza prywatnego (dozwolone: PEM albo DER, PKCS#8/PKCS#1/SEC1).',
  );
}

function algorytm(klucz: KeyObject): 'RSA' | 'EC' {
  if (klucz.asymmetricKeyType === 'rsa') return 'RSA';
  if (klucz.asymmetricKeyType === 'ec') return 'EC';
  throw new BladCertyfikatuKsef('KSeF przyjmuje wyłącznie klucze RSA albo EC (P-256).');
}

export function opisCertyfikatu(cert: CertyfikatKsef): OpisCertyfikatuKsef {
  const { x509 } = cert;
  return {
    podmiot: x509.subject.replace(/\n/g, ', '),
    wystawca: x509.issuer.replace(/\n/g, ', '),
    numerSeryjny: x509.serialNumber.toUpperCase(),
    waznyOd: new Date(x509.validFrom).toISOString(),
    waznyDo: new Date(x509.validTo).toISOString(),
    odciskSha256: createHash('sha256').update(cert.der).digest('hex'),
    algorytm: algorytm(x509.publicKey),
    uzycieKlucza: uzycieKlucza(cert.der),
  };
}

/**
 * Walidacja pary certyfikat + klucz przed zapisem w ustawieniach. Zwraca ostrzeżenia, które nie
 * blokują zapisu (np. certyfikat ważny jeszcze krótko).
 */
export function sprawdzPareKsef(
  cert: CertyfikatKsef,
  klucz: KeyObject,
  rodzaj: RodzajCertyfikatuKsef,
  teraz: Date = new Date(),
): { opis: OpisCertyfikatuKsef; ostrzezenia: string[] } {
  const opis = opisCertyfikatu(cert);
  if (!cert.x509.checkPrivateKey(klucz)) {
    throw new BladCertyfikatuKsef('Klucz prywatny nie pasuje do certyfikatu.');
  }
  if (algorytm(klucz) === 'RSA') {
    const bity = klucz.asymmetricKeyDetails?.modulusLength ?? 0;
    if (bity < 2048) throw new BladCertyfikatuKsef(`Klucz RSA ma ${bity} bitów – KSeF wymaga co najmniej 2048.`);
  } else if (klucz.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new BladCertyfikatuKsef('Klucz EC musi być na krzywej NIST P-256 (secp256r1).');
  }
  if (new Date(opis.waznyDo) <= teraz) {
    throw new BladCertyfikatuKsef(`Certyfikat wygasł ${opis.waznyDo.slice(0, 10)}.`);
  }
  const ostrzezenia: string[] = [];
  if (new Date(opis.waznyOd) > teraz) {
    ostrzezenia.push(`Certyfikat będzie ważny dopiero od ${opis.waznyOd.slice(0, 10)}.`);
  }
  const dni = Math.floor((new Date(opis.waznyDo).getTime() - teraz.getTime()) / 86_400_000);
  if (dni < 30) ostrzezenia.push(`Certyfikat wygasa za ${dni} dni (${opis.waznyDo.slice(0, 10)}).`);

  const u = opis.uzycieKlucza;
  if (rodzaj === 'offline') {
    // kody-qr.md: KOD II wyłącznie certyfikatem typu Offline (keyUsage Non-Repudiation);
    // certyfikatu typu Authentication nie wolno do tego użyć.
    if (!u || !u.niezaprzeczalnosc || u.podpisCyfrowy) {
      throw new BladCertyfikatuKsef(
        'To nie jest certyfikat KSeF typu Offline (keyUsage: Non-Repudiation). KOD II wymaga certyfikatu Offline – certyfikat typu Authentication służy tylko do logowania.',
      );
    }
  } else if (u && !u.podpisCyfrowy && u.niezaprzeczalnosc && /KSeF/i.test(opis.wystawca)) {
    // certyfikaty-KSeF.md: certyfikat typu Offline „nie umożliwia uwierzytelnienia”.
    throw new BladCertyfikatuKsef('To certyfikat KSeF typu Offline – do uwierzytelnienia potrzebny jest certyfikat typu Authentication.');
  }
  return { opis, ostrzezenia };
}

// ---------------------------------------------------------------------------
// Podpis
// ---------------------------------------------------------------------------

/** URI algorytmu `ds:SignatureMethod` dla klucza (auth/podpis-xades.md). */
export function metodaPodpisuXades(klucz: KeyObject): string {
  return algorytm(klucz) === 'RSA'
    ? 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'
    : 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256';
}

/** Podpis `SignedInfo`: RSASSA-PKCS1-v1_5/SHA-256 albo ECDSA/SHA-256 jako R||S (RFC 4050). */
export function podpiszXades(klucz: KeyObject, dane: Buffer): Buffer {
  return algorytm(klucz) === 'RSA'
    ? sign('sha256', dane, { key: klucz, padding: cryptoConstants.RSA_PKCS1_PADDING })
    : sign('sha256', dane, { key: klucz, dsaEncoding: 'ieee-p1363' });
}

/**
 * Podpis linku KODU II (kody-qr.md, „Format podpisu”): RSASSA-PSS z SHA-256, MGF1-SHA-256 i solą
 * 32 bajty albo ECDSA P-256/SHA-256 w formacie IEEE P1363 (zalecany przez MF).
 */
export function podpiszKodII(klucz: KeyObject, dane: Buffer): Buffer {
  return algorytm(klucz) === 'RSA'
    ? sign('sha256', dane, { key: klucz, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: 32 })
    : sign('sha256', dane, { key: klucz, dsaEncoding: 'ieee-p1363' });
}

/** Klucz do zapisu (zaszyfrowanego KMS) w ustawieniach — PKCS#8 PEM bez hasła. */
export function kluczDoZapisu(klucz: KeyObject): string {
  return klucz.export({ type: 'pkcs8', format: 'pem' }).toString();
}
