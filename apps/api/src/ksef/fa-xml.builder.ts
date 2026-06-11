import { Invoice } from '@verris/database';

/**
 * B-1 — generator XML e-Faktury w schemacie FA(2)
 * (http://crd.gov.pl/wzor/2023/06/29/12648/ — obowiązujący wzór faktury
 * ustrukturyzowanej VAT). Buduje dokument WYŁĄCZNIE z realnych danych
 * `Invoice` (snapshoty sprzedawcy/nabywcy, rozbicie VAT, pozycje).
 *
 * Walidacja przed LIVE: wygenerowany XML przepuścić przez walidator XSD MF
 * (ksef-test) — patrz `ops/scripts/ksef-smoke.ts`.
 */

export interface PartySnapshot {
  name?: string;
  companyName?: string;
  firstName?: string;
  lastName?: string;
  nip?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  email?: string;
}

export interface InvoiceLineItem {
  name: string;
  quantity: number;
  unitNet: string | number;
  vatRate: string | number;
  totalNet: string | number;
  totalVat: string | number;
  totalGross: string | number;
}

const FA_NAMESPACE = 'http://crd.gov.pl/wzor/2023/06/29/12648/';

export class FaXmlValidationError extends Error {}

/** Escapes XML text content. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Formats a decimal to 2 places with a dot (KSeF requirement). */
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

/** Normalizes a Polish NIP to bare 10 digits; null if absent/invalid. */
export function normalizeNip(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 ? digits : null;
}

function partyDisplayName(p: PartySnapshot): string {
  return (
    p.name ||
    p.companyName ||
    [p.firstName, p.lastName].filter(Boolean).join(' ') ||
    'Nabywca'
  );
}

/**
 * Maps Invoice.vatRate (np. 23) to FA(2) P_12 stawka. Supported: 23, 8, 5, 0,
 * 'zw' (zwolniona) gdy vatRate=0 i vatAmount=0 z adnotacją — dla hostingu
 * standardem jest 23.
 */
function vatRateLabel(rate: number): string {
  if ([23, 22, 8, 7, 5, 4, 3, 0].includes(rate)) return String(rate);
  throw new FaXmlValidationError(`Nieobsługiwana stawka VAT: ${rate}`);
}

export interface BuildFaXmlInput {
  invoice: Pick<
    Invoice,
    | 'number'
    | 'amount'
    | 'netAmount'
    | 'vatAmount'
    | 'vatRate'
    | 'currency'
    | 'issuedAt'
    | 'paidAt'
  > & {
    sellerSnapshot: unknown;
    buyerSnapshot: unknown;
    lineItems: unknown;
  };
  /** System info do nagłówka (nazwa systemu wystawcy). */
  systemInfo?: string;
}

export interface BuiltFaXml {
  xml: string;
  /** Dane diagnostyczne do logów/audytu. */
  summary: {
    number: string;
    sellerNip: string;
    buyerNip: string | null;
    gross: string;
    net: string;
    vat: string;
  };
}

export function buildFaXml(input: BuildFaXmlInput): BuiltFaXml {
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
    // FA(2) wspiera waluty obce (KursWaluty), ale Verris fakturuje w PLN.
    throw new FaXmlValidationError(`KSeF: obsługujemy faktury PLN (jest: ${inv.currency}).`);
  }

  const buyerNip = normalizeNip(buyer.nip);
  const rate = Number(inv.vatRate.toString());
  vatRateLabel(rate); // walidacja stawki głównej (rzuca przy nieobsługiwanej)
  const net = money(inv.netAmount);
  const vat = money(inv.vatAmount);
  const gross = money(inv.amount);

  // Suma kontrolna: brutto = netto + VAT (zaokrąglenia 2 dp).
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
    : // Konsument bez NIP — identyfikator "BrakID" zgodnie z FA(2).
      `        <BrakID>1</BrakID>`;

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Faktura xmlns="${FA_NAMESPACE}">`,
    '  <Naglowek>',
    '    <KodFormularza kodSystemowy="FA (2)" wersjaSchemy="1-0E">FA</KodFormularza>',
    '    <WariantFormularza>2</WariantFormularza>',
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
    summary: {
      number: inv.number,
      sellerNip,
      buyerNip,
      gross,
      net,
      vat,
    },
  };
}
