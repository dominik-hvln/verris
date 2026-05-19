import { NotFoundException } from '@nestjs/common';
import { EcoPublicController } from './eco-public.controller';
import { ECO_BADGE_TRACKING_PIXEL } from './eco-badge.service';

describe('EcoPublicController', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
  };
  const ecoBadge = {
    recordImpression: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  function controller() {
    return new EcoPublicController(prisma as never, ecoBadge as never);
  }

  it('renders the default badge without exposing account identifiers', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 42,
      firstName: 'Jan',
    });

    const svg = await controller().badge('public-token');

    expect(svg).toContain('Punkty EKO: 42');
    expect(svg).toContain('Gaj');
    expect(svg).not.toContain('public-token');
  });

  it('renders smaller and marketing variants from query parameters', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 140,
      firstName: 'Ada',
    });

    await expect(controller().badge('public-token', 'mini')).resolves.toContain('width="168"');
    await expect(controller().badge('public-token', 'statement', 'light')).resolves.toContain(
      'Nasza strona korzysta',
    );
  });

  it('renders an interactive iframe document with tracking pixel', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 12,
      firstName: 'Ola',
    });

    const html = await controller().interactiveBadge('public-token');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('impression.gif');
    expect(html).toContain('Sadzonka');
  });

  it('returns a transparent tracking pixel', () => {
    const buf = controller().impressionPixel('public-token', {
      headers: {},
      ip: '1.2.3.4',
    } as never);
    expect(buf).toEqual(ECO_BADGE_TRACKING_PIXEL);
    expect(ecoBadge.recordImpression).toHaveBeenCalled();
  });

  it('does not expose badges for unknown tokens', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(controller().badge('missing-token')).rejects.toBeInstanceOf(NotFoundException);
  });
});
