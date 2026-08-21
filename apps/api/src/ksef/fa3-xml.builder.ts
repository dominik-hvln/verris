import {
  BuildFaXmlInput,
  BuiltFaXml,
  FaXmlValidationError,
  InvoiceLineItem,
  PartySnapshot,
  escapeXml,
  formatDateOnly,
  formatMoney,
  isValidNip,
  normalizeNip,
  partyDisplayName,
  vatRateLabel,
} from './fa-xml.types';

/**
 * Generator XML e-Faktury w schemacie **FA(3)** — jedynym obowiązującym w
 * KSeF 2.0 (od 1.02.2026). Buduje dokument wyłącznie z realnych danych
 * `Invoice` (snapshoty stron, rozbicie VAT, pozycje).
 *
 * Stałe POTWIERDZONE z oficjalnego XSD MF
 * (ksef-docs/faktury/schemy/FA/schemat_FA(3)_v1-0E.xsd, CRWDE 25.06.2025):
 *  - targetNamespace: http://crd.gov.pl/wzor/2025/06/25/13775/
 *  - KodFormularza: kodSystemowy fixed "FA (3)", wersjaSchemy fixed "1-0E",
 *    wartość elementu "FA", WariantFormularza 3.
 *
 * Zgodność z weryfikacją KSeF 2.0 (stan: lipiec 2026):
 *  - prolog UTF-8 (2.3.0), brak processing instructions poza prologiem,
 *    pola tekstowe sanityzowane ze znaków niezalecanych W3C (2.4.0,
 *    egzekwowane na PRD od 16.07.2026),
 *  - suma kontrolna NIP Podmiot1/Podmiot2 walidowana lokalnie (2.0.1).
 */

export const FA3_NAMESPACE =
  process.env.KSEF_FA3_TARGET_NAMESPACE ?? 'http://crd.gov.pl/wzor/2025/06/25/13775/';
export const FA3_SYSTEM_CODE = 'FA (3)';
export const FA3_SCHEMA_VERSION = '1-0E';
export const FA3_FORM_VALUE = 'FA';
export const FA3_FORM_VARIANT = 3;

export function buildFa3Xml(input: BuildFaXmlInput): BuiltFaXml {
  const inv = input.invoice;
  const seller = (inv.sellerSnapshot ?? {}) as PartySnapshot;
  const buyer = (inv.buyerSnapshot ?? {}) as PartySnapshot;
  const items = (Array.isArray(inv.lineItems) ? inv.lineItems : []) as InvoiceLineItem[];

  const sellerNip = normalizeNip(seller.nip);
  if (!sellerNip) {
    throw new FaXmlValidationError(
      'Brak NIP sprzedawcy w sellerSnapshot — uzupełnij dane sprzedawcy (Ustawienia → Firma) przed wysyłką do KSeF.',
    );
  }
  if (!isValidNip(sellerNip)) {
    throw new FaXmlValidationError(
      `NIP sprzedawcy ${sellerNip} ma błędną sumę kontrolną — KSeF odrzuci fakturę.`,
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
  if (buyerNip && !isValidNip(buyerNip)) {
    throw new FaXmlValidationError(
      `NIP nabywcy ${buyerNip} ma błędną sumę kontrolną — popraw dane do faktury klienta.`,
    );
  }

  const rate = Number(inv.vatRate.toString());
  vatRateLabel(rate);
  const net = formatMoney(inv.netAmount);
  const vat = formatMoney(inv.vatAmount);
  const gross = formatMoney(inv.amount);

  if (Math.abs(Number(net) + Number(vat) - Number(gross)) > 0.011) {
    throw new FaXmlValidationError(
      `Niespójne kwoty faktury ${inv.number}: ${net} + ${vat} != ${gross}`,
    );
  }

  const lines: InvoiceLineItem[] = items.length
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
        },
      ];

  const wiersze = lines
    .map((li, idx) => {
      const q = Number(li.quantity) || 1;
      return [
        '    <FaWiersz>',
        `      <NrWierszaFa>${idx + 1}</NrWierszaFa>`,
        `      <P_7>${escapeXml(String(li.name).slice(0, 256))}</P_7>`,
        '      <P_8A>szt.</P_8A>',
        `      <P_8B>${q}</P_8B>`,
        `      <P_9A>${formatMoney(li.unitNet)}</P_9A>`,
        `      <P_11>${formatMoney(li.totalNet)}</P_11>`,
        `      <P_12>${vatRateLabel(Number(li.vatRate))}</P_12>`,
        '    </FaWiersz>',
      ].join('\n');
    })
    .join('\n');

  const addressLine = (p: PartySnapshot): string =>
    escapeXml(
      [p.address, [p.postalCode, p.city].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ') || 'brak',
    );

  const podmiot2Ident = buyerNip
    ? `        <NIP>${buyerNip}</NIP>`
    : '        <BrakID>1</BrakID>';

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    '  <Naglowek>',
    `    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION}">${FA3_FORM_VALUE}</KodFormularza>`,
    `    <WariantFormularza>${FA3_FORM_VARIANT}</WariantFormularza>`,
    `    <DataWytworzeniaFa>${new Date().toISOString()}</DataWytworzeniaFa>`,
    `    <SystemInfo>${escapeXml(input.systemInfo ?? 'Verris Panel')}</SystemInfo>`,
    '  </Naglowek>',
    '  <Podmiot1>',
    '    <DaneIdentyfikacyjne>',
    `      <NIP>${sellerNip}</NIP>`,
    `      <Nazwa>${escapeXml(partyDisplayName(seller))}</Nazwa>`,
    '    </DaneIdentyfikacyjne>',
    '    <Adres>',
    `      <KodKraju>${escapeXml(seller.country || 'PL')}</KodKraju>`,
    `      <AdresL1>${addressLine(seller)}</AdresL1>`,
    '    </Adres>',
    '  </Podmiot1>',
    '  <Podmiot2>',
    '    <DaneIdentyfikacyjne>',
    podmiot2Ident,
    `      <Nazwa>${escapeXml(partyDisplayName(buyer))}</Nazwa>`,
    '    </DaneIdentyfikacyjne>',
    '    <Adres>',
    `      <KodKraju>${escapeXml(buyer.country || 'PL')}</KodKraju>`,
    `      <AdresL1>${addressLine(buyer)}</AdresL1>`,
    '    </Adres>',
    '  </Podmiot2>',
    '  <Fa>',
    '    <KodWaluty>PLN</KodWaluty>',
    `    <P_1>${formatDateOnly(inv.issuedAt)}</P_1>`,
    `    <P_2>${escapeXml(inv.number)}</P_2>`,
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
