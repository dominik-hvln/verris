import { randomInt } from 'crypto';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * SVC-TAG — długość handle'a usługi. DirectAdmin ogranicza login konta do 8
 * znaków, a handle dla hostingu staje się tym loginem (realny prefiks baz),
 * więc trzymamy 8 znaków też dla pozostałych produktów (spójność wizualna).
 */
export const SERVICE_TAG_LENGTH = 8;

// Tylko małe litery — bezpieczne jako login DA i czytelne (styl Cyberfolks).
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Losowy handle: 8 małych liter (zawsze zaczyna się literą — wymóg DA). */
export function randomServiceTag(length = SERVICE_TAG_LENGTH): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * Zwraca unikalny handle — niekolidujący ani z innym `Subscription.serviceTag`,
 * ani z istniejącym loginem konta DirectAdmin (`Account.daUsername`), bo dla
 * hostingu handle == login DA.
 */
export async function generateUniqueServiceTag(prisma: PrismaService): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = randomServiceTag();
    const [subClash, accClash] = await Promise.all([
      prisma.subscription.findUnique({ where: { serviceTag: candidate }, select: { id: true } }),
      prisma.account.findUnique({ where: { daUsername: candidate }, select: { id: true } }),
    ]);
    if (!subClash && !accClash) return candidate;
  }
  // Skrajnie nieprawdopodobne przy 26^8 kombinacji — dokładamy entropii.
  return randomServiceTag(SERVICE_TAG_LENGTH + 2).slice(0, SERVICE_TAG_LENGTH);
}
