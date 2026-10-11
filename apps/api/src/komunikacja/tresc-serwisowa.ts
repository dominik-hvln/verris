import { BadRequestException } from '@nestjs/common';
import { MAIL_OBSLUGI_TEMAT_MAX, MAIL_OBSLUGI_TRESC_MAX, fragmentInfrastruktury, trescPromocyjna } from '@verris/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';
import { wezlyBialejEtykiety } from '../common/biala-etykieta.js';

/**
 * F3.8 — wspólne reguły treści poczty serwisowej (mail z szablonu i komunikat do klientów węzła/planu): długość,
 * bez treści promocyjnych (PKE — wychodzi bez zgody marketingowej), bez nazw infrastruktury i adresów (white label),
 * bez nieuzupełnionych pól szablonu. Zwraca przycięte temat i treść.
 *
 * Audyt Fali 3 — jeden filtr white label (`fragmentInfrastruktury` z libs/contracts, ten sam co raport pomigracyjny
 * i eksport RODO) zamiast osobnej listy: wcześniej przechodziły m.in. lvectl, CMD_API, ścieżki, ModSecurity, IPv6
 * i host panelu węzła. `wezly` — nazwy, hosty, host panelu (daHost), IPv4 i IPv6 węzłów z bazy (`wezlyDoSprawdzenia`).
 * `adresyIp: false` — mail do jednego klienta: dowolny IP spoza węzłów przechodzi (np. odblokowany adres klienta);
 * komunikat do wielu klientów odrzuca każdy adres IP.
 */
export function sprawdzTrescSerwisowa(
  temat: string | null | undefined,
  tresc: string | null | undefined,
  wezly: readonly (string | null | undefined)[] = [],
  opcje: { adresyIp?: boolean } = {},
): { temat: string; tresc: string } {
  const t = (temat ?? '').replace(/\s+/g, ' ').trim();
  const b = (tresc ?? '').replace(/\r\n?/g, '\n').trim();
  if (t.length < 5 || t.length > MAIL_OBSLUGI_TEMAT_MAX) throw new BadRequestException(`Temat: od 5 do ${MAIL_OBSLUGI_TEMAT_MAX} znaków.`);
  if (b.length < 20 || b.length > MAIL_OBSLUGI_TRESC_MAX) throw new BadRequestException(`Treść: od 20 do ${MAIL_OBSLUGI_TRESC_MAX} znaków.`);
  const promo = trescPromocyjna(`${t}\n${b}`);
  if (promo) {
    throw new BadRequestException(`Wiadomość serwisowa nie może zawierać treści promocyjnych („${promo}”) — wychodzi bez zgody marketingowej.`);
  }
  const infra = fragmentInfrastruktury(`${t}\n${b}`, [], { adresyIp: false });
  if (infra) throw new BadRequestException(`Klient nie widzi nazw infrastruktury („${infra}”) — napisz to ogólniej.`);
  const adres = fragmentInfrastruktury(`${t}\n${b}`, wezly, opcje);
  if (adres) throw new BadRequestException(`Klient nie widzi adresów serwerów („${adres}”) — napisz to ogólniej.`);
  if (/\{(domena|imie)\}|\((opisz|termin)[^)]*\)/i.test(`${t}\n${b}`)) {
    throw new BadRequestException('Uzupełnij pola szablonu (w nawiasach albo klamrach) przed wysłaniem.');
  }
  return { temat: t, tresc: b };
}

/** Nazwy, hosty, host panelu i adresy (IPv4, IPv6) wszystkich węzłów — white label (CLAUDE.md, D3). */
export function wezlyDoSprawdzenia(prisma: Pick<PrismaService, 'server'>): Promise<Array<string | null>> {
  return wezlyBialejEtykiety(prisma as never);
}
