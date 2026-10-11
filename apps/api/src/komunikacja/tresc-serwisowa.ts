import { BadRequestException } from '@nestjs/common';
import { MAIL_OBSLUGI_TEMAT_MAX, MAIL_OBSLUGI_TRESC_MAX, nazwaInfrastruktury, trescPromocyjna } from '@verris/contracts';

/**
 * F3.8 — wspólne reguły treści poczty serwisowej (mail z szablonu i komunikat do klientów węzła/planu): długość,
 * bez treści promocyjnych (PKE — wychodzi bez zgody marketingowej), bez nazw infrastruktury (white label), bez
 * nieuzupełnionych pól szablonu. Zwraca przycięte temat i treść.
 */
export function sprawdzTrescSerwisowa(temat: string | null | undefined, tresc: string | null | undefined): { temat: string; tresc: string } {
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
  if (/\{(domena|imie)\}|\((opisz|termin)[^)]*\)/i.test(`${t}\n${b}`)) {
    throw new BadRequestException('Uzupełnij pola szablonu (w nawiasach albo klamrach) przed wysłaniem.');
  }
  return { temat: t, tresc: b };
}
