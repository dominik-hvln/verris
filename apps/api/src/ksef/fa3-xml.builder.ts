import { Invoice } from '@verris/database';
import {
  BuildFaXmlInput,
  BuiltFaXml,
  FaXmlValidationError,
  InvoiceLineItem,
  PartySnapshot,
  normalizeNip,
} from './fa-xml.builder';

/**
 * KSEF-2.0-4 — generator XML e-Faktury w schemacie **FA(3)** (obowiązujący od
 * 1.02.2026 w KSeF 2.0). Buduje dokument wyłącznie z realnych danych `Invoice`.
 *
 * Struktura pól (Naglowek/Podmiot1/Podmiot2/Fa/FaWiersz, P_1, P_2, P_13_1,
 * P_14_1, P_15) jest wspólna z FA(2) dla prostej faktury krajowej PLN, jaką
 * wystawia hosting. Różnice FA(3): kod systemowy „FA (3)", WariantFormularza 3
 * i docelowy namespace CRWDE.
 *
 * ⚠️ TARGET NAMESPACE: MF publikuje dokładny namespace w XSD FA(3)
 * (`schemat_FA(3)_v1-0E.xsd`, CRWDE 25.06.2025). Ustaw go w
 * `KSEF_FA3_TARGET_NAMESPACE` (env) i ZWERYFIKUJ wygenerowany XML walidatorem
 * XSD na środowisku testowym KSeF przed LIVE (ops/scripts/ksef-smoke.ts).
 * Domyślna wartość poniżej jest wartością do potwierdzenia, nie zgadywaniem
 * ostatecznym — dlatego jest nadpisywalna configiem, bez zmian w kodzie.
 */

// Wartość DOMYŚLNA do potwierdzenia z opublikowanym XSD FA(3). Operator nadpisuje
// przez KSEF_FA3_TARGET_NAMESPACE po pobraniu wzoru z CRWDE/ePUAP.
export const FA3_DEFAULT_NAMESPACE =
  process.env.KSEF_FA3_TARGET_NAMESPACE ?? 'http://crd.gov.pl/wzor/2025/06/25/13775/';

