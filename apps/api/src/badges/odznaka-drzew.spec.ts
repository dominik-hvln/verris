import { PublicBadgesController } from './public-badges.controller.js';
import { renderEkoSvg } from './badge-render.js';

/**
 * A2-10 / decyzja 12 — wariant `eko` odznaki na stronę klienta: zamiast „EKO hosting, poziom X” (twierdzenie
 * środowiskowe bez pokrycia) „Verris — X posadzonych drzew” z licznika `?licznik=verris|moje`.
 */
describe('Odznaka „Verris – X posadzonych drzew”', () => {
  function setup(czesciDrzew: number | null) {
    const badges = { ecoProfile: vi.fn().mockResolvedValue(czesciDrzew === null ? null : { czesciDrzew }) };
    const eco = { recordImpression: vi.fn() };
    const headers: Record<string, string> = {};
    const res = { setHeader: (k: string, v: string) => (headers[k] = v), removeHeader: () => undefined };
    return { ctrl: new PublicBadgesController(badges as never, eco as never), badges, res, eco };
  }
  const req = { headers: {}, ip: '1.2.3.4' } as never;

  it('licznik zbiorczy domyślnie, klienta po ?licznik=moje', async () => {
    const a = setup(50_000);
    const svg = await a.ctrl.eko('tok.svg', 'ciemny', 'eko', '', req, a.res as never);
    expect(a.badges.ecoProfile).toHaveBeenCalledWith('tok', 'verris');
    expect(svg).toContain('Verris – 5 posadzonych drzew');
    const b = setup(10_000);
    await b.ctrl.eko('tok.svg', 'jasny', 'eko', 'moje', req, b.res as never);
    expect(b.badges.ecoProfile).toHaveBeenCalledWith('tok', 'moje');
  });

  it('bez „EKO hosting”, bez poziomu i bez nazwy partnera; przy zerze sam znak', () => {
    for (const m of ['ciemny', 'jasny'] as const) {
      const svg = renderEkoSvg({ czesciDrzew: 20_000 }, m, 'eko');
      expect(svg).toContain('Verris – 2 posadzone drzewa');
      expect(svg.toLowerCase()).not.toMatch(/eko hosting|poziom|posadzimy/);
    }
    const zero = renderEkoSvg({ czesciDrzew: 0 }, 'ciemny', 'eko');
    expect(zero).toContain('aria-label="Hosting Verris"');
    expect(zero).not.toContain('drzew');
  });

  it('nieznany token: 404', async () => {
    const s = setup(null);
    await expect(s.ctrl.eko('x.svg', 'ciemny', 'eko', '', req, s.res as never)).rejects.toThrow();
  });
});
