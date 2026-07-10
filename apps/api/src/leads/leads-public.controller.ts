import { Body, Controller, Get, Header, HttpCode, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { LeadsService } from './leads.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';

/**
 * Publiczne formularze z verris.pl (LP „Zaplanuj migrację" + „Kontakt").
 * Bez auth, pod globalnym RateLimitGuard (per-IP). www forwarduje IP/User-Agent
 * użytkownika nagłówkami (x-forwarded-for) — endpoint je odczytuje do dowodu zgody.
 */
@Controller('public/leads')
export class LeadsPublicController {
  constructor(private readonly leads: LeadsService) {}

  @Post()
  @HttpCode(202)
  async submit(@Body() dto: SubmitLeadDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'] as string | undefined;
    return this.leads.submit(dto, { ip, userAgent });
  }

  @Get('confirm')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirm(@Query('token') token?: string): Promise<string> {
    const { ok } = await this.leads.confirm(token);
    const title = ok ? 'Adres potwierdzony ✓' : 'Link nieaktualny';
    const body = ok
      ? 'Dziękujemy! Twój adres jest potwierdzony — wyślemy Ci plan migracji i kilka wiadomości o hostingu Verris. Rezygnacja jednym kliknięciem w każdej wiadomości.'
      : 'Ten link potwierdzający jest nieaktualny lub został już użyty. Jeśli to pomyłka, wypełnij formularz ponownie na verris.pl.';
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0C1A14;color:#F4F4EE;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:460px;background:#0E1F17;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px}
h1{font-size:22px;margin:0 0 12px;color:#34E5A0}p{margin:0;color:#B4C2BB;line-height:1.55}
a{display:inline-block;margin-top:20px;color:#34E5A0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${body}</p><a href="https://verris.pl">← Wróć na verris.pl</a></div></body></html>`;
  }
}
