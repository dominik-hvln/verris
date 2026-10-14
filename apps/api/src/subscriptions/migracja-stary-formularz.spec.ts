import { PATH_METADATA } from '@nestjs/common/constants';
import { UserServicesController as ServicesController } from './services.controller.js';
import { MigrationOrchestratorService } from './migration-orchestrator.service.js';

/**
 * 14.10 — stary formularz migracji (POST services/:id/migrations/external) nie był używany przez żaden panel, nie miał
 * limitu prób, a zaszyfrowane hasło źródła zostawało w SubscriptionEvent na zawsze (retencja czyści MigrationRequest).
 * Jedyną drogą zlecenia jest migrations/bundle (limit, zgoda, retencja sekretów).
 */
it('kontroler usług nie wystawia trasy migrations/external ani metody starego formularza', () => {
  const proto = ServicesController.prototype as unknown as Record<string, unknown>;
  const trasy = Object.getOwnPropertyNames(proto)
    .filter((n) => typeof proto[n] === 'function')
    .map((n) => Reflect.getMetadata(PATH_METADATA, proto[n] as object) as string | undefined)
    .filter(Boolean);
  expect(trasy).toContain(':id/migrations/bundle');
  expect(trasy).not.toContain(':id/migrations/external');
  expect('requestExternalMigration' in MigrationOrchestratorService.prototype).toBe(false);
});
