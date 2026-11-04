import { NotFoundException } from '@nestjs/common';
import { EcoPublicController } from './eco-public.controller.js';
import { ECO_BADGE_TRACKING_PIXEL } from './eco-badge.service.js';

/**
 * A2-10 / decyzja 12 — stara odznaka mówiła „EKO hosting”, „Korzystamy z eko hostingu”, „Nasza strona korzysta
 * z eko hostingu Verris” (ogólne twierdzenie środowiskowe bez pokrycia). Teraz: „Verris — X posadzonych drzew”
 * z licznika wybranego przez klienta, bez nazwy partnera; przy zerze sam znak Verris.
 */
describe('EcoPublicController — odznaka drzew', () => {
  const prisma = { user: { findFirst: vi.fn() } };
  const ecoBadge = { recordImpression: vi.fn() };
  const drzewa = { licznikOdznaki: vi.fn() };

  beforeEach(() => vi.clearAllMocks());

  const controller = () => new EcoPublicController(prisma as never, ecoBadge as never, drzewa as never);

  it('licznik zbiorczy domyślnie: „Verris — 12 posadzonych drzew”, bez haseł „eko hosting” i bez tokenu w treści', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    drzewa.licznikOdznaki.mockResolvedValue(120_000);
    const svg = await controller().badge('public-token');
    expect(drzewa.licznikOdznaki).toHaveBeenCalledWith('u1', 'verris');
    expect(svg).toContain('Verris — 12 posadzonych drzew');
    expect(svg.toLowerCase()).not.toMatch(/eko hosting|ekologiczn|posadzimy/);
    expect(svg).not.toContain('public-token');
  });

  it('licznik klienta (`moje`) z ułamkiem udziału: „1,07 posadzonego drzewa”', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    drzewa.licznikOdznaki.mockResolvedValue(10_700);
    const svg = await controller().badge('public-token', 'light', 'moje');
    expect(drzewa.licznikOdznaki).toHaveBeenCalledWith('u1', 'moje');
    expect(svg).toContain('Verris — 1,07 posadzonego drzewa');
  });

  it('zero posadzonych drzew: sam znak Verris, żadnego „0 drzew”', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    drzewa.licznikOdznaki.mockResolvedValue(0);
    const svg = await controller().badge('public-token');
    expect(svg).toContain('Hosting Verris');
    expect(svg).not.toContain('drzew');
  });

  it('ramka HTML z pikselem wyświetleń i tym samym tekstem', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1' });
    drzewa.licznikOdznaki.mockResolvedValue(30_000);
    const html = await controller().interactiveBadge('public-token');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('impression.gif');
    expect(html).toContain('Verris — 3 posadzone drzewa');
    expect(html.toLowerCase()).not.toContain('eko hosting');
  });

  it('piksel wyświetleń', () => {
    const buf = controller().impressionPixel('public-token', { headers: {}, ip: '1.2.3.4' } as never);
    expect(buf).toEqual(ECO_BADGE_TRACKING_PIXEL);
    expect(ecoBadge.recordImpression).toHaveBeenCalled();
  });

  it('nieznany token: 404', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(controller().badge('missing-token')).rejects.toBeInstanceOf(NotFoundException);
  });
});
