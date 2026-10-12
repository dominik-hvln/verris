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
  poleSumStawki,
  vatRateLabel,
} from './fa-xml.types.js';

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

  // M-09: dokument „np” (odwrotne obciążenie, klient spoza UE) ma w bazie vatRate 0,
  // a w KSeF „0” znaczy stawkę 0% — inny dokument. Builder nie zna kodów „np I/II”,
  // więc odmawia zamiast wysłać błędną stawkę.
  if ((buyer as { vat?: { stawka?: number | null } }).vat?.stawka === null) {
    throw new FaXmlValidationError(
      'Dokument „np” (odwrotne obciążenie / poza UE) — KSeF z panelu go nie obsługuje, wystaw w programie księgowym.',
    );
  }
  const rate = Number(inv.vatRate.toString());
  const poleSum = poleSumStawki(rate);
  const net = formatMoney(inv.netAmount);
  const vat = formatMoney(inv.vatAmount);
  const gross = formatMoney(inv.amount);

  if (Math.abs(Number(net) + Number(vat) - Number(gross)) > 0.011) {
    throw new FaXmlValidationError(
      `Niespójne kwoty faktury ${inv.number}: ${net} + ${vat} != ${gross}`,
    );
  }

  // ── M-06 — rodzaj dokumentu ────────────────────────────────────────────────
  //
  // Do 2026-08-22 stało tu `VAT` na sztywno, bo korekt w systemie nie było.
  // Korekta wysłana jako `VAT` zostałaby przez KSeF przyjęta jako NOWA
  // sprzedaż, a nie jako zmiana poprzedniej — czyli podwoiłaby przychód
  // w rejestrze. Milcząco, bo dokument jest formalnie poprawny.
  const jestKorekta = inv.kind === 'KOREKTA';
  if (jestKorekta) {
    if (!inv.correctedNumber) {
      throw new FaXmlValidationError(
        'Korekta bez numeru faktury pierwotnej — KSeF nie ma czego skorygować.',
      );
    }
    if (!inv.correctionReason?.trim()) {
      throw new FaXmlValidationError(
        'Korekta bez przyczyny — pole obowiązkowe (art. 106j ust. 2 pkt 4 ustawy o VAT).',
      );
    }
  }

  // Wiersze. Korekta: wiersze sprzed korekty (StanPrzed=1) i po korekcie, z odrębną
  // numeracją — sposób opisany przy elemencie StanPrzed w XSD FA(3). Do 2026-10-12
  // korekta niosła tylko wiersze „po”, a sumy były różnicą — z dokumentu nie dało się
  // odczytać, od jakiego stanu liczono różnicę.
  const przed = jestKorekta && Array.isArray(inv.correctedLineItems)
    ? (inv.correctedLineItems as InvoiceLineItem[])
    : [];
  const lines: Array<InvoiceLineItem & { stanPrzed?: boolean }> = jestKorekta
    ? [...przed.map((li) => ({ ...li, stanPrzed: true })), ...items]
    : items.length
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
  for (const li of lines) {
    // Sumy P_13_x/P_14_x biorą kwoty dokumentu, więc wszystkie wiersze muszą mieć jego stawkę —
    // inaczej część sprzedaży trafiłaby do pola innej stawki.
    if (Number(li.vatRate) !== rate) {
      throw new FaXmlValidationError(
        `Faktura ${inv.number} ma pozycje w różnych stawkach VAT — KSeF z panelu obsługuje jedną stawkę na dokument.`,
      );
    }
  }

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
        ...(li.stanPrzed ? ['      <StanPrzed>1</StanPrzed>'] : []),
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

  // B2C (decyzja właściciela 2026-10-12: faktury dla osób prywatnych też idą do KSeF):
  // nabywca bez identyfikatora podatkowego = `BrakID=1` (TPodmiot2 w XSD FA(3)).
  const podmiot2Ident = buyerNip
    ? `      <NIP>${buyerNip}</NIP>`
    : '      <BrakID>1</BrakID>';

  const sellerEmail = seller.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(seller.email) ? seller.email : null;

  const rodzajIKorekta = jestKorekta
    ? [
        '    <RodzajFaktury>KOR</RodzajFaktury>',
        `    <PrzyczynaKorekty>${escapeXml(inv.correctionReason!.trim())}</PrzyczynaKorekty>`,
        '    <TypKorekty>1</TypKorekty>',
        '    <DaneFaKorygowanej>',
        `      <DataWystFaKorygowanej>${formatDateOnly(
          inv.correctedIssuedAt ?? inv.issuedAt,
        )}</DataWystFaKorygowanej>`,
        `      <NrFaKorygowanej>${escapeXml(inv.correctedNumber!)}</NrFaKorygowanej>`,
        ...(inv.correctedKsefNumber
          ? [
              '      <NrKSeF>1</NrKSeF>',
              `      <NrKSeFFaKorygowanej>${escapeXml(inv.correctedKsefNumber)}</NrKSeFFaKorygowanej>`,
            ]
          : ['      <NrKSeFN>1</NrKSeFN>']),
        '    </DaneFaKorygowanej>',
      ]
    : ['    <RodzajFaktury>VAT</RodzajFaktury>'];

  const p1 = formatDateOnly(inv.issuedAt);
  // P_6 — „o ile taka data jest określona i różni się od daty wystawienia faktury” (XSD).
  const p6 = !jestKorekta && inv.paidAt ? formatDateOnly(inv.paidAt) : null;

  // Platnosc — faktura panelu dokumentuje sprzedaż już opłaconą. Na korekcie sekcji nie ma:
  // korekta nie dokumentuje zapłaty, tylko zmianę rozliczenia.
  const platnosc: string[] = [];
  if (!jestKorekta && inv.paidAt) {
    platnosc.push('    <Platnosc>', '      <Zaplacono>1</Zaplacono>', `      <DataZaplaty>${formatDateOnly(inv.paidAt)}</DataZaplaty>`);
    const f = input.platnosc;
    if (f && 'kod' in f) platnosc.push(`      <FormaPlatnosci>${f.kod}</FormaPlatnosci>`);
    if (f && 'opis' in f && f.opis.trim()) {
      platnosc.push('      <PlatnoscInna>1</PlatnoscInna>', `      <OpisPlatnosci>${escapeXml(f.opis.trim())}</OpisPlatnosci>`);
    }
    platnosc.push('    </Platnosc>');
  }

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Faktura xmlns="${FA3_NAMESPACE}">`,
    '  <Naglowek>',
    `    <KodFormularza kodSystemowy="${FA3_SYSTEM_CODE}" wersjaSchemy="${FA3_SCHEMA_VERSION}">${FA3_FORM_VALUE}</KodFormularza>`,
    `    <WariantFormularza>${FA3_FORM_VARIANT}</WariantFormularza>`,
    `    <DataWytworzeniaFa>${(input.teraz ?? new Date()).toISOString()}</DataWytworzeniaFa>`,
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
    ...(sellerEmail
      ? ['    <DaneKontaktowe>', `      <Email>${escapeXml(sellerEmail)}</Email>`, '    </DaneKontaktowe>']
      : []),
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
    // JST i GV są w FA(3) OBOWIĄZKOWE (XSD 1-0E, Podmiot2). Do 2026-10-12 ich nie było —
    // każdy dokument odpadał na walidacji schematu w KSeF. „2” = nie dotyczy.
    '    <JST>2</JST>',
    '    <GV>2</GV>',
    '  </Podmiot2>',
    '  <Fa>',
    '    <KodWaluty>PLN</KodWaluty>',
    `    <P_1>${p1}</P_1>`,
    `    <P_2>${escapeXml(inv.number)}</P_2>`,
    ...(p6 && p6 !== p1 ? [`    <P_6>${p6}</P_6>`] : []),
    `    <P_13_${poleSum}>${net}</P_13_${poleSum}>`,
    `    <P_14_${poleSum}>${vat}</P_14_${poleSum}>`,
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
    ...rodzajIKorekta,
    ...(wiersze ? [wiersze] : []),
    ...platnosc,
    '  </Fa>',
    '</Faktura>',
    '',
  ].join('\n');

  return {
    xml,
    summary: { number: inv.number, sellerNip, buyerNip, gross, net, vat },
  };
}
