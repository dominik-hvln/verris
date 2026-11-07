import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KreatorStatus } from '@verris/database';
import { migrujModel, walidujStrone } from '@verris/kreator';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { EMAIL_RE, adresPowrotu, mailFormularza, ocenSpam, odczytajFormularz } from './formularz.js';
import { sprawdzTokenFormularza } from './formularz-token.js';
import { stronaKomunikatu } from './publikacja.js';

/** Limit wysyłek z jednego adresu IP (wszystkie strony z kreatora razem). */
export const LIMIT_IP = { limit: 5, oknoMs: 10 * 60 * 1000 };
/** Limit maili z formularza jednej strony (domeny) na dobę – liczony z EmailLog, wspólny dla replik API. */
export const LIMIT_STRONY_DOBA = 50;
export const TAG_MAILA = 'kreator.formularz';
const MAKS_KUBELKOW = 20_000;

export type OdpowiedzFormularza = { status: 303; adres: string } | { status: 404; html: string; naglowki: Record<string, string> };

const CSP_KOMUNIKATU = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/**
 * Formularz kontaktowy opublikowanych stron z kreatora: POST /kreator/formularz/:token (publiczny, bez CORS –
 * zwykły POST formularza HTML, odpowiedź 303 z powrotem na stronę). Mail do właściciela: firma.email z modelu,
 * a gdy brak – e-mail konta. Kolejność: token → stan strony w bazie → pola → spam → limity → mail.
 */
@Injectable()
export class KreatorFormularzService {
  private readonly logger = new Logger(KreatorFormularzService.name);
  /** Okno przesuwne per IP (w pamięci repliki; dodatkowo globalny @RateLimit na trasie – Redis). */
  private readonly ipy = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
  ) {}

  async wyslij(token: string, body: unknown, z: { ip: string; origin?: string; referer?: string }, teraz = Date.now()): Promise<OdpowiedzFormularza> {
    const klucz = this.config.get<string>('appKmsKey');
    const stronaId = klucz ? sprawdzTokenFormularza(klucz, token) : null;
    if (!stronaId) return this.nieDziala();
    const s = await this.prisma.kreatorStrona.findUnique({
      where: { id: stronaId },
      select: { id: true, userId: true, status: true, model: true, domena: true, adres: true, opublikowanaAt: true },
    });
    // Wycofana (opublikowanaAt/domena = null) albo usunięta strona – formularz przestaje działać.
    if (!s || !s.opublikowanaAt || !s.domena) return this.nieDziala();
    const domena = s.domena;

    const odczyt = odczytajFormularz(body);
    const sekcjaZTresci = body && typeof body === 'object' && typeof (body as Record<string, unknown>).formularz === 'string' ? String((body as Record<string, unknown>).formularz) : null;
    const powrotZTresci = body && typeof body === 'object' && typeof (body as Record<string, unknown>).powrot === 'string' ? String((body as Record<string, unknown>).powrot) : '';
    const blad = (powod: string) => {
      this.logger.log(`Formularz strony ${s.id}: odrzucony (${powod}).`);
      return { status: 303 as const, adres: adresPowrotu(powrotZTresci, domena, sekcjaZTresci, 'blad') };
    };
    if (!odczyt.ok) return blad(odczyt.powod);
    const d = odczyt.dane;
    const wrot = (wynik: 'wyslano' | 'blad') => ({ status: 303 as const, adres: adresPowrotu(d.powrot, domena, d.sekcja, wynik) });

    if (!this.wLimicieIp(z.ip, teraz)) return blad('limit-ip');
    const ocena = ocenSpam(d, { origin: z.origin, referer: z.referer, domena });
    if (ocena === 'pulapka' || ocena === 'za-szybko') {
      // Ciche odrzucenie: bot dostaje „wysłano”, żeby nie uczył się omijać zabezpieczeń.
      this.logger.log(`Formularz strony ${s.id}: odrzucony jako spam (${ocena}).`);
      return wrot('wyslano');
    }
    if (ocena === 'podejrzane') return blad('podejrzane');

    const subject = `Wiadomość ze strony ${domena}`;
    const wyslane = await this.prisma.emailLog.count({
      where: { tag: TAG_MAILA, userId: s.userId, subject, createdAt: { gte: new Date(teraz - 24 * 60 * 60 * 1000) } },
    });
    if (wyslane >= LIMIT_STRONY_DOBA) return blad('limit-strony');

    const odbiorca = await this.odbiorca(s);
    if (!odbiorca) return blad('brak-odbiorcy');
    const mail = mailFormularza(d, { domena, adresStrony: s.adres ?? `https://${domena}/` });
    const r = await this.mailer.send({
      to: odbiorca,
      subject: mail.subject,
      text: mail.text,
      ...(mail.replyTo ? { replyTo: mail.replyTo } : {}),
      fromRole: 'NOREPLY',
      category: 'TRANSACTIONAL',
      tag: TAG_MAILA,
      userId: s.userId,
    });
    if (!r.delivered) return blad(`mail-${r.suppressedReason ?? 'blad'}`);
    return wrot('wyslano');
  }

  /** firma.email z modelu strony (gdy poprawny), inaczej e-mail konta właściciela. */
  private async odbiorca(s: { userId: string; status: KreatorStatus; model: unknown }): Promise<string | null> {
    if (s.status === KreatorStatus.GOTOWA) {
      const w = walidujStrone(migrujModel(s.model));
      const e = w.ok ? w.strona.firma.email?.trim() : undefined;
      if (e && EMAIL_RE.test(e)) return e;
    }
    const u = await this.prisma.user.findUnique({ where: { id: s.userId }, select: { email: true } });
    return u?.email ?? null;
  }

  /** Okno przesuwne: najwyżej LIMIT_IP.limit wysyłek w LIMIT_IP.oknoMs z jednego IP. */
  private wLimicieIp(ip: string, teraz: number): boolean {
    const od = teraz - LIMIT_IP.oknoMs;
    if (this.ipy.size > MAKS_KUBELKOW) {
      for (const [k, v] of this.ipy) if (!v.some((t) => t > od)) this.ipy.delete(k);
      if (this.ipy.size > MAKS_KUBELKOW) this.ipy.clear();
    }
    const lista = (this.ipy.get(ip) ?? []).filter((t) => t > od);
    if (lista.length >= LIMIT_IP.limit) {
      this.ipy.set(ip, lista);
      return false;
    }
    lista.push(teraz);
    this.ipy.set(ip, lista);
    return true;
  }

  private nieDziala(): OdpowiedzFormularza {
    return {
      status: 404,
      html: stronaKomunikatu('Formularz nie działa', 'Ta strona nie jest już opublikowana albo adres formularza jest nieprawidłowy. Skontaktuj się z właścicielem strony w inny sposób.'),
      naglowki: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP_KOMUNIKATU,
        'X-Robots-Tag': 'noindex, nofollow',
        'Cache-Control': 'no-store',
      },
    };
  }
}
