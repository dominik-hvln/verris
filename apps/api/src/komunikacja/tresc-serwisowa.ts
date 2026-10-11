import { BadRequestException } from '@nestjs/common';
import { MAIL_OBSLUGI_TEMAT_MAX, MAIL_OBSLUGI_TRESC_MAX, nazwaInfrastruktury, trescPromocyjna } from '@verris/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * F3.8 — wspólne reguły treści poczty serwisowej (mail z szablonu i komunikat do klientów węzła/planu): długość,
 * bez treści promocyjnych (PKE — wychodzi bez zgody marketingowej), bez nazw infrastruktury (white label), bez
 * adresów węzłów (`adresyWezlow` — hostname i IP z bazy; przegląd F3.8), bez nieuzupełnionych pól szablonu.
 * Zwraca przycięte temat i treść.
 */
export function sprawdzTrescSerwisowa(
  temat: string | null | undefined,
  tresc: string | null | undefined,
  adresyWezlow: readonly string[] = [],
): { temat: string; tresc: string } {
  const t = (temat ?? '').replace(/\s+/g, ' ').trim();
  const b = (tresc ?? '').replace(/\r\n?/g, '\n').trim();
  if (t.length < 5 || t.length > MAIL_OBSLUGI_TEMAT_MAX) throw new BadRequestException(`Temat: od 5 do ${MAIL_OBSLUGI_TEMAT_MAX} znaków.`);
  if (b.length < 20 || b.length > MAIL_OBSLUGI_TRESC_MAX) throw new BadRequestException(`Treść: od 20 do ${MAIL_OBSLUGI_TRESC_MAX} znaków.`);
  const promo = trescPromocyjna(`${t}\n${b}`);
  if (promo) {
    throw new BadRequestException(`Wiadomość serwisowa nie może zawierać treści promocyjnych („${promo}”) — wychodzi bez zgody marketingowej.`);
  }
  const infra = nazwaInfrastruktury(`${t}\n${b}`);
  if (infra) throw new BadRequestException(`Klient nie widzi nazw infrastruktury („${infra}”) — napisz to ogólniej.`);
  const adres = adresWezlaWTresci(`${t}\n${b}`, adresyWezlow);
  if (adres) throw new BadRequestException(`Klient nie widzi adresów serwerów („${adres}”) — napisz to ogólniej.`);
  if (/\{(domena|imie)\}|\((opisz|termin)[^)]*\)/i.test(`${t}\n${b}`)) {
    throw new BadRequestException('Uzupełnij pola szablonu (w nawiasach albo klamrach) przed wysłaniem.');
  }
  return { temat: t, tresc: b };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Pierwszy adres węzła (hostname albo IP) występujący w tekście jako całe słowo — „10.0.0.1” nie trafia w „110.0.0.15”. */
export function adresWezlaWTresci(tekst: string, adresy: readonly string[]): string | null {
  for (const a of adresy) {
    const x = a.trim();
    if (x.length < 4) continue;
    if (new RegExp(`(?<![\\w.-])${escapeRe(x)}(?![\\w-]|\\.\\w)`, 'i').test(tekst)) return x;
  }
  return null;
}

/** Hostname i IP wszystkich węzłów (white label: klient nie widzi adresów węzłów — CLAUDE.md). */
export async function adresyWezlow(prisma: Pick<PrismaService, 'server'>): Promise<string[]> {
  const s = await prisma.server.findMany({ select: { hostname: true, ipAddress: true } });
  return s.flatMap((w) => [w.hostname, w.ipAddress]).filter((x): x is string => !!x && !!x.trim());
}
