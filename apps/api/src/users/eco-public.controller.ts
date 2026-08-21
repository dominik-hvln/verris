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
import { PrismaService } from '../prisma/prisma.service';
import {
  ECO_BADGE_TRACKING_PIXEL,
  EcoBadgeService,
} from './eco-badge.service';
import { extractRequestContext } from '../common/decorators/request-context';

type EcoBadgeVariant = 'classic' | 'compact' | 'mini' | 'statement';
type EcoBadgeTheme = 'dark' | 'light';

/**
 * G‑3: publiczny badge (SVG) osadzalny na zewnętrznych stronach przez `<img src="…">`.
 * Token przypisany do użytkownika — nie ujawnia UUID konta.
 */
@Controller('public/eco')
export class EcoPublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ecoBadge: EcoBadgeService,
  ) {}

  @Get('badge/:token')
  @Header('Content-Type', 'image/svg+xml; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async badge(
    @Param('token') token: string,
    @Query('variant') variantQuery?: string,
    @Query('theme') themeQuery?: string,
    @Req() req?: Request,
  ): Promise<string> {
    const profile = await this.badgeProfile(token);
    if (req) {
      this.ecoBadge.recordImpression(token, extractRequestContext(req), {
        referer: req.headers.referer ?? null,
        source: 'svg',
      });
    }
    return renderEcoBadgeSvg({
      ...profile,
      variant: normalizeVariant(variantQuery),
      theme: normalizeTheme(themeQuery),
    });
  }

  @Get('badge/:token/embed')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  async interactiveBadge(
    @Param('token') token: string,
    @Query('theme') themeQuery?: string,
    @Req() req?: Request,
  ): Promise<string> {
    const profile = await this.badgeProfile(token);
    const theme = normalizeTheme(themeQuery);
    if (req) {
      this.ecoBadge.recordImpression(token, extractRequestContext(req), {
        referer: req.headers.referer ?? null,
        source: 'embed',
      });
    }
    return renderEcoBadgeEmbed({ ...profile, theme, token });
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

  private async badgeProfile(token: string): Promise<{ ecoPoints: number; label: string; tier: string }> {
    const user = await this.prisma.user.findFirst({
      where: { ecoBadgeToken: token },
      select: { ecoPoints: true, firstName: true },
    });
    if (!user) throw new NotFoundException();

    return {
      ecoPoints: user.ecoPoints,
      label: user.firstName ? escapeXml(user.firstName) : 'Verris',
      tier: ecoTier(user.ecoPoints),
    };
  }
}

function normalizeVariant(value?: string): EcoBadgeVariant {
  if (value === 'compact' || value === 'mini' || value === 'statement') return value;
  return 'classic';
}

function normalizeTheme(value?: string): EcoBadgeTheme {
  return value === 'light' ? 'light' : 'dark';
}

function ecoTier(points: number): string {
  if (points >= 100) return 'Las';
  if (points >= 30) return 'Gaj';
  if (points >= 10) return 'Sadzonka';
  return 'Pączek';
}

const LEAF_MARK = `<path d="M12 20c6-8 10-11 16-14-3 8-7 13-16 14Z" fill="currentColor" opacity="0.9"/>`;

