import { KsefStatus, Prisma } from '@verris/database';
import { NotFoundException } from '@nestjs/common';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { InvoicesService } from '../../src/billing/invoices.service.js';
import { KsefService } from '../../src/ksef/ksef.service.js';
import { skrotFakturyBase64Url } from '../../src/ksef/kod-qr-ksef.js';
import { wizualizacjaFa3 } from '../../src/ksef/wizualizacja-fa3.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * KSeF 12.10 — plik faktury w KSeF na prawdziwej bazie (prawdziwy builder FA(3), atrapa klienta KSeF):
 *  - faktury panelu (provider WALLET/STRIPE/…) kwalifikują się do KSeF — także B2C bez NIP,
 *  - wysyłany jest DOKŁADNIE zapisany plik (skrót w kodzie QR = skrót wysłanych bajtów),
 *  - PDF i XML tylko dla właściciela faktury,
 *  - korekta czeka na numer KSeF faktury korygowanej.
 */

const wyslane: string[] = [];
const klient = {
  openSession: async () => undefined,
  terminateSession: async () => undefined,
  sendInvoice: async (xml: string) => {
    wyslane.push(xml);
    return { elementReferenceNumber: `sesja|ref-${wyslane.length}` };
  },
  invoiceStatus: async (ref: string) => ({
    processed: true,
    ksefReferenceNumber: `9292069367-20261012-0100A0B1C2D${ref.slice(-1)}-E4`,
    acquisitionTimestamp: '2026-10-12T10:00:00Z',
    statusCode: 200,
    statusDescription: null,
    rejected: false,
  }),
  downloadUpo: async () => '',
};

function ksef() {
  const p = prisma() as never;
  const ustawienia = { getKsefRuntimeConfig: async () => ({ enabled: true, nip: '9292069367', token: 't', env: 'test' }) };
  const s = new KsefService(p, { get: () => undefined } as never, new AuditService(p), ustawienia as never);
  (s as unknown as { buildClient: () => Promise<unknown> }).buildClient = async () => klient;
  return s;
}

function faktury(k: KsefService) {
  const nic = {} as never;
  return new InvoicesService(prisma() as never, new AuditService(prisma() as never), nic, nic, nic, nic, k, nic, nic);
}

