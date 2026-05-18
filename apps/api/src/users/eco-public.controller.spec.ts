import { NotFoundException } from '@nestjs/common';
import { EcoPublicController } from './eco-public.controller';

describe('EcoPublicController', () => {
  const prisma = {
    user: { findFirst: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('renders the default badge without exposing account identifiers', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 42,
      firstName: 'Jan',
    });
    const controller = new EcoPublicController(prisma as never);

    const svg = await controller.badge('public-token');

    expect(svg).toContain('Punkty EKO: 42');
    expect(svg).toContain('Gaj');
    expect(svg).not.toContain('public-token');
  });

  it('renders smaller and marketing variants from query parameters', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 140,
      firstName: 'Ada',
    });
    const controller = new EcoPublicController(prisma as never);

    await expect(controller.badge('public-token', 'mini')).resolves.toContain('width="156"');
    await expect(controller.badge('public-token', 'statement', 'light')).resolves.toContain(
      'Nasza strona korzysta',
    );
  });

  it('renders an interactive iframe document', async () => {
    prisma.user.findFirst.mockResolvedValue({
      ecoPoints: 12,
      firstName: 'Ola',
    });
    const controller = new EcoPublicController(prisma as never);

    const html = await controller.interactiveBadge('public-token');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Nasza strona korzysta z eko hostingu Verris');
    expect(html).toContain('Sadzonka');
  });

  it('does not expose badges for unknown tokens', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    const controller = new EcoPublicController(prisma as never);

    await expect(controller.badge('missing-token')).rejects.toBeInstanceOf(NotFoundException);
  });
});
