import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { IncidentStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';

@Controller('public/services')
export class PublicUptimeBadgeController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id/uptime-badge.svg')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=60')
  async badge(@Param('id') id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        account: { select: { domain: true, serverId: true } },
      },
    });
    if (!sub?.account?.serverId) throw new NotFoundException('Service not found');

    const openIncidents = await this.prisma.probeIncident.count({
      where: {
        status: IncidentStatus.OPEN,
        probe: { serverId: sub.account.serverId, isPublic: true },
      },
    });
    const label = openIncidents > 0 ? 'degraded' : 'operational';
    const color = openIncidents > 0 ? '#f59e0b' : '#10b981';
    const text = `Verris ${escapeXml(label)}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="156" height="24" role="img" aria-label="${text}">
  <rect width="156" height="24" rx="12" fill="#111827"/>
  <circle cx="14" cy="12" r="5" fill="${color}"/>
  <text x="26" y="16" font-family="Inter, Arial, sans-serif" font-size="12" fill="#f9fafb">${text}</text>
</svg>`;
  }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
