import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

/**
 * S-4b — sprawdzanie haseł względem bazy wycieków (Have I Been Pwned).
 *
 * Model k-anonimowości: wysyłamy do HIBP wyłącznie 5 pierwszych znaków SHA-1
 * hasła; pełne hasło ani pełny hash NIGDY nie opuszczają serwera. Blokujemy
 * rejestrację/zmianę na hasło znane z wycieków.
 *
 * Fail-open: gdy HIBP jest niedostępny (sieć/timeout), NIE blokujemy — lepiej
 * wpuścić niż zablokować legalnego użytkownika przez awarię zewnętrznej usługi.
 * Wyłączane przez `HIBP_ENABLED=0`.
 */
@Injectable()
export class PwnedPasswordService {
  private readonly logger = new Logger(PwnedPasswordService.name);
  private readonly enabled: boolean;
  private static readonly RANGE_URL = 'https://api.pwnedpasswords.com/range/';

  constructor(private readonly config: ConfigService) {
    // Domyślnie włączone (w prod i dev); wyłącz jawnie HIBP_ENABLED=0.
    this.enabled = (process.env.HIBP_ENABLED ?? '1') !== '0';
  }

  /** Rzuca `BadRequestException`, gdy hasło występuje w bazach wycieków. */
  async assertNotPwned(password: string): Promise<void> {
    if (!this.enabled || !password) return;

    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    let text: string;
    try {
      const res = await fetch(`${PwnedPasswordService.RANGE_URL}${prefix}`, {
        method: 'GET',
        headers: { 'Add-Padding': 'true', 'User-Agent': 'Verris-Password-Check' },
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) return; // fail-open
      text = await res.text();
    } catch (err) {
      this.logger.warn(`HIBP niedostępny (fail-open): ${(err as Error).message}`);
      return;
    }

    for (const line of text.split('\n')) {
      const [hashSuffix, countRaw] = line.trim().split(':');
      if (hashSuffix === suffix) {
        const count = parseInt(countRaw ?? '0', 10) || 0;
        if (count > 0) {
          throw new BadRequestException(
            'To hasło pojawiło się w znanych wyciekach danych i jest niebezpieczne. ' +
              'Wybierz inne, unikalne hasło.',
          );
        }
      }
    }
  }
}