let n = 0;
async function uzytkownik() {
  n += 1;
  return prisma().user.create({ data: { email: `ksef-plik-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
}

const sprzedawca = { name: 'HVLN Dominik Kowalski', nip: '9292069367', address: 'Zacisze 2A', postalCode: '65-775', city: 'Zielona Góra', country: 'PL', email: 'faktury@verris.pl' };
const pozycja = { name: 'Hosting Standard', quantity: 1, unitNet: '100.00', vatRate: 23, totalNet: '100.00', totalVat: '23.00', totalGross: '123.00' };

async function fakturaPanelu(userId: string, over: Record<string, unknown> = {}) {
  n += 1;
  return prisma().invoice.create({
    data: {
      userId,
      number: `VFV/2026/10/${String(n).padStart(4, '0')}`,
      rodzajPrawny: 'FAKTURA_VAT',
      status: 'PAID',
      amount: new Prisma.Decimal('123.00'),
      netAmount: new Prisma.Decimal('100.00'),
      vatAmount: new Prisma.Decimal('23.00'),
      vatRate: new Prisma.Decimal('23'),
      currency: 'PLN',
      provider: 'WALLET',
      providerRef: `wpis-${n}`,
      issuedAt: new Date(),
      paidAt: new Date(),
      storageKey: `x/${n}.pdf`,
      sellerSnapshot: sprzedawca,
      // B2C: osoba prywatna bez NIP.
      buyerSnapshot: { name: 'Anna Nowak', address: 'Leśna 3', postalCode: '61-001', city: 'Poznań', country: 'PL', email: 'anna@example.com' },
      lineItems: [pozycja],
      ...over,
    } as never,
  });
}

const stan = (id: string) => prisma().invoice.findUniqueOrThrow({ where: { id } });

async function tresc(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const kawalki: Buffer[] = [];
  for await (const c of stream as AsyncIterable<Buffer>) kawalki.push(Buffer.from(c));
  return Buffer.concat(kawalki);
}

describe('KSeF 12.10 — plik faktury, kod QR, PDF/XML dla klienta', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wyslane.length = 0;
  });
  afterAll(rozlacz);

  it('faktura panelu z dostawcą (portfel) dla osoby bez NIP kwalifikuje się do KSeF', async () => {
    // Do 2026-10-12 warunek `provider == null` wykluczał KAŻDĄ fakturę panelu.
    const u = await uzytkownik();
    const f = await fakturaPanelu(u.id);
    await ksef().enqueueInvoice(f.id);
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.PENDING);
  });

  it('nie kwalifikuje: dokumentu rozliczeniowego (VDR) ani faktury niesfinalizowanej', async () => {
    const u = await uzytkownik();
    const vdr = await fakturaPanelu(u.id, { number: 'VDR/2026/10/0001', rodzajPrawny: 'DOKUMENT_ROZLICZENIOWY' });
    const bezPdf = await fakturaPanelu(u.id, { storageKey: null });
    const s = ksef();
    await s.enqueueInvoice(vdr.id);
    await s.enqueueInvoice(bezPdf.id);
    await s.tick();
    expect((await stan(vdr.id)).ksefStatus).toBe(KsefStatus.NOT_APPLICABLE);
    expect((await stan(bezPdf.id)).ksefStatus).toBe(KsefStatus.NOT_APPLICABLE);
  });

  it('catch-up w cyklu łapie świeżą fakturę panelu (VFV z dostawcą)', async () => {
    const u = await uzytkownik();
    const f = await fakturaPanelu(u.id);
    await ksef().tick();
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.SUBMITTED);
  });

  it('do KSeF idzie dokładnie plik zapisany przy pobraniu PDF-u (ten, którego skrót jest w QR)', async () => {
    const u = await uzytkownik();
    const f = await fakturaPanelu(u.id, { ksefStatus: KsefStatus.PENDING });
    const k = ksef();
    // Klient pobiera PDF, zanim cykl wysłał fakturę: plik powstaje i zostaje zapisany.
    const { stream } = await faktury(k).openPdfStream(u.id, f.id);
    expect((await tresc(stream)).subarray(0, 5).toString()).toBe('%PDF-');
    const poPobraniu = await stan(f.id);
    expect(poPobraniu.ksefXml).toContain('<BrakID>1</BrakID>');
    expect(poPobraniu.ksefXmlSha256).toBe(skrotFakturyBase64Url(poPobraniu.ksefXml!));
    expect(poPobraniu.ksefSrodowisko).toBe('test');

    await k.tick();
    expect(wyslane).toEqual([poPobraniu.ksefXml]);
    const poWysylce = await stan(f.id);
    expect(poWysylce.ksefStatus).toBe(KsefStatus.SUBMITTED);
    expect(poWysylce.ksefXml).toBe(poPobraniu.ksefXml);

    await k.tick();
    const przyjeta = await stan(f.id);
    expect(przyjeta.ksefStatus).toBe(KsefStatus.ACCEPTED);
    const plik = await k.plikDoWizualizacji(f.id);
    expect(plik).toMatchObject({ numerKsef: przyjeta.ksefNumber, sha256: poPobraniu.ksefXmlSha256, srodowisko: 'test' });
    expect(wizualizacjaFa3(plik!.xml).nabywca).toMatchObject({ brakId: true, nazwa: 'Anna Nowak' });
  });

  it('XML i PDF tylko dla właściciela faktury (IDOR)', async () => {
    const wlasciciel = await uzytkownik();
    const obcy = await uzytkownik();
    const f = await fakturaPanelu(wlasciciel.id, { ksefStatus: KsefStatus.PENDING });
    const s = faktury(ksef());
    const { xml, filename } = await s.pobierzXmlKsef(wlasciciel.id, f.id);
    expect(xml).toBe((await stan(f.id)).ksefXml);
    expect(filename).toMatch(/-KSeF\.xml$/);
    await expect(s.pobierzXmlKsef(obcy.id, f.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.openPdfStream(obcy.id, f.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('faktura poza KSeF (NOT_APPLICABLE) nie ma XML-a do pobrania', async () => {
    const u = await uzytkownik();
    const f = await fakturaPanelu(u.id);
    await expect(faktury(ksef()).pobierzXmlKsef(u.id, f.id)).rejects.toBeInstanceOf(NotFoundException);
    expect((await stan(f.id)).ksefXml).toBeNull();
  });

  it('korekta czeka na numer KSeF faktury korygowanej, potem go niesie', async () => {
    const u = await uzytkownik();
    const k = ksef();
    const pierwotna = await fakturaPanelu(u.id, { ksefStatus: KsefStatus.PENDING, issuedAt: new Date(Date.now() - 60_000) });
    const korekta = await fakturaPanelu(u.id, {
      number: 'VFK/2026/10/0001',
      kind: 'KOREKTA',
      correctedId: pierwotna.id,
      correctionKind: 'WARTOSCIOWA',
      correctionReason: 'Zwrot',
      amount: new Prisma.Decimal('-61.50'),
      netAmount: new Prisma.Decimal('-50.00'),
      vatAmount: new Prisma.Decimal('-11.50'),
      correctedLineItems: [pozycja],
      lineItems: [{ ...pozycja, unitNet: '50.00', totalNet: '50.00', totalVat: '11.50', totalGross: '61.50' }],
      ksefStatus: KsefStatus.PENDING,
    });
    await k.tick(); // pierwotna wysłana, korekta czeka (pierwotna bez numeru)
    expect(wyslane).toHaveLength(1);
    expect((await stan(korekta.id)).ksefXml).toBeNull();
    // Dzierżawa wysyłki korekty z pierwszego cyklu — w teście zwalniamy ją od razu.
    await prisma().invoice.update({ where: { id: korekta.id }, data: { ksefSubmittedAt: null } });
    await k.tick(); // pierwotna dostaje numer, zaraz po niej (ten sam cykl) idzie korekta
    await prisma().invoice.update({ where: { id: korekta.id }, data: { ksefSubmittedAt: null } });
    await k.tick();
    const numerPierwotnej = (await stan(pierwotna.id)).ksefNumber!;
    expect(numerPierwotnej).toBeTruthy();
    const kor = await stan(korekta.id);
    expect(kor.ksefStatus).not.toBe(KsefStatus.PENDING);
    expect(kor.ksefXml).toContain(`<NrKSeFFaKorygowanej>${numerPierwotnej}</NrKSeFFaKorygowanej>`);
    expect(kor.ksefXml).toContain('<StanPrzed>1</StanPrzed>');
  });

  it('ponowienie odrzuconej faktury buduje plik od nowa (dane mogły zostać poprawione)', async () => {
    const u = await uzytkownik();
    const f = await fakturaPanelu(u.id, { ksefStatus: KsefStatus.REJECTED, ksefXml: '<stary/>', ksefXmlSha256: skrotFakturyBase64Url('<stary/>'), ksefSrodowisko: 'test' });
    const k = ksef();
    await k.retryInvoice(f.id, 'admin');
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.PENDING, ksefXml: null, ksefXmlSha256: null });
    await k.tick();
    expect(wyslane[0]).toContain('<Faktura xmlns=');
    expect((await stan(f.id)).ksefXml).toBe(wyslane[0]);
  });
});
