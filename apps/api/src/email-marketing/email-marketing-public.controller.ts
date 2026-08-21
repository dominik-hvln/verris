import { Controller, Get, Header, Post, Query } from '@nestjs/common';
import { EmailMarketingService } from './email-marketing.service';

/**
 * EMM — publiczne endpointy bez uwierzytelniania:
 *  - GET /emm/confirm?token=...     — double opt-in (potwierdzenie zapisu)
 *  - GET/POST /emm/unsubscribe?token=... — wypis (RFC 8058 List-Unsubscribe:
 *    One-Click używa POST, link w stopce używa GET).
 * Zwracamy prostą stronę HTML (bez zależności od frontu panelu).
 */
@Controller('emm')
export class EmailMarketingPublicController {
  constructor(private readonly emm: EmailMarketingService) {}

  @Get('confirm')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async confirm(@Query('token') token?: string): Promise<string> {
    if (!token) return this.page('Nieprawidłowy link', 'Brak tokenu potwierdzenia.');
    const res = await this.emm.confirmByToken(token);
    if (!res.ok) {
      return this.page('Link wygasł lub jest nieprawidłowy', 'Nie udało się potwierdzić zapisu. Skontaktuj się z nadawcą.');
    }
    return this.page(
      'Zapis potwierdzony ✓',
      res.listName
        ? `Dziękujemy! Twój zapis na listę „${this.esc(res.listName)}" został potwierdzony.`
        : 'Dziękujemy! Twój zapis został potwierdzony.',
    );
  }

  @Get('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribeGet(@Query('token') token?: string): Promise<string> {
    return this.doUnsub(token);
  }

  // RFC 8058 — List-Unsubscribe-Post: List-Unsubscribe=One-Click.
  @Post('unsubscribe')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async unsubscribePost(@Query('token') token?: string): Promise<string> {
    return this.doUnsub(token);
  }

  private async doUnsub(token?: string): Promise<string> {
    if (!token) return this.page('Nieprawidłowy link', 'Brak tokenu wypisu.');
    const res = await this.emm.unsubscribeByToken(token);
    if (!res.ok) {
      return this.page('Link nieprawidłowy', 'Nie udało się przetworzyć wypisu.');
    }
    return this.page(
      'Wypisano ✓',
      res.listName
        ? `Zostałeś/aś wypisany/a z listy „${this.esc(res.listName)}". Nie otrzymasz już od niej wiadomości.`
        : 'Zostałeś/aś wypisany/a. Nie otrzymasz już tych wiadomości.',
    );
  }

  private esc(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
  }

  private page(title: string, message: string): string {
    return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${this.esc(title)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0a0a;color:#fafafa;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.card{max-width:480px;width:100%;background:#141414;border:1px solid #262626;border-radius:18px;padding:40px 32px;text-align:center}
h1{font-size:22px;margin:0 0 12px}p{color:#a3a3a3;line-height:1.6;margin:0}.brand{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#737373;margin-bottom:20px}</style></head>
<body><div class="card"><div class="brand">Verris</div><h1>${this.esc(title)}</h1><p>${this.esc(message)}</p></div></body></html>`;
  }
}
