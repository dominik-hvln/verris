import { LeadsService } from '../../src/leads/leads.service.js';
import { prisma, rozlacz, wyczyscBaze } from './setup.js';

/**
 * A2-01 + A2-02 (paczka 109) na prawdziwej bazie: plan migracji bez zgody, potwierdzenie i wypis zgody, retencja
 * danych z formularzy verris.pl (kontakt, prośba o telefon, plan migracji). Przed paczką `SiteLead` nie miał
 * retencji — `usunStare` nie istniało, a rekordy zostawały na zawsze.
 */
function uslugi() {
  const maile: Array<{ to: string; tag: string; text: string }> = [];
  const mailer = { send: async (m: { to: string; tag: string; text: string }) => (maile.push(m), { delivered: true }) };
  const config = { get: (k: string) => ({ leadsNotifyEmail: 'zespol@verris.pl', publicApiUrl: 'https://api.test' })[k] };
  const audit = { record: async () => undefined };
  return { leads: new LeadsService(prisma() as never, mailer as never, config as never, audit as never), maile };
}

const DZIEN = 24 * 60 * 60 * 1000;
const temu = (dni: number, now: Date) => new Date(now.getTime() - dni * DZIEN);

describe('Formularze verris.pl – plan migracji i retencja', () => {
  // SiteLead nie ma relacji do tabel z `wyczyscBaze` — czyścimy go sami.
  beforeEach(async () => {
    await wyczyscBaze();
    await prisma().siteLead.deleteMany();
  });
  afterAll(rozlacz);

  it('plan bez zgody → RECEIVED; ze zgodą → potwierdzenie i wypis gaszą zgodę', async () => {
    const { leads, maile } = uslugi();
    await leads.submit({ kind: 'MIGRATION', email: 'bez@firma.pl', source: 'migration_plan' }, {});
    await leads.submit({ kind: 'MIGRATION', email: 'ze@firma.pl', marketingConsent: true, consentText: 'Chcę dostawać wiadomości' }, {});
    await vi.waitFor(() => expect(maile.filter((m) => m.tag === 'lead.plan-migracji')).toHaveLength(2));

    const bez = await prisma().siteLead.findFirstOrThrow({ where: { email: 'bez@firma.pl' } });
    expect(bez).toMatchObject({ status: 'RECEIVED', marketingConsent: false, confirmToken: null });

    const ze = await prisma().siteLead.findFirstOrThrow({ where: { email: 'ze@firma.pl' } });
    expect(ze).toMatchObject({ status: 'PENDING', marketingConsent: true, consentText: 'Chcę dostawać wiadomości' });
    expect(await leads.tokenPotwierdzeniaIstnieje(ze.confirmToken!)).toBe(true);
    expect(await leads.confirm(ze.confirmToken!)).toEqual({ ok: true });
    expect(await prisma().siteLead.findUniqueOrThrow({ where: { id: ze.id } })).toMatchObject({ status: 'CONFIRMED', confirmToken: null });

    expect(await leads.tokenWypisu(ze.unsubToken)).toBe('aktywny');
    expect(await leads.unsubscribe(ze.unsubToken)).toEqual({ ok: true });
    expect(await prisma().siteLead.findUniqueOrThrow({ where: { id: ze.id } })).toMatchObject({ status: 'UNSUBSCRIBED', marketingConsent: false });
    expect(await leads.tokenWypisu(ze.unsubToken)).toBe('wypisany');
  });

  it('retencja usuwa tylko rekordy po swoim okresie', async () => {
    const { leads } = uslugi();
    const now = new Date();
    const lead = (email: string, dane: Record<string, unknown>) =>
      prisma().siteLead.create({ data: { email, kind: 'CONTACT', status: 'RECEIVED', ...dane } as never });

    await lead('kontakt-stary@x.pl', { createdAt: temu(366, now) });
    await lead('kontakt-nowy@x.pl', { createdAt: temu(300, now) });
    await lead(null as never, { kind: 'CALLBACK', phone: '+48 600 000 000', name: 'Jan', createdAt: temu(91, now) });
    await lead('telefon-nowy@x.pl', { kind: 'CALLBACK', phone: '+48 600 000 001', name: 'Ola', createdAt: temu(80, now) });
    await lead('plan-stary@x.pl', { kind: 'MIGRATION', createdAt: temu(31, now) });
    await lead('plan-nowy@x.pl', { kind: 'MIGRATION', createdAt: temu(20, now) });
    await lead('zgoda-niepotw@x.pl', { kind: 'MIGRATION', status: 'PENDING', createdAt: temu(8, now) });
    await lead('zgoda-swieza@x.pl', { kind: 'MIGRATION', status: 'PENDING', createdAt: temu(2, now) });
    await lead('zgoda-stara@x.pl', { kind: 'MIGRATION', status: 'CONFIRMED', createdAt: temu(800, now), confirmedAt: temu(731, now) });
    await lead('zgoda-wazna@x.pl', { kind: 'MIGRATION', status: 'CONFIRMED', createdAt: temu(400, now), confirmedAt: temu(399, now) });

    expect(await leads.usunStare(now)).toBe(5);
    const zostaly = (await prisma().siteLead.findMany({ select: { email: true }, orderBy: { email: 'asc' } })).map((r) => r.email);
    expect(zostaly).toEqual(['kontakt-nowy@x.pl', 'plan-nowy@x.pl', 'telefon-nowy@x.pl', 'zgoda-swieza@x.pl', 'zgoda-wazna@x.pl']);

    // Wypis: rekord znika 30 dni po wypisie (updatedAt ustawia Prisma — cofamy go ręcznie SQL-em).
    const w = await prisma().siteLead.findFirstOrThrow({ where: { email: 'zgoda-wazna@x.pl' } });
    await leads.unsubscribe(w.unsubToken);
    expect(await leads.usunStare(now)).toBe(0);
    await prisma().$executeRaw`UPDATE "SiteLead" SET "updatedAt" = ${temu(31, now)} WHERE id = ${w.id}`;
    expect(await leads.usunStare(now)).toBe(1);
  });
});
