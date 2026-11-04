import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ECO_BADGE_TRACKING_PIXEL,
  EcoBadgeService,
} from './eco-badge.service.js';
import { extractRequestContext } from '../common/decorators/request-context.js';
import { EcoDrzewaService } from '../eco/eco-drzewa.service.js';
import { renderEkoSvg } from '../badges/badge-render.js';
import { opisPosadzonychDrzew } from '../eco/drzewa-model.js';

type EcoBadgeTheme = 'dark' | 'light';

/**
 * G‑3: publiczny badge (SVG) osadzalny na zewnętrznych stronach przez `<img src="…">`.
 * Token przypisany do użytkownika — nie ujawnia UUID konta.
 *
 * W6 (A2-10, decyzja 12): dawne warianty „EKO hosting / Korzystamy z eko hostingu” (ogólne twierdzenie środowiskowe
 * bez certyfikacji) zastępuje odznaka „Verris — X posadzonych drzew” (licznik `?licznik=verris|moje`, tylko drzewa
 * z certyfikatem partnera). Stare osadzenia z `?variant=…` dostają tę samą odznakę.
 */
@Controller('public/eco')
export class EcoPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecoBadge: EcoBadgeService,
    private readonly drzewa: EcoDrzewaService,
  ) {}

  @Get('badge/:token')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async badge(
    @Param('token') token: string,
    @Query('theme') themeQuery?: string,
    @Query('licznik') licznik?: string,
    @Req() req?: Request,
  ): Promise<string> {
    const czesciDrzew = await this.czesciDrzew(token, licznik);
    if (req) {
      this.ecoBadge.recordImpression(token, extractRequestContext(req), {
        referer: req.headers.referer ?? null,
        source: 'svg',
      });
    }
    return renderEkoSvg({ czesciDrzew }, normalizeTheme(themeQuery) === 'light' ? 'jasny' : 'ciemny', 'eko');
  }

  @Get('badge/:token/embed')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async interactiveBadge(
    @Param('token') token: string,
    @Query('theme') themeQuery?: string,
    @Query('licznik') licznik?: string,
    @Req() req?: Request,
  ): Promise<string> {
    const czesciDrzew = await this.czesciDrzew(token, licznik);
    if (req) {
      this.ecoBadge.recordImpression(token, extractRequestContext(req), {
        referer: req.headers.referer ?? null,
        source: 'embed',
      });
    }
    return renderEcoBadgeEmbed({ czesciDrzew, theme: normalizeTheme(themeQuery), token });
  }

  @Get('badge/:token/impression.gif')
  @Header('Content-Type', 'image/gif')
  @Header('Cache-Control', 'no-store')
  impressionPixel(@Param('token') token: string, @Req() req: Request): Buffer {
    this.ecoBadge.recordImpression(token, extractRequestContext(req), {
      referer: req.headers.referer ?? null,
      source: 'pixel',
    });
    return ECO_BADGE_TRACKING_PIXEL;
  }

  private async czesciDrzew(token: string, licznik?: string): Promise<number> {
    const user = await this.prisma.user.findFirst({
      where: { ecoBadgeToken: token },
      select: { id: true },
    });
    if (!user) throw new NotFoundException();
    return this.drzewa.licznikOdznaki(user.id, licznik === 'moje' ? 'moje' : 'verris');
  }
}

function normalizeTheme(value?: string): EcoBadgeTheme {
  return value === 'light' ? 'light' : 'dark';
}

function renderEcoBadgeEmbed(input: { czesciDrzew: number; theme: EcoBadgeTheme; token: string }): string {
  const dark = input.theme !== 'light';
  const background = dark ? '#08130E' : '#F1F7F3';
  const color = dark ? '#F4F4EE' : '#0C1A14';
  const border = dark ? 'rgba(52,229,160,.28)' : '#BFE3D0';
  const pixelSrc = `/public/eco/badge/${encodeURIComponent(input.token)}/impression.gif`;
  const tekst = input.czesciDrzew >= 100 ? `Verris — ${opisPosadzonychDrzew(input.czesciDrzew)}` : 'Hosting Verris';

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: ${dark ? 'dark' : 'light'}; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: transparent; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    a { display: inline-flex; align-items: center; gap: 10px; padding: 12px 16px; border: 1px solid ${border}; border-radius: 12px; background: ${background}; color: ${color}; text-decoration: none; font-size: 14px; font-weight: 600; position: relative; }
    a:focus-visible { outline: 2px solid #34E5A0; outline-offset: 2px; }
    .pixel { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  </style>
</head>
<body>
  <a href="https://verris.pl" target="_blank" rel="noopener noreferrer">
    <img class="pixel" src="${pixelSrc}" width="1" height="1" alt="" />
    <span>${escapeXml(tekst)}</span>
  </a>
</body>
</html>`;
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
