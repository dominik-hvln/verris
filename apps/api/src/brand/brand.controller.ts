import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CTA_PATTERN_SVG } from './cta-pattern.svg';

/**
 * Publiczny znak Verris dla maili (i innych miejsc). Serwowany jako PNG
 * pod `/brand/logo.png` — maile potrzebują publicznego URL obrazka
 * (data:/SVG są blokowane przez Gmail/Outlook). Bajty osadzone w kodzie,
 * żeby uniknąć kopiowania assetów w wieloetapowym buildzie Dockera.
 */
const LOGO_PNG = Buffer.from(
  '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',
  'base64',
);

@Controller('brand')
export class BrandController {
  @Get('logo.png')
  logo(@Res() res: Response): void {
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(LOGO_PNG);
  }

  /** Wzorzec brandingowy baneru CTA (SVG, przezroczyste tło). */
  @Get('cta-pattern.svg')
  ctaPattern(@Res() res: Response): void {
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(CTA_PATTERN_SVG);
  }
}
