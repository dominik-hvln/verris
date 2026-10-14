import { describe, expect, it } from 'vitest';
import { PlatformSettingsService } from './platform-settings.service.js';

/** Decyzja 14.10.2026 — prowizja z programu poleceń na start 10% (wcześniej 15%); jawny wiersz w bazie wygrywa. */
describe('program poleceń — domyślna prowizja', () => {
  const usluga = (wiersze: { key: string; value: string }[]) =>
    new PlatformSettingsService({ platformSetting: { findMany: async () => wiersze } } as never, {} as never, {} as never);

  it('bez wiersza w bazie → 10%', async () => {
    await expect(usluga([]).getPartnerProgram()).resolves.toMatchObject({ commissionPct: 10 });
  });

  it('jawna wartość w bazie wygrywa z domyślną', async () => {
    await expect(usluga([{ key: 'partner.commissionPct', value: '12' }]).getPartnerProgram()).resolves.toMatchObject({
      commissionPct: 12,
    });
  });
});
