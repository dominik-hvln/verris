import { BadRequestException } from '@nestjs/common';
import { LeadsService } from './leads.service.js';
import { LeadsPublicController } from './leads-public.controller.js';
import { RETENCJA_LEADOW_DNI, warunekRetencjiLeadow } from './leads-retencja.js';

/**
 * A2-01 (paczka 109) — plan migracji z verris.pl/przenies-strone. Na starym kodzie: bez zgody marketingowej API
 * odrzucało zgłoszenie (400 „Zgoda marketingowa jest wymagana”), po potwierdzeniu nie przychodził żaden plan,
 * a link wypisu nie istniał. A2-02 — `SiteLead` nie miał retencji.
 */
function stanowisko() {
  const prisma = {
    siteLead: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => ({ id: 'l1', unsubToken: 'wypis-1', ...a.data })),
      findUnique: vi.fn(),
      update: vi.fn(async () => undefined),
      deleteMany: vi.fn(async () => ({ count: 3 })),
    },
  };
  const mailer = { send: vi.fn(async (_m: { to: string; subject: string; text: string; html: string }) => undefined) };
  const audit = { record: vi.fn(async () => undefined) };
  const config = { get: (k: string) => ({ publicApiUrl: 'https://api.test', clientPanelUrl: 'https://panel.test' })[k] };
  const svc = new LeadsService(prisma as never, mailer as never, config as never, audit as never);
  const doNadawcy = () => mailer.send.mock.calls.map((c) => c[0]).filter((m) => m.to === 'jan@firma.pl');
  return { svc, prisma, mailer, audit, doNadawcy };
}

