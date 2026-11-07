import { createHash, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as xmllint from 'xmllint-wasm';
import { certyfikatTestowy } from '../test/certyfikat-ksef-testowy.js';
import { wczytajCertyfikat } from './ksef-certyfikat.js';
import { authTokenRequestKanoniczny, podpiszAuthTokenRequest } from './ksef-xades.js';

/**
 * KSeF 07.11 — uwierzytelnienie certyfikatem: `AuthTokenRequest` podpisany XAdES (uwierzytelnianie.md 2.1,
 * auth/podpis-xades.md). Podpis sprawdzany NIEZALEŻNIE od kodu, który go złożył: kanonikalizację robi
 * libxml2 (`xmllint --exc-c14n` w wasm), skróty i podpis liczy test od nowa.
 */

const validateXML = ((xmllint as unknown as { validateXML?: unknown }).validateXML ??
  (xmllint as unknown as { default: { validateXML: unknown } }).default.validateXML) as (o: Record<string, unknown>) => Promise<{ valid: boolean; normalized: string; errors: unknown[] }>;

/** Exclusive XML Canonicalization 1.0 dokumentu — libxml2. */
async function excC14n(xml: string): Promise<string> {
  const r = await validateXML({ xml: [{ fileName: 'd.xml', contents: xml }], normalization: 'c14n', modifyArguments: () => ['--exc-c14n', 'd.xml'] });
  return r.normalized.replace(/\n$/, '');
}

const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('base64');
const wytnij = (xml: string, element: string) => {
  const m = new RegExp(`<${element}[ >][\\s\\S]*?</${element}>`).exec(xml);
  if (!m) throw new Error(`brak ${element}`);
  return m[0];
};

const CHALLENGE = '20250625-CR-20F5EE4000-DA48AE4124-46';
const NIP = '9292069367';

describe.each([
  ['RSA (rsa-sha256)', 'RSA' as const, 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'],
  ['EC P-256 (ecdsa-sha256, R||S)', 'EC' as const, 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256'],
])('KSeF – AuthTokenRequest z podpisem XAdES: %s', (_n, algorytm, metoda) => {
  const t = certyfikatTestowy({ algorytm });
  const cert = wczytajCertyfikat(t.certPem);
  const teraz = new Date('2026-11-07T10:00:00.123Z');
  const xml = podpiszAuthTokenRequest({ challenge: CHALLENGE, nip: NIP, typIdentyfikatora: 'certificateSubject', certyfikat: cert, klucz: t.klucz, teraz });

  it('dokument jak w przykładzie MF (przestrzeń auth/token/2.0, kontekst Nip, certificateSubject); podpis otaczany, nie odłączony', () => {
    expect(xml).toMatch(/^<\?xml version="1.0" encoding="utf-8"\?>\n<AuthTokenRequest xmlns="http:\/\/ksef.mf.gov.pl\/auth\/token\/2.0">/);
    expect(xml).toContain(`<Challenge>${CHALLENGE}</Challenge><ContextIdentifier><Nip>${NIP}</Nip></ContextIdentifier><SubjectIdentifierType>certificateSubject</SubjectIdentifierType><ds:Signature`);
    expect(xml.endsWith('</ds:Signature></AuthTokenRequest>')).toBe(true);
    expect(xml).toContain(`<ds:SignatureMethod Algorithm="${metoda}">`);
    expect(xml).toContain('<xades:SigningTime>2026-11-07T10:00:00Z</xades:SigningTime>');
    expect(xml).toContain(`<ds:X509Certificate>${t.derB64}</ds:X509Certificate>`);
  });

  it('referencja URI="": skrót dokumentu bez podpisu po exc-c14n (libxml2) zgadza się z DigestValue', async () => {
    const bezPodpisu = xml.replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '');
    const kanon = await excC14n(bezPodpisu);
    expect(kanon).toBe(authTokenRequestKanoniczny(CHALLENGE, NIP, 'certificateSubject'));
    const ref = /<ds:Reference Id="[^"]+" URI="">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(xml)!;
    expect(ref[0]).toContain('xmldsig#enveloped-signature');
    expect(ref[1]).toBe(sha(kanon));
  });

  it('SignedProperties: postać w dokumencie = exc-c14n (libxml2); skrót = DigestValue referencji typu SignedProperties; CertDigest = SHA-256 certyfikatu', async () => {
    const wl = wytnij(xml, 'xades:SignedProperties');
    expect(await excC14n(wl)).toBe(wl);
    const ref = /<ds:Reference Type="http:\/\/uri.etsi.org\/01903#SignedProperties" URI="#([^"]+)">[\s\S]*?<ds:DigestValue>([^<]+)<\/ds:DigestValue>/.exec(xml)!;
    expect(wl).toContain(`Id="${ref[1]}"`);
    expect(ref[2]).toBe(sha(wl));
    expect(wl).toContain(`<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${createHash('sha256').update(cert.der).digest('base64')}</ds:DigestValue>`);
    expect(xml).toContain(`<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="#${/<ds:Signature [^>]*Id="([^"]+)"/.exec(xml)![1]}">`);
  });

  it('SignatureValue weryfikuje się kluczem publicznym certyfikatu na kanonicznym SignedInfo (exc-c14n, libxml2)', async () => {
    const si = wytnij(xml, 'ds:SignedInfo');
    const kanon = await excC14n(si);
    expect(kanon).toBe(si);
    const wartosc = Buffer.from(/<ds:SignatureValue>([^<]+)<\/ds:SignatureValue>/.exec(xml)![1], 'base64');
    const opcje = algorytm === 'EC' ? { key: cert.x509.publicKey, dsaEncoding: 'ieee-p1363' as const } : cert.x509.publicKey;
    expect(verify('sha256', Buffer.from(kanon, 'utf8'), opcje, wartosc)).toBe(true);
    // Zmieniony challenge = podpis nieważny (skrót dokumentu w SignedInfo).
    const zmieniony = xml.replace(CHALLENGE, '20250625-CR-20F5EE4000-DA48AE4124-47').replace(/<ds:Signature[\s\S]*<\/ds:Signature>/, '');
    expect(sha(await excC14n(zmieniony))).not.toBe(/URI="">[\s\S]*?<ds:DigestValue>([^<]+)</.exec(xml)![1]);
  });
});

