import { AuditService } from '../../src/common/audit/audit.service.js';
import { RetentionScheduler } from '../../src/compliance/retention.scheduler.js';
import { stanBlokad } from '../../src/servers/blokady-ip.js';
import { prisma, rozlacz, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * Audyt Fali 3 — retencja danych osobowych na prawdziwym Postgresie (surowy SQL): wyniki zadań węzła z danymi
 * osobowymi po 30 dniach (lista blokad fail2ban węzła, trafienia WAF, dziennik poczty, kolejka poczty, log usług)
 * oraz adresy IP w szczegółach wpisów dziennika F3.2 po ~24 mies., jak kolumna ipAddress.
 */
const DZIEN = 86_400_000;
const temu = (dni: number) => new Date(Date.now() - dni * DZIEN);

describe('audyt Fali 3 – retencja danych osobowych', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  const przebieg = () => {
    const p = prisma() as never;
    return new RetentionScheduler(p, new AuditService(p), { expireDueExports: async () => 0 } as never).run();
  };

  it('zadania węzła: po 30 dniach wynik i IP/adres/fraza/filtr z parametrów znikają; w toku, limit kolejki, stan usług i nowsze zostają', async () => {
    const w = await utworzWezel();
    const z = (kind: string, dni: number, payload: Record<string, unknown>, status = 'COMPLETED') =>
      prisma().nodeTask.create({ data: { serverId: w.id, kind: kind as never, status: status as never, payload: payload as never, outputLog: `wynik ${kind}`, createdAt: temu(dni) } });
    const stare = {
      ip: await z('IP_BLOCKS', 31, { mode: 'unban', ip: '198.51.100.23' }),
      waf: await z('WAF_HITS', 31, { domains: 'x.pl' }),
      log: await z('MAIL_LOG', 31, { domains: 'x.pl', address: 'ania@obca.pl' }),
      kolejka: await z('MAIL_QUEUE', 31, { mode: 'remove', daUser: 'jan1', ids: 'a,b' }),
      logUslug: await z('NODE_SERVICES', 31, { mode: 'log', name: 'exim-main', filter: 'jan@firma.pl', mask: '0' }),
    };
    const zostaja = {
      nowe: await z('IP_BLOCKS', 29, { mode: 'list' }),
      wToku: await z('WAF_HITS', 40, { domains: 'x.pl' }, 'RUNNING'),
      limit: await z('MAIL_QUEUE', 40, { mode: 'limit', daUser: 'jan1', limit: '200' }),
      status: await z('NODE_SERVICES', 40, { mode: 'status' }),
      inne: await z('DISK_USAGE', 40, { path: '/' }),
    };

    await przebieg();

    const po = async (id: string) => prisma().nodeTask.findUniqueOrThrow({ where: { id } });
    expect(await po(stare.ip.id)).toMatchObject({ outputLog: null, payload: { mode: 'unban' } });
    expect(await po(stare.waf.id)).toMatchObject({ outputLog: null, payload: { domains: 'x.pl' } });
    expect(await po(stare.log.id)).toMatchObject({ outputLog: null, payload: { domains: 'x.pl' } });
    expect(await po(stare.kolejka.id)).toMatchObject({ outputLog: null, payload: { mode: 'remove', ids: 'a,b' } });
    expect(await po(stare.logUslug.id)).toMatchObject({ outputLog: null, payload: { mode: 'log', name: 'exim-main', mask: '0' } });
    expect((await po(stare.logUslug.id)).payload).not.toHaveProperty('filter');
    for (const t of Object.values(zostaja)) expect((await po(t.id)).outputLog).toMatch(/^wynik /);
    expect(await prisma().auditLog.findFirstOrThrow({ where: { action: 'RETENTION_PURGE' } })).toMatchObject({ details: expect.objectContaining({ nodeTaskOutputsPurged: 5 }) });

    // Wyczyszczona pełna lista to „nie wczytano”, nie „brak blokad”.
    const zadania = await prisma().nodeTask.findMany({ where: { serverId: w.id, kind: 'IP_BLOCKS', id: stare.ip.id } });
    expect(stanBlokad(zadania).lista).toBeNull();
  });

  it('paczka 126: dziennik wysyłek po 12 mies. znika (bez kampanii w toku); adres nadawcy formularza kreatora usunięty z metadanych', async () => {
    const p = prisma();
    const kampania = (status: string) => p.marketingCampaign.create({ data: { name: status, subject: 's', bodyMarkdown: 'b', status: status as never } });
    const wTrakcie = await kampania('SENDING');
    const wyslana = await kampania('SENT');
    const wpis = (dni: number, extra: Record<string, unknown> = {}) =>
      p.emailLog.create({ data: { toEmail: 'jan@firma.pl', category: 'TRANSACTIONAL', subject: 's', status: 'SENT', createdAt: temu(dni), ...extra } as never });
    const stary = await wpis(366);
    const staryKampanii = await wpis(400, { category: 'MARKETING', campaignId: wyslana.id });
    const kampaniaWToku = await wpis(400, { category: 'MARKETING', campaignId: wTrakcie.id });
    const mlodszy = await wpis(364);
    const formularz = await wpis(10, { tag: 'kreator.formularz', metadata: { replyTo: 'anna@nadawca.test' } });
    const obsluga = await wpis(10, { tag: 'ticket.reply', metadata: { replyTo: 'support@verris.pl' } });

    await przebieg();

    const zostaly = new Set((await p.emailLog.findMany({ select: { id: true } })).map((w) => w.id));
    expect(zostaly.has(stary.id)).toBe(false);
    expect(zostaly.has(staryKampanii.id)).toBe(false);
    expect([kampaniaWToku.id, mlodszy.id, formularz.id, obsluga.id].every((id) => zostaly.has(id))).toBe(true);
    expect((await p.emailLog.findUniqueOrThrow({ where: { id: formularz.id } })).metadata).toEqual({});
    expect((await p.emailLog.findUniqueOrThrow({ where: { id: obsluga.id } })).metadata).toEqual({ replyTo: 'support@verris.pl' });
    expect(await p.auditLog.findFirstOrThrow({ where: { action: 'RETENTION_PURGE' } })).toMatchObject({ details: expect.objectContaining({ emailLogsPurged: 2 }) });
  });

  it('dziennik: IP w szczegółach wpisów F3.2 znika po ~24 mies.; inne pola i młodsze wpisy zostają', async () => {
    const wpis = (action: string, details: Record<string, unknown>, dni: number) => prisma().auditLog.create({ data: { action, details: details as never, createdAt: temu(dni) } });
    const a = await wpis('OPERATOR_ACCOUNT_VIEWED', { sekcja: 'blokady-ip', ip: '198.51.100.23' }, 800);
    const b = await wpis('HOSTING_IP_UNBLOCK_QUEUED', { target: '198.51.100.23' }, 800);
    const c = await wpis('NODE_IP_UNBLOCK_QUEUED', { serverId: 's1', ip: '198.51.100.24', powod: 'x' }, 800);
    const d = await wpis('OPERATOR_ACCOUNT_VIEWED', { sekcja: 'blokady-ip', ip: '198.51.100.25' }, 100);
    const e = await wpis('SITE_CLONED', { target: 'nowa.pl' }, 800);

    await przebieg();

    const det = async (id: string) => (await prisma().auditLog.findUniqueOrThrow({ where: { id } })).details;
    expect(await det(a.id)).toEqual({ sekcja: 'blokady-ip' });
    expect(await det(b.id)).toEqual({});
    expect(await det(c.id)).toEqual({ serverId: 's1', powod: 'x' });
    expect(await det(d.id)).toEqual({ sekcja: 'blokady-ip', ip: '198.51.100.25' });
    expect(await det(e.id)).toEqual({ target: 'nowa.pl' });
  });
});
