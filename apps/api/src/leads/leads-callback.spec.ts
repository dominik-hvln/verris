import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LeadsService } from './leads.service.js';
import { LeadsPublicController } from './leads-public.controller.js';
import { SubmitCallbackDto } from './dto/submit-callback.dto.js';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../common/guards/rate-limit.guard.js';

/** 1.11 — pas „Wolisz porozmawiać?” na verris.pl: prośba o telefon zwrotny. */
describe('Prośba o telefon (CALLBACK)', () => {
  function stanowisko() {
    const prisma = { siteLead: { create: vi.fn(async (a: { data: object }) => ({ id: 'cb1', ...a.data })) } };
    const mailer = { send: vi.fn(async (_m: { to: string; subject?: string; text?: string; replyTo?: string }) => undefined) };
    const audit = { record: vi.fn(async () => undefined) };
    const config = { get: (k: string) => (k === 'leadsNotifyEmail' ? 'zespol@verris.pl' : undefined) };
    const svc = new LeadsService(prisma as never, mailer as never, config as never, audit as never);
    return { svc, prisma, mailer, audit };
  }
  const dto = { name: 'Anna', phone: '600  123 456', preferredTime: 'rano', consentText: 'Numer wykorzystamy tylko do tej rozmowy.', page: 'https://verris.pl/' };

  it('zapisuje lead CALLBACK bez e-maila, z numerem i porą', async () => {
    const s = stanowisko();
    await expect(s.svc.submitCallback(dto as never, { ip: '1.2.3.4' })).resolves.toEqual({ status: 'received' });
    expect(s.prisma.siteLead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'CALLBACK', status: 'RECEIVED', email: null, phone: '600 123 456', preferredTime: 'rano', name: 'Anna' }),
    });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'SITE_LEAD_SUBMITTED', details: expect.objectContaining({ kind: 'CALLBACK' }) }));
  });

  it('powiadamia tylko zespół (numer i pora w treści), bez Reply-To', async () => {
    const s = stanowisko();
    await s.svc.submitCallback(dto as never, {});
    await vi.waitFor(() => expect(s.mailer.send).toHaveBeenCalledTimes(1));
    const m = s.mailer.send.mock.calls[0][0];
    expect(m.to).toBe('zespol@verris.pl');
    expect(m.subject).toContain('600 123 456');
    expect(m.text).toContain('rano');
    expect(m.replyTo).toBeUndefined();
  });

  it('trasa ma limit 3/godz. per IP i per numer i weryfikuje captchę przed zapisem', async () => {
    const o = new Reflector().get<RateLimitOptions>(RATE_LIMIT_KEY, LeadsPublicController.prototype.callback);
    expect(o).toMatchObject({ limit: 3, keyByBodyField: 'phone' });
    const leads = { submitCallback: vi.fn() };
    const captcha = { verify: vi.fn(async () => { throw new Error('captcha'); }) };
    const ctl = new LeadsPublicController(leads as never, captcha as never);
    await expect(ctl.callback(dto as never, { ip: '1.2.3.4', headers: {} } as never)).rejects.toThrow('captcha');
    expect(leads.submitCallback).not.toHaveBeenCalled();
  });

  it.each([
    ['600 123 456', true],
    ['+48 600-123-456', true],
    ['+420 123 456 789', true],
    ['12345', false],
    ['600123456; drop', false],
    ['abc defg hij', false],
  ])('walidacja numeru %s → %s', async (phone, ok) => {
    const e = await validate(plainToInstance(SubmitCallbackDto, { ...dto, phone }));
    expect(e.some((x) => x.property === 'phone')).toBe(!ok);
  });

  it('pora dnia spoza listy i brak klauzuli są odrzucane', async () => {
    const e = await validate(plainToInstance(SubmitCallbackDto, { name: 'A', phone: '600123456', preferredTime: 'noc' }));
    expect(e.map((x) => x.property).sort()).toEqual(['consentText', 'preferredTime']);
  });
});
