import { ExecutionContext, ForbiddenException, Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA } from '@nestjs/common/constants.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard.js';
import { AuditAdminController } from '../common/audit/audit.admin.controller.js';
import { ComplianceAdminController } from '../compliance/compliance.admin.controller.js';
import { PlansAdminController } from '../plans/plans.admin.controller.js';

/**
 * Pozycja 13 — AUDIT_VIEW, COMPLIANCE_MANAGE i PLANS_MANAGE były w katalogu i w rolach, ale żaden guard
 * ich nie czytał (trasy tylko ADMIN). Sprawdzamy prawdziwymi strażnikami (RolesGuard + StaffPermissionsGuard)
 * na metadanych kontrolerów: STAFF z uprawnieniem wchodzi tam, gdzie mówi nazwa, bez niego — nie;
 * ADMIN bez zmian.
 */
async function wpuszcza(klasa: Type, metoda: string, user: { role: string; userId: string }, uprawnienia: string[]) {
  const prisma = { user: { findUnique: async () => ({ staffRole: { id: 'r', name: 'r', permissions: uprawnienia } }) } };
  const ctx = {
    getHandler: () => (klasa.prototype as Record<string, unknown>)[metoda],
    getClass: () => klasa,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
  const reflector = new Reflector();
  if (!new RolesGuard(reflector).canActivate(ctx)) return false;
  return new StaffPermissionsGuard(reflector, prisma as never).canActivate(ctx).catch((e) => {
    if (e instanceof ForbiddenException) return false;
    throw e;
  });
}

const trasy = (klasa: Type) =>
  Object.getOwnPropertyNames(klasa.prototype).filter(
    (m) => m !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, (klasa.prototype as Record<string, unknown>)[m]) !== undefined,
  );
const STAFF = { role: 'STAFF', userId: 'op' };
const ADMIN = { role: 'ADMIN', userId: 'adm' };
const INNE = ['DASHBOARD_VIEW', 'CUSTOMERS_VIEW', 'TICKETS_VIEW', 'TICKETS_MANAGE', 'BILLING_VIEW', 'BILLING_MANAGE', 'NODES_MANAGE'];

describe('pozycja 13 — martwe uprawnienia podpięte do strażników', () => {
  it('AUDIT_VIEW: dziennik tylko do odczytu — wszystkie trasy to GET, STAFF z uprawnieniem czyta, bez — 403', async () => {
    const t = trasy(AuditAdminController);
    expect(t.sort()).toEqual(['exportCsv', 'list']);
    for (const m of t) {
      expect(Reflect.getMetadata(METHOD_METADATA, (AuditAdminController.prototype as never)[m])).toBe(0); // GET
      expect(await wpuszcza(AuditAdminController, m, STAFF, ['AUDIT_VIEW'])).toBe(true);
      expect(await wpuszcza(AuditAdminController, m, STAFF, INNE)).toBe(false);
      expect(await wpuszcza(AuditAdminController, m, ADMIN, [])).toBe(true);
    }
  });

  it('COMPLIANCE_MANAGE: odczyt RODO i ponowienie eksportu; publikacja dokumentu i wymuszona anonimizacja tylko ADMIN', async () => {
    const otwarte = ['listDocuments', 'listVersions', 'listConsents', 'listDataExports', 'retryDataExport', 'listDeletionRequests'];
    const tylkoAdmin = ['publish', 'forceAnonymize'];
    expect(trasy(ComplianceAdminController).sort()).toEqual([...otwarte, ...tylkoAdmin].sort());
    for (const m of otwarte) {
      expect({ m, ok: await wpuszcza(ComplianceAdminController, m, STAFF, ['COMPLIANCE_MANAGE']) }).toEqual({ m, ok: true });
      expect({ m, ok: await wpuszcza(ComplianceAdminController, m, STAFF, INNE) }).toEqual({ m, ok: false });
    }
    for (const m of tylkoAdmin) {
      expect({ m, ok: await wpuszcza(ComplianceAdminController, m, STAFF, ['COMPLIANCE_MANAGE', ...INNE]) }).toEqual({ m, ok: false });
      expect(await wpuszcza(ComplianceAdminController, m, ADMIN, [])).toBe(true);
    }
  });

  it('PLANS_MANAGE: wszystkie operacje na planach dla STAFF z uprawnieniem, bez niego — 403', async () => {
    const t = trasy(PlansAdminController);
    expect(t.length).toBeGreaterThanOrEqual(8);
    for (const m of t) {
      expect({ m, ok: await wpuszcza(PlansAdminController, m, STAFF, ['PLANS_MANAGE']) }).toEqual({ m, ok: true });
      expect({ m, ok: await wpuszcza(PlansAdminController, m, STAFF, INNE) }).toEqual({ m, ok: false });
      expect(await wpuszcza(PlansAdminController, m, ADMIN, [])).toBe(true);
    }
  });

  it('USER (klient) nie wchodzi nigdzie', async () => {
    const user = { role: 'USER', userId: 'k' };
    for (const k of [AuditAdminController, ComplianceAdminController, PlansAdminController]) {
      for (const m of trasy(k)) expect(await wpuszcza(k, m, user, ['AUDIT_VIEW', 'COMPLIANCE_MANAGE', 'PLANS_MANAGE'])).toBe(false);
    }
  });
});
