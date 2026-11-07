import { createHash, randomBytes, type KeyObject } from 'crypto';
import {
  issuerSerialV2,
  metodaPodpisuXades,
  podpiszXades,
  type CertyfikatKsef,
  type TypIdentyfikatoraKsef,
} from './ksef-certyfikat.js';

/**
 * Dokument `AuthTokenRequest` podpisany XAdES — uwierzytelnienie w KSeF certyfikatem
 * (POST /auth/xades-signature). Wyłącznie wg oficjalnej dokumentacji MF:
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/uwierzytelnianie.md (2.1 — dokument i podpis),
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/auth/podpis-xades.md (formaty, transformaty, algorytmy),
 *  - https://github.com/CIRFMF/ksef-docs/blob/main/auth/schemy/schemat_auth_v2-0.xsd (przestrzeń nazw 2.0),
 *  - przykład: https://github.com/CIRFMF/ksef-docs/blob/main/auth/context-identifier-nip.md.
 *
 * Podpis OTACZANY (enveloped — „detached” KSeF odrzuca), profil XAdES-BASELINE-B (na liście
 * akceptowanych profili): referencja do całego dokumentu (URI="", transformaty enveloped-signature
 * i exc-c14n) oraz do `SignedProperties` (SigningTime, SigningCertificateV2 z CertDigest SHA-256
 * i IssuerSerialV2). Kanonikalizacja SignedInfo: exc-c14n (na liście dopuszczalnych).
 *
 * DLACZEGO BEZ BIBLIOTEKI XML-DSIG. Dokument ma stałą, małą strukturę, więc składamy go od razu
 * w postaci kanonicznej (Exclusive XML Canonicalization 1.0, https://www.w3.org/TR/xml-exc-c14n/):
 * bez deklaracji XML w skracanych fragmentach, elementy puste jako para znaczników, atrybuty
 * w kolejności kanonicznej, deklaracje przestrzeni nazw tam, gdzie exc-c14n je umieszcza. Skrót
 * i podpis liczone są z tych samych bajtów, które trafiają do dokumentu. Test
 * (`ksef-xades.spec.ts`) sprawdza to niezależną kanonikalizacją libxml2 (`xmllint --exc-c14n`).
 */

const NS_AUTH = 'http://ksef.mf.gov.pl/auth/token/2.0';
const NS_DS = 'http://www.w3.org/2000/09/xmldsig#';
const NS_XADES = 'http://uri.etsi.org/01903/v1.3.2#';
const EXC_C14N = 'http://www.w3.org/2001/10/xml-exc-c14n#';
const ENVELOPED = 'http://www.w3.org/2000/09/xmldsig#enveloped-signature';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const TYP_SIGNED_PROPERTIES = 'http://uri.etsi.org/01903#SignedProperties';

/** Escapowanie tekstu wg C14N (&, <, >, CR). */
function tekstC14n(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
}

const sha256b64 = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('base64');

/** `AuthTokenRequest` bez podpisu — w postaci kanonicznej (tak liczony jest skrót referencji URI=""). */
export function authTokenRequestKanoniczny(challenge: string, nip: string, typ: TypIdentyfikatoraKsef): string {
  if (!/^\d{10}$/.test(nip)) throw new Error('NIP kontekstu KSeF musi mieć 10 cyfr.');
  return (
    `<AuthTokenRequest xmlns="${NS_AUTH}">` +
    `<Challenge>${tekstC14n(challenge)}</Challenge>` +
    `<ContextIdentifier><Nip>${nip}</Nip></ContextIdentifier>` +
    `<SubjectIdentifierType>${typ}</SubjectIdentifierType>` +
    `</AuthTokenRequest>`
  );
}

export interface WejsciePodpisuXades {
  challenge: string;
  nip: string;
  typIdentyfikatora: TypIdentyfikatoraKsef;
  certyfikat: CertyfikatKsef;
  klucz: KeyObject;
  teraz?: Date;
}

export function podpiszAuthTokenRequest(w: WejsciePodpisuXades): string {
  const id = randomBytes(6).toString('hex');
  const idPodpisu = `Signature-${id}`;
  const idWlasciwosci = `SignedProperties-${id}`;
  const dokument = authTokenRequestKanoniczny(w.challenge, w.nip, w.typIdentyfikatora);
  const czas = (w.teraz ?? new Date()).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const skrotCertyfikatu = createHash('sha256').update(w.certyfikat.der).digest('base64');

  // exc-c14n poddrzewa SignedProperties: xmlns:xades na korzeniu poddrzewa, xmlns:ds na każdym
  // pierwszym elemencie ds: w gałęzi (przestrzeń nazw jest „widocznie użyta” dopiero tam).
  const wlasciwosci =
    `<xades:SignedProperties xmlns:xades="${NS_XADES}" Id="${idWlasciwosci}">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${czas}</xades:SigningTime>` +
    `<xades:SigningCertificateV2><xades:Cert><xades:CertDigest>` +
    `<ds:DigestMethod xmlns:ds="${NS_DS}" Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue xmlns:ds="${NS_DS}">${skrotCertyfikatu}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerialV2>${issuerSerialV2(w.certyfikat)}</xades:IssuerSerialV2>` +
    `</xades:Cert></xades:SigningCertificateV2>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>`;

  const referencja = (atrybuty: string, transformaty: string[], skrot: string) =>
    `<ds:Reference ${atrybuty}>` +
    `<ds:Transforms>${transformaty.map((t) => `<ds:Transform Algorithm="${t}"></ds:Transform>`).join('')}</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod>` +
    `<ds:DigestValue>${skrot}</ds:DigestValue>` +
    `</ds:Reference>`;

  // Atrybuty bez przestrzeni nazw w kolejności leksykograficznej (C14N): Id < Type < URI.
  const signedInfo =
    `<ds:SignedInfo xmlns:ds="${NS_DS}">` +
    `<ds:CanonicalizationMethod Algorithm="${EXC_C14N}"></ds:CanonicalizationMethod>` +
    `<ds:SignatureMethod Algorithm="${metodaPodpisuXades(w.klucz)}"></ds:SignatureMethod>` +
    referencja(`Id="Reference-${id}" URI=""`, [ENVELOPED, EXC_C14N], sha256b64(dokument)) +
    referencja(`Type="${TYP_SIGNED_PROPERTIES}" URI="#${idWlasciwosci}"`, [EXC_C14N], sha256b64(wlasciwosci)) +
    `</ds:SignedInfo>`;

  const wartoscPodpisu = podpiszXades(w.klucz, Buffer.from(signedInfo, 'utf8')).toString('base64');
  const podpis =
    `<ds:Signature xmlns:ds="${NS_DS}" Id="${idPodpisu}">` +
    signedInfo +
    `<ds:SignatureValue>${wartoscPodpisu}</ds:SignatureValue>` +
    `<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${w.certyfikat.der.toString('base64')}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>` +
    `<ds:Object><xades:QualifyingProperties xmlns:xades="${NS_XADES}" Target="#${idPodpisu}">${wlasciwosci}</xades:QualifyingProperties></ds:Object>` +
    `</ds:Signature>`;

  return `<?xml version="1.0" encoding="utf-8"?>\n${dokument.replace('</AuthTokenRequest>', `${podpis}</AuthTokenRequest>`)}`;
}