function renderEcoBadgeSvg(input: {
  ecoPoints: number;
  label: string;
  tier: string;
  variant: EcoBadgeVariant;
  theme: EcoBadgeTheme;
}): string {
  const palette =
    input.theme === 'light'
      ? {
          bg: '#f8fffb',
          bg2: '#d1fae5',
          border: '#34d399',
          primary: '#064e3b',
          secondary: '#047857',
          muted: '#059669',
          accent: '#10b981',
        }
      : {
          bg: '#022c22',
          bg2: '#059669',
          border: '#34d399',
          primary: '#ecfdf5',
          secondary: '#a7f3d0',
          muted: '#6ee7b7',
          accent: '#6ee7b7',
        };

  const aria = escapeXml(`Verris EKO ${input.tier}, ${input.ecoPoints} punktów`);
  const tierPill = escapeXml(input.tier);

  if (input.variant === 'mini') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="168" height="32" role="img" aria-label="${aria}">
  <rect width="168" height="32" rx="16" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1"/>
  <g transform="translate(10 6)" color="${palette.accent}">${LEAF_MARK}</g>
  <text x="30" y="20" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="700">EKO hosting</text>
  <text x="118" y="20" fill="${palette.muted}" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="700">${tierPill}</text>
</svg>`;
  }

  if (input.variant === 'compact') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="48" role="img" aria-label="${aria}">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${palette.bg}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient></defs>
  <rect width="240" height="48" rx="16" fill="url(#g)" stroke="${palette.border}" stroke-width="1"/>
  <g transform="translate(12 10)" color="${palette.accent}">${LEAF_MARK}</g>
  <text x="34" y="21" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="12" font-weight="800">Korzystamy z eko hostingu</text>
  <text x="34" y="36" fill="${palette.secondary}" font-family="Inter, Arial, sans-serif" font-size="10">${tierPill} · ${input.ecoPoints} pkt · Verris</text>
</svg>`;
  }

  if (input.variant === 'statement') {
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="336" height="88" role="img" aria-label="${aria}">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${palette.bg}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient></defs>
  <rect width="336" height="88" rx="20" fill="url(#g)" stroke="${palette.border}" stroke-width="1"/>
  <g transform="translate(18 24)" color="${palette.accent}">${LEAF_MARK}</g>
  <rect x="52" y="18" width="58" height="18" rx="9" fill="${palette.bg}" stroke="${palette.border}" stroke-width="0.75" opacity="0.85"/>
  <text x="62" y="31" fill="${palette.muted}" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="800">${tierPill}</text>
  <text x="52" y="50" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800">Nasza strona korzysta</text>
  <text x="52" y="68" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="15" font-weight="800">z eko hostingu Verris</text>
  <text x="52" y="82" fill="${palette.secondary}" font-family="Inter, Arial, sans-serif" font-size="11">${input.ecoPoints} punktów EKO</text>
</svg>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="292" height="76" role="img" aria-label="${aria}">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${palette.bg}"/><stop offset="1" stop-color="${palette.bg2}"/></linearGradient></defs>
  <rect width="292" height="76" rx="16" fill="url(#g)" stroke="${palette.border}" stroke-width="1"/>
  <g transform="translate(14 18)" color="${palette.accent}">${LEAF_MARK}</g>
  <text x="38" y="30" fill="${palette.primary}" font-family="Inter, Arial, sans-serif" font-size="13" font-weight="700">Verris · ${input.label}</text>
  <text x="38" y="48" fill="${palette.secondary}" font-family="Inter, Arial, sans-serif" font-size="11">Punkty EKO: ${input.ecoPoints}</text>
  <rect x="38" y="54" width="52" height="16" rx="8" fill="${palette.bg}" stroke="${palette.border}" stroke-width="0.75" opacity="0.9"/>
  <text x="48" y="66" fill="${palette.muted}" font-family="Inter, Arial, sans-serif" font-size="9" font-weight="800">${tierPill}</text>
  <text x="220" y="66" fill="${palette.muted}" font-family="Inter, Arial, sans-serif" font-size="9">verris.pl</text>
</svg>`;
}

function renderEcoBadgeEmbed(input: {
  ecoPoints: number;
  label: string;
  tier: string;
  theme: EcoBadgeTheme;
  token: string;
}): string {
  const dark = input.theme !== 'light';
  const background = dark ? 'linear-gradient(135deg,#022c22,#064e3b 54%,#047857)' : 'linear-gradient(135deg,#f8fffb,#d1fae5)';
  const color = dark ? '#ecfdf5' : '#064e3b';
  const muted = dark ? '#a7f3d0' : '#047857';
  const shell = dark ? 'rgba(2,44,34,.92)' : 'rgba(248,255,251,.94)';
  const pixelSrc = `/public/eco/badge/${encodeURIComponent(input.token)}/impression.gif`;

  return `<!doctype html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: ${dark ? 'dark' : 'light'}; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: transparent; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    a { width: 100%; min-height: 100vh; display: grid; place-items: center; text-decoration: none; color: ${color}; position: relative; }
    .badge { width: min(100%, 360px); min-height: 112px; border: 1px solid #34d399; border-radius: 22px; padding: 18px 20px; background: ${background}; box-shadow: 0 20px 60px rgba(16,185,129,.22); transform: translateY(0); transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
    a:hover .badge, a:focus-visible .badge { transform: translateY(-2px); border-color: #6ee7b7; box-shadow: 0 26px 72px rgba(16,185,129,.34); }
    .eyebrow { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; background: ${shell}; padding: 5px 9px; color: ${muted}; font-size: 11px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
    .dot { width: 8px; height: 8px; border-radius: 999px; background: #34d399; box-shadow: 0 0 0 5px rgba(52,211,153,.14); }
    h1 { margin: 12px 0 6px; color: ${color}; font-size: 18px; line-height: 1.2; }
    p { margin: 0; color: ${muted}; font-size: 12px; line-height: 1.45; }
    strong { color: ${color}; }
    .pixel { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
  </style>
</head>
<body>
  <a href="https://verris.pl" target="_blank" rel="noopener noreferrer" aria-label="Nasza strona korzysta z eko hostingu Verris">
    <img class="pixel" src="${pixelSrc}" width="1" height="1" alt="" />
    <section class="badge">
      <span class="eyebrow"><span class="dot"></span>EKO hosting</span>
      <h1>Nasza strona korzysta z eko hostingu Verris</h1>
      <p>Poziom <strong>${input.tier}</strong> · ${input.ecoPoints} punktów EKO · ${input.label}</p>
    </section>
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
