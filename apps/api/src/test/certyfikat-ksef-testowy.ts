import { createPublicKey, generateKeyPairSync, sign, type KeyObject } from 'crypto';

/**
 * KSeF 07.11 — certyfikaty testowe X.509 v3 generowane w teście (bez openssl i bez bibliotek): podmiot jak
 * w certyfikatach KSeF (auth/podpis-xades.md — imię, nazwisko, serialNumber „TINPL-…”, CN, C), rozszerzenie
 * keyUsage jak w certyfikaty-KSeF.md (Authentication: Digital Signature, Offline: Non-Repudiation),
 * klucz RSA 2048 albo EC P-256. Samopodpisane — MF dopuszcza takie wyłącznie na środowisku testowym.
 */

const der = (tag: number, body: Buffer): Buffer => {
  const n = body.length;
  const dl = n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : n < 0x10000 ? [0x82, n >> 8, n & 0xff] : [0x83, n >> 16, (n >> 8) & 0xff, n & 0xff];
  return Buffer.concat([Buffer.from([tag, ...dl]), body]);
};

const OID: Record<string, string> = {
  CN: '0603550403',
  SN: '0603550404',
  serialNumber: '0603550405',
  C: '0603550406',
  O: '060355040a',
  givenName: '060355042a',
  organizationIdentifier: '0603550461',
};

function nazwa(atrybuty: Array<[keyof typeof OID, string]>): Buffer {
  return der(
    0x30,
    Buffer.concat(
      atrybuty.map(([typ, wartosc]) =>
        der(0x31, der(0x30, Buffer.concat([Buffer.from(OID[typ], 'hex'), der(typ === 'C' ? 0x13 : 0x0c, Buffer.from(wartosc, 'utf8'))]))),
      ),
    ),
  );
}

const czas = (t: Date) => der(0x17, Buffer.from(t.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));

export type UzycieTestowe = 'Authentication' | 'Offline' | 'brak';

export interface CertyfikatTestowy {
  certPem: string;
  derB64: string;
  klucz: KeyObject;
  /** Klucz prywatny PKCS#8 PEM bez hasła. */
  kluczPem: string;
  /** Ten sam klucz zaszyfrowany hasłem (PKCS#8 „ENCRYPTED PRIVATE KEY”, AES-256-CBC) — jak z Aplikacji Podatnika. */
  kluczPemZHaslem: (haslo: string) => string;
  numerSeryjny: string;
}

export function certyfikatTestowy(o: {
  algorytm?: 'RSA' | 'EC';
  uzycie?: UzycieTestowe;
  od?: Date;
  do?: Date;
  numerSeryjnyHex?: string;
  podmiot?: Array<[keyof typeof OID, string]>;
  wystawca?: Array<[keyof typeof OID, string]>;
  bityRsa?: number;
} = {}): CertyfikatTestowy {
  const algorytm = o.algorytm ?? 'RSA';
  const { privateKey } =
    algorytm === 'RSA'
      ? generateKeyPairSync('rsa', { modulusLength: o.bityRsa ?? 2048 })
      : generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algPodpisu =
    algorytm === 'RSA' ? Buffer.from('300d06092a864886f70d01010b0500', 'hex') : Buffer.from('300a06082a8648ce3d040302', 'hex');
  const podmiot = nazwa(o.podmiot ?? [['givenName', 'Dominik'], ['SN', 'Testowy'], ['serialNumber', 'TINPL-9292069367'], ['CN', 'Dominik Testowy'], ['C', 'PL']]);
  const wystawca = o.wystawca ? nazwa(o.wystawca) : podmiot;
  const numerHex = o.numerSeryjnyHex ?? '01F20A5D352AE590';
  const uzycie = o.uzycie ?? 'Authentication';
  const rozszerzenia =
    uzycie === 'brak'
      ? Buffer.alloc(0)
      : der(
          0xa3,
          der(
            0x30,
            der(
              0x30,
              Buffer.concat([
                Buffer.from('0603551d0f', 'hex'),
                Buffer.from('0101ff', 'hex'),
                der(0x04, Buffer.from(uzycie === 'Authentication' ? '03020780' : '03020640', 'hex')),
              ]),
            ),
          ),
        );
  const od = o.od ?? new Date(Date.now() - 24 * 3600_000);
  const do_ = o.do ?? new Date(Date.now() + 365 * 24 * 3600_000);
  const tbs = der(
    0x30,
    Buffer.concat([
      der(0xa0, Buffer.from([0x02, 0x01, 0x02])),
      der(0x02, Buffer.from(numerHex, 'hex')),
      algPodpisu,
      wystawca,
      der(0x30, Buffer.concat([czas(od), czas(do_)])),
      podmiot,
      createPublicKey(privateKey).export({ type: 'spki', format: 'der' }),
      rozszerzenia,
    ]),
  );
  const certDer = der(0x30, Buffer.concat([tbs, algPodpisu, der(0x03, Buffer.concat([Buffer.from([0]), sign('sha256', tbs, privateKey)]))]));
  const derB64 = certDer.toString('base64');
  return {
    certPem: `-----BEGIN CERTIFICATE-----\n${derB64.match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`,
    derB64,
    klucz: privateKey,
    kluczPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    kluczPemZHaslem: (haslo) => privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase: haslo }).toString(),
    numerSeryjny: numerHex,
  };
}
