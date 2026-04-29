import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * G‑3: publiczny badge (SVG) osadzalny na zewnętrznych stronach przez `<img src="…">`.
 * Token przypisany do użytkownika — nie ujawnia UUID konta.
 */
@Controller('public/eco')
export class EcoPublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('badge/:token')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async badge(@Param('token') token: string): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { ecoBadgeToken: token },
      select: { ecoPoints: true, firstName: true },
    });
    if (!user) throw new NotFoundException();

    const tier =
      user.ecoPoints >= 100 ? 'Las' : user.ecoPoints >= 30 ? 'Gaj' : user.ecoPoints >= 10 ? 'Sadzonka' : 'Pączek';
    const label = user.firstName ? this.escapeXml(user.firstName) : 'EkoHost';

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="280" height="72" role="img" aria-label="EKO badge">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#064e3b"/><stop offset="1" stop-color="#059669"/></linearGradient></defs>
  <rect width="100%" height="100%" rx="12" fill="url(#g)" stroke="#34d399" stroke-width="1"/>
  <text x="16" y="28" fill="#ecfdf5" font-family="system-ui,sans-serif" font-size="13" font-weight="600">EkoHost · ${label}</text>
  <text x="16" y="48" fill="#a7f3d0" font-family="system-ui,sans-serif" font-size="11">Punkty EKO: ${user.ecoPoints} · ${tier}</text>
  <text x="16" y="64" fill="#6ee7b7" font-family="system-ui,sans-serif" font-size="9">ekohost.pl</text>
</svg>`;
  }

  private escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }
}
