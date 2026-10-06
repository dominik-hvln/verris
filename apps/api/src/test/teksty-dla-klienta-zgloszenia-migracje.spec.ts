import { readFileSync } from 'fs';
import { join } from 'path';
import { MigrationWorkerScheduler } from '../subscriptions/migration-worker.scheduler.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { DOMYSLNE_AUTO, OpiekaZgloszenService, terminSlownie } from '../tickets/opieka-zgloszen.service.js';
import {
  STAN_ZGLOSZENIA_KLIENT,
  newTicketCreatedTemplate,
  ticketCustomerReminderTemplate,
  ticketReplyNotificationTemplate,
} from '../mail/templates/ticket-notifications.js';

/**
 * Teksty, które klient dostaje automatycznie przy zgłoszeniach i migracjach (06.10):
 *  - mail o nieudanej migracji cytował surowe `lastError` („rc=23”) i obiecywał „kilka godzin”, których nic nie pilnuje;
 *  - zmiana stanu na „czeka na klienta” szła w temacie jako `WAITING_CUSTOMER`, bo słownik w mailu nie znał tego stanu;
 *  - potwierdzenie obiecywało „1 godzinę roboczą”, a SLA zależy od priorytetu (1/4/12/24 h);
 *  - po terminie wychodziło „odpowiemy najpóźniej jak najszybciej”.
 */
describe('mail o nieudanej migracji', () => {
  const s = new MigrationWorkerScheduler({} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const blad = 'Krok files nie powiódł się po 3/3 próbach: files transfer failed (rc=23)';

  it('bez surowego błędu i bez obietnicy terminu; strona działa dalej u poprzedniego dostawcy', () => {
    const m = s['buildFailureMail']('k@x.pl', { id: 'abc', lastError: blad, targetDomain: 'firma.pl' } as never, null);
    for (const t of [m.text, m.html]) {
      expect(t).not.toMatch(/rc=23|files transfer|po stronie źródła|kilku godzin/);
      expect(t).toContain('poprzedniego dostawcy');
      expect(t).toContain('opiekun');
      expect(t).toContain('Dzień dobry');
    }
  });

  it('mail o zakończonej migracji bez żargonu', () => {
    const m = s['buildSuccessMail'](
      'k@x.pl',
      { id: 'abc', bytesTransferred: 10n, filesTransferred: 2, databasesMigrated: 1, mailboxesMigrated: 3, targetDomain: 'firma.pl', subscription: { account: null } },
      'Jan',
    );
    expect(m.text).not.toMatch(/IMAP|delta-sync|serwery nazw|delegowan/);
    expect(m.text).toContain('Skrzynki pocztowe');
  });
});

describe('mail o zmianie stanu zgłoszenia', () => {
  it('słownik klienta pokrywa wszystkie stany z DTO (status w bazie jest tekstem)', () => {
    const dto = readFileSync(join(import.meta.dirname, '..', 'tickets', 'tickets.dto.ts'), 'utf8');
    const stany = dto.match(/@IsIn\(\[('OPEN'[^\]]+)\]\)/)![1].match(/[A-Z_]+/g)!;
    expect(stany).toContain('WAITING_CUSTOMER');
    expect(Object.keys(STAN_ZGLOSZENIA_KLIENT).sort()).toEqual([...stany].sort());
  });

  it('WAITING_CUSTOMER → „Czekamy na Ciebie” w temacie, nie surowy kod', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      ticket: {
        findUnique: vi.fn().mockResolvedValue({ id: 't1', status: 'OPEN', assignedToId: null, user: { email: 'k@x.pl' } }),
        update: vi.fn().mockResolvedValue({ id: 't1', subject: 'SSL' }),
      },
      ticketEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const svc = new TicketsService(
      prisma as never,
      { send } as never,
      { get: () => 'https://panel.test' } as never,
      null as never,
      {} as never,
      {} as never,
      { wyslij: vi.fn().mockResolvedValue(false) } as never,
    );
    await svc.adminUpdateTicket('t1', { status: 'WAITING_CUSTOMER' } as never, 'a1');
    await new Promise((r) => setImmediate(r));
    expect(send).toHaveBeenCalledTimes(1);
    const mail = send.mock.calls[0][0];
    expect(mail.subject).toContain('Czekamy na Ciebie');
    expect(`${mail.subject}\n${mail.text}`).not.toContain('WAITING_CUSTOMER');
  });
});

