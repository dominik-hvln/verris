import { Role } from '@verris/database';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { STAFF_PERMISSIONS_KEY } from '../common/decorators/staff-permissions.decorator';
import { StaffPermissionsGuard } from '../common/guards/staff-permissions.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UsersAdminController } from './users.admin.controller';

/**
 * RBAC panelu operatorskiego — kontrakt sprawdzany na metadanych dekoratorów,
 * bez podnoszenia kontenera DI.
 *
 * Decyzja produktowa 2026-08-21 (PM): blokadę logowania klienta może nałożyć
 * BOK, ale wyłącznie z uprawnieniem CUSTOMERS_MANAGE — admin zawsze. Powód:
 * spamera trzeba zatrzymać w godzinę, a nie po powrocie administratora.
 * Wcześniej test oczekiwał tu [ADMIN] i był jedynym naprawdę czerwonym testem
 * w zestawie; kod od Sprintu 4 miał [ADMIN, STAFF] + @StaffPerm.
 *
 * Dlatego sprawdzamy OBIE warstwy naraz. Sama rola nic tu nie znaczy: STAFF bez
 * przypisanej roli z uprawnieniem i tak dostanie 403 od StaffPermissionsGuard.
 * Test na samej roli dawałby fałszywe poczucie kontroli.
 */

const rolePod = (klucz: keyof UsersAdminController): unknown =>
  Reflect.getMetadata(ROLES_KEY, UsersAdminController.prototype[klucz] as object);

const uprawnieniaPod = (klucz: keyof UsersAdminController): unknown =>
  Reflect.getMetadata(STAFF_PERMISSIONS_KEY, UsersAdminController.prototype[klucz] as object);

describe('UsersAdminController (metadane RBAC)', () => {
  it('klasa dopuszcza STAFF i ADMIN (profil 360°, diagnostyka, tickety BOK)', () => {
    const role = Reflect.getMetadata(ROLES_KEY, UsersAdminController) as Role[] | undefined;
    expect(role?.slice().sort()).toEqual([Role.ADMIN, Role.STAFF].sort());
  });

  it('klasa ma wpięty StaffPermissionsGuard — bez niego @StaffPerm jest dekoracją', () => {
    const straznicy = (Reflect.getMetadata('__guards__', UsersAdminController) ?? []) as unknown[];
    expect(straznicy).toContain(StaffPermissionsGuard);
    expect(straznicy).toContain(RolesGuard);
  });

  it('customerProfile dziedziczy role klasy (brak nadpisania na metodzie)', () => {
    expect(rolePod('customerProfile')).toBeUndefined();
  });

  it('runDnsTls dziedziczy role klasy', () => {
    expect(rolePod('runDnsTls')).toBeUndefined();
  });

  describe('Sprint 4 / R-04 — dane operacyjne klienta', () => {
    it('podgląd: ADMIN + STAFF, staff musi mieć CUSTOMERS_VIEW', () => {
      expect((rolePod('operationalDetail') as Role[]).slice().sort()).toEqual(
        [Role.ADMIN, Role.STAFF].sort(),
      );
      expect(uprawnieniaPod('operationalDetail')).toEqual(['CUSTOMERS_VIEW']);
    });

    it('blokada logowania: ADMIN + STAFF, staff musi mieć CUSTOMERS_MANAGE', () => {
      expect((rolePod('patchOperational') as Role[]).slice().sort()).toEqual(
        [Role.ADMIN, Role.STAFF].sort(),
      );
      expect(uprawnieniaPod('patchOperational')).toEqual(['CUSTOMERS_MANAGE']);
    });

    it('zapis danych operacyjnych wymaga innego uprawnienia niż odczyt', () => {
      // Gdyby ktoś kiedyś zrównał oba do CUSTOMERS_VIEW, blokadę logowania
      // dostałby każdy BOK z podglądem klienta.
      expect(uprawnieniaPod('patchOperational')).not.toEqual(uprawnieniaPod('operationalDetail'));
    });
  });

  describe('operacje na tożsamości konta pozostają wyłącznie dla ADMIN', () => {
    it.each(['changeEmail', 'resetPassword'] as const)('%s — tylko ADMIN', (klucz) => {
      expect(rolePod(klucz)).toEqual([Role.ADMIN]);
    });
  });
});
