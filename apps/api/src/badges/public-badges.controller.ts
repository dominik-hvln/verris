import { Controller, Get, NotFoundException, Param, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { EcoBadgeService } from '../users/eco-badge.service.js';
import { extractRequestContext } from '../common/decorators/request-context.js';
import { BadgesService } from './badges.service.js';
import { embeddedOnDomain } from './badge-logic.js';
import {
  emptyFrame,
  renderEkoSvg,
  renderLoader,
  renderReferralFrame,
  renderSealFrame,
  renderUptimeFrame,
  renderVerifyPage,
  type EkoWariant,
  type Motyw,
} from './badge-render.js';

const motyw = (v?: string): Motyw => (v === 'jasny' ? 'jasny' : 'ciemny');

/**
 * Badge na stronę klienta — publiczne, bez logowania. Ramki są osadzane na
 * cudzych stronach, więc zdejmujemy tu blokady z main.ts (X-Frame-Options,
 * CORP same-site) i dajemy własny, wąski CSP z nonce.
 */
@Controller('public/badges')
export class PublicBadgesController {
  constructor(
    private readonly badges: BadgesService,
    private readonly ecoBadge: EcoBadgeService,
  ) {}

  private frame(res: Response, html: string, nonce: string, embeddable = true): string {
    if (embeddable) res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors ${embeddable ? '*' : "'none'"}`,
    );
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.setHeader('Vary', 'Referer');
    return html;
  }

  private impression(token: string | null, req: Request): void {
    if (!token) return;
    this.ecoBadge.recordImpression(token, extractRequestContext(req), {
      referer: req.headers.referer ?? null,
      source: 'embed',
    });
  }

  /** Strona klienta albo podgląd w panelu klienta. */
  private onDomain(req: Request, domain: string): boolean {
    return embeddedOnDomain(req.headers.referer, domain, [this.badges.clientUrl()]);
  }

  @Get('v1.js')
  loader(@Res({ passthrough: true }) res: Response): string {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return renderLoader(this.badges.apiBase());
  }

  @Get('ramka/pieczec/:id')
  async seal(@Param('id') id: string, @Query('motyw') m: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const nonce = randomBytes(16).toString('base64');
    const site = await this.badges.site(id);
    if (!site?.seal || !this.onDomain(req, site.domain)) return this.frame(res, emptyFrame(nonce), nonce);
    this.impression(site.ecoToken, req);
    return this.frame(res, renderSealFrame(site.seal, motyw(m), nonce), nonce);
  }

  @Get('ramka/dostepnosc/:id')
  async uptime(
    @Param('id') id: string,
    @Query('motyw') m: string,
    @Query('wariant') w: string,
    @Query('dni') dni: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const nonce = randomBytes(16).toString('base64');
    const site = await this.badges.site(id);
    if (!site || !site.monitorOn || site.uptime30 === null || !this.onDomain(req, site.domain)) {
      return this.frame(res, emptyFrame(nonce), nonce);
    }
    const short = dni === '30' || w === 'mini';
    const days = short ? site.days90.slice(-30) : site.days90;
    const pct = (short ? site.uptime30 : site.uptime90) ?? site.uptime30;
    this.impression(site.ecoToken, req);
    return this.frame(
      res,
      renderUptimeFrame({ domain: site.domain, up: site.up, responseMs: site.responseMs, pct, days }, motyw(m), w === 'mini' ? 'mini' : 'pelny', nonce),
      nonce,
    );
  }

  @Get('ramka/polecenie/:code')
  async referral(@Param('code') code: string, @Query('motyw') m: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const nonce = randomBytes(16).toString('base64');
    const owner = await this.badges.referralOwner(code);
    this.impression(owner?.ecoToken ?? null, req);
    const href = owner ? `${this.badges.apiBase()}/public/badges/r/${encodeURIComponent(code)}` : 'https://verris.pl';
    return this.frame(res, renderReferralFrame({ href, owner: owner?.company ?? null }, motyw(m), nonce), nonce);
  }

  @Get('r/:code')
  async referralClick(@Param('code') code: string, @Res() res: Response): Promise<void> {
    const owner = await this.badges.referralOwner(code);
    if (!owner) return res.redirect(302, 'https://verris.pl');
    await this.badges.countReferralClick(owner.id);
    res.redirect(302, `${this.badges.clientUrl()}/register?ref=${encodeURIComponent(code)}`);
  }

  @Get('weryfikacja/:id')
  async verify(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const nonce = randomBytes(16).toString('base64');
    const site = await this.badges.site(id);
    if (!site) throw new NotFoundException();
    return this.frame(res, renderVerifyPage({ domain: site.domain, seal: site.seal }, nonce), nonce, false);
  }

  @Get('eko/:plik')
  async eko(
    @Param('plik') plik: string,
    @Query('motyw') m: string,
    @Query('wariant') w: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const token = plik.replace(/\.svg$/, '');
    const profile = await this.badges.ecoProfile(token);
    if (!profile) throw new NotFoundException();
    this.impression(token, req);
    const wariant: EkoWariant = w === 'znak' || w === 'hostowane' ? w : 'eko';
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cache-Control', 'public, max-age=300');
    return renderEkoSvg(profile, motyw(m), wariant);
  }
}
