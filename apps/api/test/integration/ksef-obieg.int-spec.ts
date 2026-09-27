import { KsefStatus } from '@verris/database';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { KsefService } from '../../src/ksef/ksef.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * X-04 — obieg faktury w KSeF na prawdziwej bazie: wysyłka → numer KSeF, niedostępność (tryb
 * offline z terminem), odrzucenie i ponowienie, nakładające się cykle. Klient KSeF i budowa XML
 * (osobno testowana w fa3-xml.builder.spec.ts) są atrapami.
 */
vi.mock('../../src/ksef/fa3-xml.builder.js', () => ({
  buildFa3Xml: () => ({ xml: '<Faktura/>' }),
  FaXmlValidationError: class extends Error {},
}));

const wyslane: string[] = [];
let sesjaPada = false;
let odmowa4xx = false;
let opoznienieMs = 0;
const klient = {
  openSession: async () => { if (sesjaPada) throw new Error('ECONNREFUSED ksef'); },
  terminateSession: async () => undefined,
  sendInvoice: async () => {
    await new Promise((r) => setTimeout(r, opoznienieMs));
    if (odmowa4xx) throw Object.assign(new Error('Błąd schematu'), { httpStatus: 400 });
    wyslane.push('x');
    return { elementReferenceNumber: `ref-${wyslane.length}` };
  },
  invoiceStatus: async (ref: string) => ({ processed: true, ksefReferenceNumber: `KSEF-${ref}`, acquisitionTimestamp: '2026-09-27T10:00:00Z' }),
};

function serwis() {
  const p = prisma() as never;
  const ustawienia = { getKsefRuntimeConfig: async () => ({ enabled: true, nip: '5250000000', token: 't', env: 'test' }) };
  const s = new KsefService(p, { get: () => undefined } as never, new AuditService(p), ustawienia as never);
  (s as unknown as { buildClient: () => Promise<unknown> }).buildClient = async () => klient;
  return s;
}

let n = 0;
async function faktura(status: KsefStatus = KsefStatus.PENDING) {
  n += 1;
  const u = await prisma().user.create({ data: { email: `ksef-${n}-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  return prisma().invoice.create({
    data: { userId: u.id, number: `FV/${n}/${Date.now()}`, amount: 123, netAmount: 100, issuedAt: new Date(), rodzajPrawny: 'FAKTURA_VAT', ksefStatus: status } as never,
  });
}
const stan = (id: string) => prisma().invoice.findUniqueOrThrow({ where: { id } });

describe('X-04 obieg faktur w KSeF', () => {
  beforeEach(async () => {
    await wyczyscBaze();
    wyslane.length = 0;
    sesjaPada = false;
    odmowa4xx = false;
    opoznienieMs = 0;
  });
  afterAll(rozlacz);

  it('wysyłka, potem numer KSeF w kolejnym cyklu', async () => {
    const f = await faktura();
    const s = serwis();
    await s.tick();
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.SUBMITTED, ksefElementRef: 'ref-1' });
    await s.tick();
    expect(await stan(f.id)).toMatchObject({ ksefStatus: KsefStatus.ACCEPTED, ksefNumber: 'KSEF-ref-1' });
  });

  it('KSeF nie odpowiada: tryb offline z terminem; po powrocie faktura idzie', async () => {
    const f = await faktura();
    sesjaPada = true;
    await serwis().tick();
    const off = await stan(f.id);
    expect(off.ksefStatus).toBe(KsefStatus.OFFLINE);
    expect(off.ksefTerminDo).not.toBeNull();
    sesjaPada = false;
    await serwis().tick();
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.SUBMITTED);
  });

  it('odrzucenie 4xx: REJECTED; ponowienie wraca do wysyłki', async () => {
    const f = await faktura();
    odmowa4xx = true;
    await serwis().tick();
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.REJECTED);
    odmowa4xx = false;
    await serwis().retryInvoice(f.id, 'admin');
    await serwis().tick();
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.SUBMITTED);
  });

  it('„Ponów” na fakturze przyjętej albo czekającej na numer: odmowa, bez drugiej wysyłki', async () => {
    const f = await faktura();
    const s = serwis();
    await s.tick(); // SUBMITTED
    await expect(s.retryInvoice(f.id, 'admin')).rejects.toThrow('odrzuconą');
    await s.tick(); // ACCEPTED
    await expect(s.retryInvoice(f.id, 'admin')).rejects.toThrow('odrzuconą');
    expect(wyslane).toHaveLength(1);
    expect((await stan(f.id)).ksefStatus).toBe(KsefStatus.ACCEPTED);
  });

  it('dwa nakładające się cykle: każda faktura wysłana raz', async () => {
    await faktura();
    await faktura();
    opoznienieMs = 150;
    await Promise.all([serwis().tick(), serwis().tick()]);
    expect(wyslane).toHaveLength(2);
  });
});