describe('terminy i domyślne wiadomości opieki', () => {
  it('terminSlownie: „najpóźniej” tylko przy realnym terminie; po terminie „jak najszybciej”', () => {
    const teraz = new Date('2026-10-06T10:00:00+02:00');
    expect(terminSlownie(new Date('2026-10-06T14:00:00+02:00'), teraz)).toBe('najpóźniej dziś do 14:00');
    expect(terminSlownie(new Date('2026-10-07T09:00:00+02:00'), teraz)).toBe('najpóźniej 07.10 do 09:00');
    expect(terminSlownie(new Date('2026-10-06T09:00:00+02:00'), teraz)).toBe('jak najszybciej');
    expect(terminSlownie(null, teraz)).toBe('jak najszybciej');
  });

  it('domyślne treści: bez „najpóźniej” przed terminem, bez odmiany rodzaju, bez gołego linku', () => {
    for (const r of Object.values(DOMYSLNE_AUTO)) {
      expect(r.tresc).not.toMatch(/najpóźniej|przeczytał|\{\{link\}\}/);
    }
    expect(DOMYSLNE_AUTO.ZAJMUJE_SIE.tresc).toContain('zajmuje się już {{opiekun}}');
  });

  // Zapis w panelu admina utrwala wszystkie cztery treści — stara domyślna w bazie to nie nadpisanie.
  const opieka = (zapis: Record<string, { wlaczone: boolean; tresc: string }>, ticket?: object) => {
    const replyCreate = vi.fn().mockResolvedValue({});
    const prisma = {
      platformSetting: { findUnique: vi.fn().mockResolvedValue({ value: JSON.stringify(zapis) }) },
      ticket: { findUnique: vi.fn().mockResolvedValue(ticket ?? null) },
      ticketReply: { count: vi.fn().mockResolvedValue(0), create: replyCreate },
      ticketEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    const svc = new OpiekaZgloszenService(prisma as never, mailer as never, { get: () => 'https://p' } as never, {} as never, {} as never);
    return { svc, replyCreate, mailer };
  };

  it('zapisana stara domyślna → bieżąca domyślna; własna treść zostaje', async () => {
    const { svc } = opieka({
      ZAJMUJE_SIE: { wlaczone: true, tresc: '{{opiekun}} przeczytał(a) zgłoszenie #{{nr}} i już nad nim pracuje. Odezwiemy się najpóźniej {{termin}}.' },
      WCIAZ_PRACUJEMY: { wlaczone: false, tresc: 'Nasza własna treść #{{nr}}.' },
    });
    const u = await svc.ustawienia();
    expect(u.ZAJMUJE_SIE.tresc).toBe(DOMYSLNE_AUTO.ZAJMUJE_SIE.tresc);
    expect(u.WCIAZ_PRACUJEMY).toEqual({ wlaczone: false, tresc: 'Nasza własna treść #{{nr}}.' });
  });

  it('własna treść z „najpóźniej {{termin}}” nie dostaje „najpóźniej” dwa razy; mail podziękowania ma przycisk oceny', async () => {
    const ticket = {
      id: 'abcdefgh-1', subject: 'DNS', userId: 'u1', assignedToId: null, assignedTo: null,
      slaResponseDueAt: new Date(Date.now() + 3600_000), user: { email: 'k@x.pl', firstName: null, anonymizedAt: null },
    };
    const { svc, replyCreate } = opieka({ POTWIERDZENIE: { wlaczone: true, tresc: 'Mamy #{{nr}}, odpowiemy najpóźniej {{termin}}.' } }, ticket);
    await svc.wyslij(ticket.id, 'POTWIERDZENIE');
    expect(replyCreate.mock.calls[0][0].data.message).toMatch(/^Mamy #abcdefgh, odpowiemy najpóźniej (dziś|\d\d\.\d\d) do \d\d:\d\d\.$/);

    const p = opieka({}, ticket);
    await p.svc.wyslij(ticket.id, 'PODZIEKOWANIE');
    expect(p.replyCreate.mock.calls[0][0].data.message).not.toMatch(/https?:/);
    const mail = p.mailer.send.mock.calls[0][0];
    expect(mail.text).toContain('Oceń pomoc');
    expect(mail.text).toContain('/dashboard/support/abcdefgh-1#ocena');
  });

  it('potwierdzenie bez „1 godziny roboczej”, z terminem z SLA gdy jest; „Dzień dobry” zamiast „Cześć”', () => {
    const ctx = { ticketId: 'abcdefgh', subject: 'DNS', customerEmail: 'k@x.pl', panelUrl: 'https://p' };
    const z = newTicketCreatedTemplate({ ...ctx, termin: 'najpóźniej dziś do 14:00' });
    expect(z.text).toContain('Odpowiemy najpóźniej dziś do 14:00');
    expect(z.text).not.toMatch(/godzin[aę] robocz|1h/);
    expect(z.text).toContain('Dzień dobry');
    expect(z.text).not.toContain('Cześć');
    expect(newTicketCreatedTemplate(ctx).text).not.toMatch(/godzin|\d+ ?h\b/);
  });

  it('„opiekun” zamiast „support”; „za 1 dzień / 3 dni / 5 dni”', () => {
    const ctx = { ticketId: 'abcdefgh', subject: 'DNS', customerEmail: 'k@x.pl', panelUrl: 'https://p' };
    const o = ticketReplyNotificationTemplate({ to: 'k@x.pl', ticketId: 'abcdefgh', subject: 'DNS', excerpt: 'x', panelUrl: 'https://p', isFromStaff: true });
    expect(`${o.subject}\n${o.text.replace(/https?:\/\/\S+/g, '')}`).not.toMatch(/support/i);
    expect(o.subject).toContain('Odpowiedź opiekuna');
    expect(ticketCustomerReminderTemplate({ ...ctx, closeInDays: 1 }).text).toContain('za 1 dzień.');
    expect(ticketCustomerReminderTemplate({ ...ctx, closeInDays: 3 }).text).toContain('za 3 dni.');
    expect(ticketCustomerReminderTemplate({ ...ctx, closeInDays: 5 }).text).toContain('za 5 dni.');
  });
});
