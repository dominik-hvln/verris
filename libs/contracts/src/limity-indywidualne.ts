/**
 * K3 (PB-53.5, F3.5 „limity custom”) — limity indywidualne jednej usługi hostingowej, ustawiane przez administratora.
 *
 * Tylko limity, które plan już ma i które dziś trafiają na konto na serwerze (pakiet konta: quota, bandwidth,
 * vdomains, nemails, mysql — apps/api/src/servers/da-package-spec.ts). Limity CPU/RAM/IO/EP/NPROC świadomie poza
 * zakresem: prowadzi je autoskalowanie (płatne bloki) i księga pojemności węzła — wariant minimalny (decyzja 12.10).
 *
 * Wspólne dla API (walidacja zapisu), panelu admina (formularz) i panelu klienta (lista „Limity ustalone
 * indywidualnie”). Klient nie widzi słowa „custom” ani nazw infrastruktury.
 */
export const LIMITY_INDYWIDUALNE = {
  /** Plan.diskLimitMb — quota dysku konta. */
  diskLimitMb: { etykieta: 'Dysk', jednostka: 'MB', min: 100, max: 10_485_760 },
  /** Plan.includedTransferGb — miesięczny transfer konta. */
  includedTransferGb: { etykieta: 'Transfer miesięczny', jednostka: 'GB', min: 1, max: 1_000_000 },
  /** Domeny konta (z domeną główną). */
  domains: { etykieta: 'Domeny', jednostka: '', min: 1, max: 100_000 },
  /** Skrzynki e-mail. */
  emailAccounts: { etykieta: 'Skrzynki e-mail', jednostka: '', min: 0, max: 1_000_000 },
  /** Bazy danych MySQL/MariaDB. */
  databases: { etykieta: 'Bazy danych', jednostka: '', min: 0, max: 100_000 },
} as const;

export type PoleLimitu = keyof typeof LIMITY_INDYWIDUALNE;
export const POLA_LIMITOW = Object.keys(LIMITY_INDYWIDUALNE) as PoleLimitu[];

/** Nadpisania limitów planu (brak pola = jak w planie). */
export type LimityIndywidualne = Partial<Record<PoleLimitu, number>>;

/** Jeden limit na karcie usługi. `null` = bez limitu. */
export interface PozycjaLimitu {
  pole: PoleLimitu;
  etykieta: string;
  /** Wartość z planu. */
  plan: number | null;
  /** Nadpisanie administratora; `null` = jak w planie. */
  nadpisanie: number | null;
  /** Obowiązuje (nadpisanie albo plan). */
  efektywny: number | null;
}

export const MIN_POWOD_LIMITOW = 10;

/**
 * Walidacja wejścia (formularz admina, ciało żądania, odczyt z bazy): obiekt ze znanymi polami, liczby całkowite
 * w zakresie pola. Pole puste (`null`, `undefined`, '') = jak w planie — znika z wyniku. Nieznane pole = błąd.
 */
export function walidujLimityIndywidualne(
  wejscie: unknown,
): { ok: true; limity: LimityIndywidualne } | { ok: false; blad: string } {
  if (wejscie === null || wejscie === undefined) return { ok: true, limity: {} };
  if (typeof wejscie !== 'object' || Array.isArray(wejscie)) return { ok: false, blad: 'Limity muszą być obiektem.' };
  const limity: LimityIndywidualne = {};
  for (const [klucz, wartosc] of Object.entries(wejscie as Record<string, unknown>)) {
    if (!Object.hasOwn(LIMITY_INDYWIDUALNE, klucz)) return { ok: false, blad: `Nieznany limit: ${klucz}.` };
    const pole = klucz as PoleLimitu;
    if (wartosc === null || wartosc === undefined || wartosc === '') continue;
    const n = typeof wartosc === 'string' && /^\d+$/.test(wartosc.trim()) ? Number(wartosc.trim()) : wartosc;
    const { etykieta, min, max } = LIMITY_INDYWIDUALNE[pole];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
      return { ok: false, blad: `${etykieta}: liczba całkowita od ${min} do ${max}.` };
    }
    limity[pole] = n;
  }
  return { ok: true, limity };
}

const liczba = (n: number, ulamek = 0) => n.toLocaleString('pl-PL', { maximumFractionDigits: ulamek });

/** „50 GB”, „500 MB”, „1 000 GB”, „25”, „bez limitu”. */
export function formatLimitu(pole: PoleLimitu, wartosc: number | null): string {
  if (wartosc === null) return 'bez limitu';
  if (pole === 'diskLimitMb') return wartosc >= 1024 ? `${liczba(wartosc / 1024, 1)} GB` : `${liczba(wartosc)} MB`;
  if (pole === 'includedTransferGb') return `${liczba(wartosc)} GB`;
  return liczba(wartosc);
}
