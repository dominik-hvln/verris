import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';

const ID_ZGLOSZENIA = /^#?([0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?)$/i;

/**
 * Zgłoszenie podane przez operatora (D2): pełne id albo skrót z panelu („#ab12cd34”). Musi być zgłoszeniem tego
 * klienta — cudzego numeru nie przyjmujemy (klient zobaczy go w swojej aktywności). Puste — null.
 * Wspólne dla akcji na usłudze (zawieszenie-operatora.service.ts) i na domenie (domeny-operatora.service.ts).
 */
export async function zgloszenieKlienta(prisma: PrismaService, klientId: string, wpis: string | null | undefined): Promise<string | null> {
  const tekst = (wpis ?? '').trim();
  if (!tekst) return null;
  const m = ID_ZGLOSZENIA.exec(tekst);
  if (!m) throw new BadRequestException('Numer zgłoszenia ma postać #ab12cd34 (8 znaków z panelu obsługi).');
  const id = m[1]!.toLowerCase();
  const trafienia = await prisma.ticket.findMany({
    where: { userId: klientId, ...(id.length > 8 ? { id } : { id: { startsWith: id } }) },
    select: { id: true },
    take: 2,
  });
  if (trafienia.length === 0) throw new BadRequestException('Nie ma takiego zgłoszenia u tego klienta.');
  if (trafienia.length > 1) throw new BadRequestException('Numer pasuje do kilku zgłoszeń — wklej pełny identyfikator.');
  return trafienia[0]!.id;
}