describe('Plan migracji bez warunku zgody marketingowej (A2-01)', () => {
  it('bez zgody: zgłoszenie przyjęte, plan przychodzi mailem, bez potwierdzania zgody i bez wypisu', async () => {
    const s = stanowisko();
    await expect(s.svc.submit({ kind: 'MIGRATION', email: 'Jan@firma.pl', marketingConsent: false } as never, {})).resolves.toEqual({
      status: 'received',
    });
    expect(s.prisma.siteLead.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RECEIVED', marketingConsent: false, confirmToken: null, consentAt: null }) }),
    );
    await vi.waitFor(() => expect(s.doNadawcy()).toHaveLength(1));
    const m = s.doNadawcy()[0];
    expect(m.subject).toContain('Plan przeniesienia strony');
    expect(m.text).toContain('Przełącz domenę');
    expect(m.text).not.toContain('/public/leads/confirm');
    expect(m.text).not.toContain('/public/leads/unsubscribe');
  });

  it('ze zgodą: plan od razu, a w nim przycisk potwierdzenia zgody i działający link wypisu', async () => {
    const s = stanowisko();
    await expect(s.svc.submit({ kind: 'MIGRATION', email: 'jan@firma.pl', marketingConsent: true } as never, {})).resolves.toEqual({
      status: 'pending',
    });
    const dane = s.prisma.siteLead.create.mock.calls[0][0].data;
    expect(dane).toMatchObject({ status: 'PENDING', marketingConsent: true });
    expect(dane.confirmToken).toEqual(expect.any(String));
    await vi.waitFor(() => expect(s.doNadawcy()).toHaveLength(1));
    const m = s.doNadawcy()[0];
    expect(m.html).toContain(`https://api.test/public/leads/confirm?token=${dane.confirmToken as string}`);
    expect(m.text).toContain('https://api.test/public/leads/unsubscribe?token=wypis-1');
  });

  it('wypis: zgoda gaśnie raz (status UNSUBSCRIBED), drugi klik niczego nie zmienia; bez tokenu → 400', async () => {
    const s = stanowisko();
    s.prisma.siteLead.findUnique.mockResolvedValueOnce({ id: 'l1', status: 'CONFIRMED' });
    await expect(s.svc.unsubscribe('wypis-1')).resolves.toEqual({ ok: true });
    expect(s.prisma.siteLead.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { status: 'UNSUBSCRIBED', marketingConsent: false, confirmToken: null },
    });
    s.prisma.siteLead.findUnique.mockResolvedValueOnce({ id: 'l1', status: 'UNSUBSCRIBED' });
    await s.svc.unsubscribe('wypis-1');
    expect(s.prisma.siteLead.update).toHaveBeenCalledTimes(1);
    await expect(s.svc.unsubscribe('  ')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Strony potwierdzenia i wypisu (GET bez skutków, POST zapisuje)', () => {
  const ctl = (leads: Record<string, unknown>) => new LeadsPublicController(leads as never, {} as never);

  it('GET /confirm z ważnym tokenem: przycisk POST, bez zapisu; POST potwierdza', async () => {
    const leads = { tokenPotwierdzeniaIstnieje: vi.fn(async () => true), confirm: vi.fn(async () => ({ ok: true })) };
    const html = await ctl(leads).confirmStrona('tok');
    expect(html).toContain('<form method="post" action="/public/leads/confirm">');
    expect(leads.confirm).not.toHaveBeenCalled();
    expect(await ctl(leads).confirm({ token: 'tok' })).toContain('Zgoda potwierdzona');
    expect(leads.confirm).toHaveBeenCalledWith('tok');
    await expect(ctl(leads).confirmStrona(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('GET /unsubscribe: strona z przyciskiem; już wypisany → „Wypisano”; POST (formularz i one-click) wypisuje', async () => {
    const leads = { tokenWypisu: vi.fn(async () => 'aktywny'), unsubscribe: vi.fn(async () => ({ ok: true })) };
    expect(await ctl(leads).unsubscribeStrona('w1')).toContain('<form method="post" action="/public/leads/unsubscribe">');
    expect(leads.unsubscribe).not.toHaveBeenCalled();
    leads.tokenWypisu.mockResolvedValueOnce('wypisany');
    expect(await ctl(leads).unsubscribeStrona('w1')).toContain('Wypisano');
    expect(await ctl(leads).unsubscribe(undefined, { token: 'w1' })).toContain('Wypisano');
    await ctl(leads).unsubscribe('w2', {});
    expect(leads.unsubscribe).toHaveBeenLastCalledWith('w2');
    await expect(ctl(leads).unsubscribeStrona(undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Retencja formularzy www (A2-02)', () => {
  it('usunStare kasuje rekordy wg warunku retencji', async () => {
    const s = stanowisko();
    const now = new Date('2026-12-01T00:00:00Z');
    await expect(s.svc.usunStare(now)).resolves.toBe(3);
    expect(s.prisma.siteLead.deleteMany).toHaveBeenCalledWith({ where: warunekRetencjiLeadow(now) });
  });

  it('progi: telefon 90 dni, kontakt 12 miesięcy, niepotwierdzona zgoda 7 dni – każdy rodzaj formularza ma okres', () => {
    const now = new Date('2026-12-01T00:00:00Z');
    const lub = warunekRetencjiLeadow(now).OR as Array<Record<string, { lt?: Date } | string | object>>;
    const prog = (kind: string, status?: string) =>
      (lub.find((w) => w.kind === kind && (status === undefined || w.status === status))?.createdAt as { lt: Date }).lt;
    const dni = (d: Date) => Math.round((now.getTime() - d.getTime()) / 86_400_000);
    expect(dni(prog('CALLBACK'))).toBe(RETENCJA_LEADOW_DNI.TELEFON);
    expect(dni(prog('CONTACT'))).toBe(365);
    expect(dni(prog('MIGRATION', 'PENDING'))).toBe(7);
    expect(dni(prog('MIGRATION', 'RECEIVED'))).toBe(30);
    expect(lub.some((w) => w.status === 'UNSUBSCRIBED' && w.kind === undefined)).toBe(true);
  });
});
