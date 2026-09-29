import { PlatformSettingsService } from './platform-settings.service.js';

/** Z-08 (decyzja 29.09.2026) — rekompensaty SLA działają od startu; wyłącza je tylko jawne `0`. */
describe('Z-08 — sla.creditsEnabled domyślnie włączone', () => {
  const usluga = (wiersze: { key: string; value: string }[]) =>
    new PlatformSettingsService({ platformSetting: { findMany: async () => wiersze } } as never, {} as never, {} as never);

  it('bez wiersza w bazie → włączone', async () => {
    await expect(usluga([]).getSlaCreditPolicy()).resolves.toMatchObject({ enabled: true });
  });

  it('jawne 0 → wyłączone', async () => {
    await expect(usluga([{ key: 'sla.creditsEnabled', value: '0' }]).getSlaCreditPolicy()).resolves.toMatchObject({
      enabled: false,
    });
  });
});
