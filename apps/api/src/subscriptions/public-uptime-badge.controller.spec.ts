import { NotFoundException } from '@nestjs/common';
import { PublicUptimeBadgeController } from './public-uptime-badge.controller';

describe('PublicUptimeBadgeController', () => {
  const prisma = {
    subscription: { findUnique: jest.fn() },
    probeIncident: { count: jest.fn() },
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns an operational SVG without leaking the customer domain', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      account: { domain: 'secret-customer.example', serverId: 'srv_1' },
    });
    prisma.probeIncident.count.mockResolvedValue(0);
    const controller = new PublicUptimeBadgeController(prisma as never);

    const svg = await controller.badge('sub_1');

    expect(svg).toContain('Verris operational');
    expect(svg).not.toContain('secret-customer.example');
    expect(prisma.probeIncident.count).toHaveBeenCalledWith({
      where: {
        status: 'OPEN',
        probe: { serverId: 'srv_1', isPublic: true },
      },
    });
  });

  it('returns degraded when a public probe has an open incident', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_1',
      account: { domain: 'example.test', serverId: 'srv_1' },
    });
    prisma.probeIncident.count.mockResolvedValue(2);
    const controller = new PublicUptimeBadgeController(prisma as never);

    await expect(controller.badge('sub_1')).resolves.toContain('Verris degraded');
  });

  it('returns 404 for unknown subscription ids without querying incidents', async () => {
    prisma.subscription.findUnique.mockResolvedValue(null);
    const controller = new PublicUptimeBadgeController(prisma as never);

    await expect(controller.badge('missing-sub')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.probeIncident.count).not.toHaveBeenCalled();
  });

  it('does not embed subscription id or server id in the SVG payload', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: 'sub_secret_uuid',
      account: { domain: 'hidden.example', serverId: 'srv_secret' },
    });
    prisma.probeIncident.count.mockResolvedValue(0);
    const controller = new PublicUptimeBadgeController(prisma as never);

    const svg = await controller.badge('sub_secret_uuid');

    expect(svg).not.toContain('sub_secret_uuid');
    expect(svg).not.toContain('srv_secret');
    expect(svg).not.toContain('hidden.example');
  });

  it('does not expose badges for services without a provisioned account', async () => {
    prisma.subscription.findUnique.mockResolvedValue({ id: 'sub_1', account: null });
    const controller = new PublicUptimeBadgeController(prisma as never);

    await expect(controller.badge('sub_1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
