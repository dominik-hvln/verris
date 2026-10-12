import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { buildFa3Xml } from '../ksef/fa3-xml.builder.js';
import type { BuildFaXmlInput } from '../ksef/fa-xml.types.js';

/**
 * Faktury testowe KSeF 12.10 — B2B (NIP), B2C (bez NIP) i korekta — dla testów XSD i spójności
 * XML ↔ wizualizacja ↔ PDF. NIP-y z poprawną sumą kontrolną.
 */
export const NIP_SPRZEDAWCY = '9292069367';
export const NIP_NABYWCY = '5260250274';
export const NUMER_KSEF_PIERWOTNEJ = '9292069367-20261001-0100A0B1C2D3-E4';

const sprzedawca = {
  name: 'HVLN Dominik Kowalski',
  nip: NIP_SPRZEDAWCY,
  address: 'Zacisze 2A',
  postalCode: '65-775',
  city: 'Zielona Góra',
  country: 'PL',
  email: 'faktury@verris.pl',
};

const pozycja = {
  name: 'Hosting Standard — subskrypcja roczna (przyklad.pl)',
  quantity: 1,
  unitNet: '365.04',
  vatRate: 23,
  totalNet: '365.04',
  totalVat: '83.96',
  totalGross: '449.00',
};

function faktura(over: Partial<BuildFaXmlInput['invoice']>): BuildFaXmlInput['invoice'] {
  return {
    number: 'VFV/2026/10/0007',
    amount: '449.00',
    netAmount: '365.04',
    vatAmount: '83.96',
    vatRate: '23',
    currency: 'PLN',
    issuedAt: new Date('2026-10-12T09:15:00Z'),
    paidAt: new Date('2026-10-11T18:40:00Z'),
    sellerSnapshot: sprzedawca,
    buyerSnapshot: {
      companyName: 'Klient Testowy Sp. z o.o.',
      nip: NIP_NABYWCY,
      address: 'ul. Prosta 1 lok. 4',
      postalCode: '00-001',
      city: 'Warszawa',
      country: 'PL',
      email: 'ksiegowosc@klient.example',
    },
    lineItems: [pozycja],
    ...over,
  } as BuildFaXmlInput['invoice'];
}

const TERAZ = new Date('2026-10-12T09:15:02.000Z');

export function fakturaB2B(): BuildFaXmlInput {
  return { invoice: faktura({}), platnosc: { kod: 2 }, teraz: TERAZ, systemInfo: 'Verris Panel' };
}

export function fakturaB2C(): BuildFaXmlInput {
  return {
    invoice: faktura({
      number: 'VFV/2026/10/0008',
      paidAt: new Date('2026-10-12T09:15:00Z'),
      buyerSnapshot: { firstName: 'Anna', lastName: 'Nowak', address: 'Leśna 3', postalCode: '61-001', city: 'Poznań', country: 'PL', email: 'anna@example.com' },
    }),
    platnosc: { opis: 'Portfel Verris (środki przedpłacone)' },
    teraz: TERAZ,
    systemInfo: 'Verris Panel',
  };
}

export function korekta(numerKsefPierwotnej: string | null = NUMER_KSEF_PIERWOTNEJ): BuildFaXmlInput {
  return {
    invoice: faktura({
      number: 'VFK/2026/10/0002',
      kind: 'KOREKTA',
      amount: '-224.50' as never,
      netAmount: '-182.52' as never,
      vatAmount: '-41.98' as never,
      paidAt: new Date('2026-10-12T09:15:00Z'),
      correctedNumber: 'VFV/2026/10/0001',
      correctedIssuedAt: new Date('2026-10-01T10:00:00Z'),
      correctedKsefNumber: numerKsefPierwotnej,
      correctionReason: 'Rezygnacja w połowie okresu — zwrot za niewykorzystane 6 miesięcy',
      correctedLineItems: [pozycja],
      lineItems: [{ ...pozycja, unitNet: '182.52', totalNet: '182.52', totalVat: '41.98', totalGross: '224.50' }],
    }),
    platnosc: { kod: 2 },
    teraz: TERAZ,
    systemInfo: 'Verris Panel',
  };
}

export const FAKTURY_TESTOWE: Array<[string, () => BuildFaXmlInput]> = [
  ['B2B (nabywca z NIP)', fakturaB2B],
  ['B2C (nabywca bez NIP)', fakturaB2C],
  ['korekta faktury z numerem KSeF', () => korekta()],
  ['korekta faktury spoza KSeF', () => korekta(null)],
];

export const xmlFaktury = (input: BuildFaXmlInput): string => buildFa3Xml(input).xml;

/** Oficjalny XSD FA(3) 1-0E (CIRFMF/ksef-docs) z lokalnymi schemaLocation — `src/ksef/schemat-fa3/`. */
export const SCIEZKA_XSD_FA3 = fileURLToPath(new URL('../ksef/schemat-fa3/schemat_FA(3)_v1-0E.xsd', import.meta.url));

export const XMLLINT_DOSTEPNY = spawnSync('xmllint', ['--version']).status === 0;

/** Walidacja XML względem XSD przez xmllint (libxml2). */
export function walidujXsd(xml: string): { ok: boolean; bledy: string } {
  const dir = mkdtempSync(join(tmpdir(), 'fa3-'));
  try {
    const plik = join(dir, 'faktura.xml');
    writeFileSync(plik, xml, 'utf8');
    const r = spawnSync('xmllint', ['--noout', '--nonet', '--schema', SCIEZKA_XSD_FA3, plik], { encoding: 'utf8' });
    return { ok: r.status === 0, bledy: r.stderr };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