/**
 * Schemat 2.0 (przestrzeń używana w przykładach MF) ma wzorce IP w składni, której libxml2 nie przyjmuje
 * („^…$”, `\b`); 2.1 to ta sama struktura z poprawionymi wzorcami (diff w ksef-docs/auth/schemy). Walidujemy
 * schematem 2.1 przeniesionym na przestrzeń nazw 2.0 — elementy i typy są identyczne.
 */
describe('KSeF – AuthTokenRequest zgodny z oficjalnym XSD (auth/schemy/schemat_auth_v2-1.xsd)', () => {
  it.each(['certificateSubject', 'certificateFingerprint'] as const)('%s: dokument bez podpisu przechodzi schemat', async (typ) => {
    const xsd = readFileSync(new URL('./schemat-auth/schemat_auth_v2-1.xsd', import.meta.url), 'utf8').replaceAll('http://ksef.mf.gov.pl/auth/token/2.1', 'http://ksef.mf.gov.pl/auth/token/2.0');
    const r = await validateXML({
      xml: [{ fileName: 'a.xml', contents: authTokenRequestKanoniczny(CHALLENGE, NIP, typ) }],
      schema: [{ fileName: 'auth.xsd', contents: xsd }],
    });
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
  });

  it('NIP spoza 10 cyfr odrzucony przed podpisem', () => {
    expect(() => authTokenRequestKanoniczny(CHALLENGE, '123', 'certificateSubject')).toThrow(/10 cyfr/);
  });
});
