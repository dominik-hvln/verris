import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Z-06 — zakup dodatku.
 *
 * Endpoint nie miał wcześniej DTO: kontroler brał surowy `body: { slug, subscriptionId }`,
 * więc do serwisu wchodziło cokolwiek. `slug` był bezpieczny przez przypadek
 * (odbijał się od katalogu w kodzie), ale `subscriptionId` szedł wprost do zapytania.
 */
export class PurchaseAddonDto {
  /** Klucz z katalogu dodatków, np. `priority_support_30d`. */
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[a-z0-9_]+$/, {
    message: 'Nieprawidłowy identyfikator dodatku.',
  })
  slug!: string;

  /** Usługa, której dotyczy dodatek (opcjonalna dla dodatków kontowych). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9-]+$/, {
    message: 'Nieprawidłowy identyfikator usługi.',
  })
  subscriptionId?: string;

  /**
   * Klucz idempotencji generowany przez klienta — jeden na JEDNĄ decyzję zakupu.
   *
   * Gdy panel go poda, ponowione żądanie (podwójne kliknięcie, retry po zerwanej
   * sieci, cofnięcie i ponowne wysłanie formularza) trafia w ten sam klucz
   * i zwraca ten sam zakup zamiast obciążać portfel drugi raz.
   *
   * Gdy klucza brak, serwis wylicza go sam z (użytkownik, dodatek, usługa, okno
   * czasu) — patrz `kluczIdempotencji` w addon.service.ts. Wersja z kluczem od
   * klienta jest mocniejsza, bo nie ma granicy okna.
   */
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9._:-]+$/, {
    message: 'Nieprawidłowy klucz idempotencji.',
  })
  idempotencyKey?: string;
}
