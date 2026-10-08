import { BadRequestException, ForbiddenException, type ExecutionContext, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RUNBOOKI, RUNBOOK_KLUCZE, zalecanyRunbook } from '@verris/contracts';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { TicketsController } from './tickets.controller.js';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto, PowiazanieUslugiDto } from './tickets.dto.js';
import { ZgloszenieDiagnostykaController } from '../subscriptions/zgloszenie-diagnostyka.controller.js';

/** PB-43 — uprawnienia nowych tras, walidacja wejścia i katalog runbooków (bez bazy; baza: test/integration). */

type Rola = 'USER' | 'STAFF' | 'ADMIN';

async function wpuszcza(klasa: Type<unknown>, metoda: string, role: Rola, uprawnienia: string[] = []): Promise<boolean> {
  const handler = (klasa.prototype as Record<string, unknown>)[metoda] as () => unknown;
  const ctx = {
    getHandler: () => handler,
    getClass: () => klasa,
    switchToHttp: () => ({ getRequest: () => ({ user: { userId: 'u1', role } }) }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  const prisma = { user: { findUnique: async () => ({ staffRole: { permissions: uprawnienia } }) } };
  const straznicy = [
    ...((Reflect.getMetadata(GUARDS_METADATA, klasa) as unknown[]) ?? []),
    ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
  ];
  expect(straznicy).toContain(StaffPermissionsGuard);
  for (const S of straznicy) {
    try {
      if (S === RolesGuard && !new RolesGuard(reflector).canActivate(ctx)) return false;
      if (S === StaffPermissionsGuard && !(await new StaffPermissionsGuard(reflector, prisma as never).canActivate(ctx))) return false;
    } catch (e) {
      if (e instanceof ForbiddenException) return false;
      throw e;
    }
  }
  return true;
}

describe('PB-43 — uprawnienia', () => {
  it('zmiana usługi zgłoszenia: TICKETS_MANAGE; klient i sam podgląd — nie', async () => {
    expect(await wpuszcza(TicketsController, 'adminLinkSubscription', 'USER')).toBe(false);
    expect(await wpuszcza(TicketsController, 'adminLinkSubscription', 'STAFF', ['TICKETS_VIEW'])).toBe(false);
    expect(await wpuszcza(TicketsController, 'adminLinkSubscription', 'STAFF', ['TICKETS_MANAGE'])).toBe(true);
    expect(await wpuszcza(TicketsController, 'adminLinkSubscription', 'ADMIN')).toBe(true);
  });

  it('diagnostyka z rozmowy: TICKETS_MANAGE (odpytuje węzeł i zapisuje stan); sam podgląd, klient i operator bez zgłoszeń — nie', async () => {
    expect(await wpuszcza(ZgloszenieDiagnostykaController, 'diagnostyka', 'USER')).toBe(false);
    expect(await wpuszcza(ZgloszenieDiagnostykaController, 'diagnostyka', 'STAFF', ['NODES_VIEW'])).toBe(false);
    expect(await wpuszcza(ZgloszenieDiagnostykaController, 'diagnostyka', 'STAFF', ['TICKETS_VIEW'])).toBe(false);
    expect(await wpuszcza(ZgloszenieDiagnostykaController, 'diagnostyka', 'STAFF', ['TICKETS_MANAGE'])).toBe(true);
    expect(await wpuszcza(ZgloszenieDiagnostykaController, 'diagnostyka', 'ADMIN')).toBe(true);
  });
});

describe('PB-43 — zakres usług subkonta w widoku zgłoszenia', () => {
  it('kontroler przekazuje zakres do widoku zgłoszenia i do widoku po dołączeniu plików', async () => {
    const svc = { findOne: vi.fn(async () => ({})), addOpeningAttachments: vi.fn(async () => ({})) };
    const c = new TicketsController(svc as never, {} as never, {} as never, {} as never);
    const subkonto = { userId: 'k1', serviceScope: ['s1'] };
    await c.findOne('t1', subkonto);
    expect(svc.findOne).toHaveBeenCalledWith('t1', 'k1', ['s1']);
    await c.addOpeningAttachments('t1', subkonto, []);
    expect(svc.addOpeningAttachments).toHaveBeenCalledWith('t1', 'k1', [], ['s1']);
  });
});

describe('PB-43 — walidacja wejścia', () => {
  const bledy = (klasa: Type<object>, v: object) =>
    validateSync(plainToInstance(klasa, v), { whitelist: true, forbidNonWhitelisted: true }).map((e) => e.property);

  it('zgłoszenie przyjmuje subscriptionId tylko jako UUID', () => {
    const baza = { subject: 'Strona', message: 'Nie działa od rana.' };
    expect(bledy(CreateTicketDto, { ...baza, subscriptionId: '3f1c2d4e-1111-4222-8333-944455556666' })).toEqual([]);
    expect(bledy(CreateTicketDto, { ...baza, subscriptionId: 'cudza; DROP' })).toEqual(['subscriptionId']);
  });

  it('zmiana powiązania: UUID albo null (odłączenie)', () => {
    expect(bledy(PowiazanieUslugiDto, { subscriptionId: null })).toEqual([]);
    expect(bledy(PowiazanieUslugiDto, { subscriptionId: 'x' })).toEqual(['subscriptionId']);
  });

  it('runbook spoza katalogu → 400 (wcześniej przechodził każdy napis od 3 znaków)', async () => {
    const prisma = { ticket: { update: vi.fn(async () => ({ userId: 'k1' })) } };
    const audit = { record: vi.fn(async () => undefined) };
    const s = new TicketsService(prisma as never, {} as never, {} as never, {} as never, audit as never, {} as never, {} as never);
    await expect(s.adminApplyRunbook('t1', 'op', 'cokolwiek')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ticket.update).not.toHaveBeenCalled();
    await s.adminApplyRunbook('t1', 'op', 'poczta');
    expect(prisma.ticket.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { runbookKey: 'poczta' } });
  });
});

describe('PB-43 — katalog runbooków', () => {
  it('najczęstsze sprawy mają runbook z krokami; stare klucze zostają', () => {
    for (const k of ['strona-nie-dziala', 'poczta', 'ssl', 'migracja-zatrzymana', 'hosting-dns-tls-check', 'billing-payment-check']) {
      expect(RUNBOOK_KLUCZE).toContain(k);
    }
    expect(new Set(RUNBOOK_KLUCZE).size).toBe(RUNBOOKI.length);
    for (const r of RUNBOOKI) expect(r.kroki.length).toBeGreaterThanOrEqual(3);
  });

  it('zalecany runbook wg kategorii treści, a bez niej wg działu', () => {
    expect(zalecanyRunbook('AWARIA', 'TECHNICAL').klucz).toBe('strona-nie-dziala');
    expect(zalecanyRunbook('POCZTA', 'TECHNICAL').klucz).toBe('poczta');
    expect(zalecanyRunbook('SSL', 'TECHNICAL').klucz).toBe('ssl');
    expect(zalecanyRunbook('MIGRACJA', 'TECHNICAL').klucz).toBe('migracja-zatrzymana');
    expect(zalecanyRunbook('INNE', 'BILLING').klucz).toBe('billing-payment-check');
    expect(zalecanyRunbook(null, 'TECHNICAL').klucz).toBe('hosting-dns-tls-check');
  });

  it('kroki dla obsługi — bez portu panelu serwera i nazwy silnika', () => {
    const wszystko = RUNBOOKI.flatMap((r) => [r.nazwa, r.kiedy, ...r.kroki]).join('\n');
    expect(wszystko).not.toMatch(/DirectAdmin|\bDA\b|CustomBuild|2222/);
  });
});