export const FA3_SYSTEM_CODE = 'FA (3)';
export const FA3_SCHEMA_VERSION = '1-0E';

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function money(value: string | number | { toString(): string }): string {
  const n = Number(value.toString());
  if (!Number.isFinite(n)) {
    throw new FaXmlValidationError(`Nieprawidłowa kwota: ${String(value)}`);
  }
  return n.toFixed(2);
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function partyDisplayName(p: PartySnapshot): string {
  return (
    p.name ||
    p.companyName ||
    [p.firstName, p.lastName].filter(Boolean).join(' ') ||
    'Nabywca'
  );
}

function vatRateLabel(rate: number): string {
  if ([23, 22, 8, 7, 5, 4, 3, 0].includes(rate)) return String(rate);
  throw new FaXmlValidationError(`Nieobsługiwana stawka VAT: ${rate}`);
}

/** Buduje XML FA(3). Sygnatura zgodna z buildFaXml (drop-in dla providera v2). */
export function buildFa3Xml(input: BuildFaXmlInput): BuiltFaXml {
  const inv = input.invoice;
  const seller = (inv.sellerSnapshot ?? {}) as PartySnapshot;
  const buyer = (inv.buyerSnapshot ?? {}) as PartySnapshot;
  const items = (Array.isArray(inv.lineItems) ? inv.lineItems : []) as InvoiceLineItem[];

  const sellerNip = normalizeNip(seller.nip);
  if (!sellerNip) {
    throw new FaXmlValidationError(
      'Brak NIP sprzedawcy w sellerSnapshot — uzupełnij dane sprzedawcy (PlatformSetting) przed wysyłką do KSeF.',
    );
  }
  if (!inv.issuedAt) {
    throw new FaXmlValidationError('Faktura bez daty wystawienia (issuedAt).');
  }
  if (inv.netAmount == null || inv.vatAmount == null || inv.vatRate == null) {
    throw new FaXmlValidationError(
      'Faktura bez rozbicia VAT (netAmount/vatAmount/vatRate) — wymagane dla KSeF.',
    );
  }
  if ((inv.currency ?? 'PLN') !== 'PLN') {
    throw new FaXmlValidationError(`KSeF: obsługujemy faktury PLN (jest: ${inv.currency}).`);
  }

  const buyerNip = normalizeNip(buyer.nip);
  const rate = Number(inv.vatRate.toString());
  vatRateLabel(rate);
  const net = money(inv.netAmount);
  const vat = money(inv.vatAmount);
  const gross = money(inv.amount);

  if (Math.abs(Number(net) + Number(vat) - Number(gross)) > 0.011) {
    throw new FaXmlValidationError(
      `Niespójne kwoty faktury ${inv.number}: ${net} + ${vat} != ${gross}`,
    );
  }

  const now = new Date();
  const lines = items.length
    ? items
    : [
        {
          name: 'Usługi hostingowe',
          quantity: 1,
          unitNet: net,
          vatRate: rate,
          totalNet: net,
          totalVat: vat,
          totalGross: gross,
        } satisfies InvoiceLineItem,
      ];

  const wiersze = lines
    .map((li, idx) => {
      const q = Number(li.quantity) || 1;
      return [
        '    <FaWiersz>',
        `      <NrWierszaFa>${idx + 1}</NrWierszaFa>`,
        `      <P_7>${esc(String(li.name).slice(0, 256))}</P_7>`,
        `      <P_8A>szt.</P_8A>`,
        `      <P_8B>${q}</P_8B>`,
        `      <P_9A>${money(li.unitNet)}</P_9A>`,
        `      <P_11>${money(li.totalNet)}</P_11>`,
        `      <P_12>${vatRateLabel(Number(li.vatRate))}</P_12>`,
        '    </FaWiersz>',
      ].join('\n');
    })
    .join('\n');

  const addressLine = (p: PartySnapshot): string =>
    esc([p.address, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'brak');

  const podmiot2Ident = buyerNip
    ? `        <NIP>${buyerNip}</NIP>`
    : `        <BrakID>1</BrakID>`;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Faktura xmlns="${FA3_DEFAULT_NAMESPACE}">`,
    '  <Naglowek>',
    `    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION}">FA</KodFormularza>`,
    '    <WariantFormularza>3</WariantFormularza>',
    `    <DataWytworzeniaFa>${now.toISOString()}</DataWytworzeniaFa>`,
    `    <SystemInfo>${esc(input.systemInfo ?? 'Verris Panel')}</SystemInfo>`,
    '  </Naglowek>',
    '  <Podmiot1>',
    '    <DaneIdentyfikacyjne>',
    `      <NIP>${sellerNip}</NIP>`,
    `      <Nazwa>${esc(partyDisplayName(seller))}</Nazwa>`,
    '    </DaneIdentyfikacyjne>',
    '    <Adres>',
    `      <KodKraju>${esc(seller.country || 'PL')}</KodKraju>`,
    `      <AdresL1>${addressLine(seller)}</AdresL1>`,
    '    </Adres>',
    '  </Podmiot1>',
    '  <Podmiot2>',
    '    <DaneIdentyfikacyjne>',
    podmiot2Ident,
    `      <Nazwa>${esc(partyDisplayName(buyer))}</Nazwa>`,
    '    </DaneIdentyfikacyjne>',
    '    <Adres>',
    `      <KodKraju>${esc(buyer.country || 'PL')}</KodKraju>`,
    `      <AdresL1>${addressLine(buyer)}</AdresL1>`,
    '    </Adres>',
    '  </Podmiot2>',
    '  <Fa>',
    '    <KodWaluty>PLN</KodWaluty>',
    `    <P_1>${dateOnly(inv.issuedAt)}</P_1>`,
    `    <P_2>${esc(inv.number)}</P_2>`,
    `    <P_13_1>${net}</P_13_1>`,
    `    <P_14_1>${vat}</P_14_1>`,
    `    <P_15>${gross}</P_15>`,
    '    <Adnotacje>',
    '      <P_16>2</P_16>',
    '      <P_17>2</P_17>',
    '      <P_18>2</P_18>',
    '      <P_18A>2</P_18A>',
    '      <Zwolnienie><P_19N>1</P_19N></Zwolnienie>',
    '      <NoweSrodkiTransportu><P_22N>1</P_22N></NoweSrodkiTransportu>',
    '      <P_23>2</P_23>',
    '      <PMarzy><P_PMarzyN>1</P_PMarzyN></PMarzy>',
    '    </Adnotacje>',
    '    <RodzajFaktury>VAT</RodzajFaktury>',
    wiersze,
    '  </Fa>',
    '</Faktura>',
    '',
  ].join('\n');

  return {
    xml,
    summary: { number: inv.number, sellerNip, buyerNip, gross, net, vat },
  };
}
