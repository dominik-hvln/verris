import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsString, MinLength, MaxLength, IsOptional, IsIn, IsInt, IsUUID, Min, Max } from 'class-validator';
import { Czesciowy } from '../common/validation/czesciowy.js';

export class CreateTicketDto {
  @IsString()
  @MinLength(3, { message: 'Temat musi mieć minimum 3 znaki' })
  @MaxLength(200, { message: 'Temat może mieć najwyżej 200 znaków' })
  subject!: string;

  @IsString()
  @MinLength(10, { message: 'Wiadomość musi mieć minimum 10 znaków' })
  @MaxLength(50_000, { message: 'Wiadomość jest za długa — dołącz dłuższe logi jako plik' })
  message!: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['BILLING', 'TECHNICAL', 'SALES'])
  department?: string;

  @IsOptional()
  @IsString()
  @IsIn(['HOSTING', 'DOMAIN', 'EMAIL', 'DNS', 'BILLING', 'SSL', 'OTHER', 'BETA'])
  topic?: string;

  /** PB-43 — usługa, której dotyczy zgłoszenie (serwis sprawdza, że należy do konta i mieści się w zakresie subkonta). */
  @IsOptional()
  @IsUUID('all', { message: 'Nieprawidłowa usługa' })
  subscriptionId?: string;
}

/** SUP-1 — szybkie podpowiedzi z bazy wiedzy w formularzu zgłoszenia. */
export class KbSuggestDto {
  /** Krótsze zapytanie niż 2 znaki serwis zbywa pustą listą — bez błędu dla pisanego na żywo tematu. */
  @IsString()
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  topic?: string;
}

/** SUP-2 — szablon odpowiedzi wsparcia. */
export class CannedResponseDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsString()
  @MinLength(2)
  content!: string;

  @IsOptional()
  @IsString()
  @IsIn(['HOSTING', 'DOMAIN', 'EMAIL', 'DNS', 'BILLING', 'SSL', 'OTHER', 'BETA'])
  topic?: string;

  @IsOptional()
  @IsString()
  shortcut?: string;

  /** PB-37 — sytuacja w rozmowie (blok „Podpowiedzi” w obsłudze). */
  @IsOptional()
  @IsString()
  @IsIn(['POWITANIE', 'DIAGNOZA', 'OPOZNIENIE', 'ZALECENIA', 'ZAMKNIECIE'])
  category?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** F3.7 — makro: stan po wysłaniu odpowiedzi (puste = jak „Wyślij i czekaj na klienta”). */
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'])
  makroStan?: string | null;

  /** F3.7 — makro: tagi dopisywane do zgłoszenia (normalizacja jak przy tagach zgłoszenia). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(32, { each: true })
  makroTagi?: string[];

  /** F3.7 — makro: przypisanie (JA — stosujący, NIKT — zdejmij opiekuna; puste = bez zmiany). */
  @IsOptional()
  @IsIn(['JA', 'NIKT'])
  makroPrzypisz?: string | null;
}

export class ZmianaSzablonuDto extends Czesciowy(CannedResponseDto) {}

export class AdminUpdateTicketDto {
  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;

  @IsOptional()
  @IsString()
  @IsIn(['BILLING', 'TECHNICAL', 'SALES'])
  department?: string;

  @IsOptional()
  @IsString()
  assignedToId?: string;
}

export class UpdateTicketStatusDto {
  @IsString()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'], {
    message: 'Nieprawidłowy status zgłoszenia',
  })
  status!: string;
}

export class AddTicketReplyDto {
  @IsString()
  @MinLength(2, { message: 'Odpowiedź musi mieć minimum 2 znaki' })
  @MaxLength(50_000, { message: 'Odpowiedź jest za długa — dołącz dłuższe logi jako plik' })
  message!: string;

  /** PB-37 — obsługa: „Wyślij” (sprawa zostaje u nas: W realizacji) albo „Wyślij i czekaj na klienta” (domyślnie). */
  @IsOptional()
  @IsIn(['tak', 'nie'])
  czekaj?: 'tak' | 'nie';
}

/**
 * F2.5 — zgłoszenie założone przez obsługę w imieniu klienta (z karty klienta albo ze skrzynki). Klienta
 * wskazuje `userId` (karta) albo dokładny `email` (skrzynka) — jedno z dwóch.
 */
export class ZgloszenieWImieniuDto extends CreateTicketDto {
  @IsOptional()
  @IsUUID('all', { message: 'Nieprawidłowy klient' })
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  email?: string;
}

/** F2.5 — notatka wewnętrzna w wątku (klient jej nie widzi). */
export class NotatkaZgloszeniaDto {
  @IsString()
  @MinLength(2, { message: 'Notatka musi mieć minimum 2 znaki' })
  @MaxLength(20_000, { message: 'Notatka jest za długa' })
  message!: string;
}

/** Eskalacja zgłoszenia (panel obsługi) — powód min. 10 znaków sprawdza serwis. */
export class EskalacjaZgloszeniaDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

export class RunbookZgloszeniaDto {
  @IsString()
  @MaxLength(64)
  runbookKey!: string;
}

export class RyzykoZgloszeniaDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  riskFlag?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  riskReason?: string | null;
}

export class SubmitCsatDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MinLength(0)
  comment?: string;

  /** PB-37 — ocena opiekuna (rating = support ogólnie). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  agentRating?: number;

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;
}

/** PB-43 — obsługa zmienia usługę, której dotyczy zgłoszenie (null = bez usługi). */
export class PowiazanieUslugiDto {
  @IsOptional()
  @IsUUID('all', { message: 'Nieprawidłowa usługa' })
  subscriptionId?: string | null;
}

/** F2.5 — tagi zgłoszenia (cała lista; pusta = bez tagów). Normalizację i limity sprawdza serwis. */
export class TagiZgloszeniaDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  tagi!: string[];
}

/** F2.5 — cofnięcie eskalacji: powód obowiązkowy (min. 10 znaków sprawdza serwis). */
export class CofniecieEskalacjiDto {
  @IsString()
  @MaxLength(2000)
  reason!: string;
}

/** F2.5 — zapis odhaczonych kroków runbooka w wątku (notatka wewnętrzna). `kroki` — numery od 0. */
export class KrokiRunbookaDto {
  @IsString()
  @MaxLength(64)
  runbookKey!: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsInt({ each: true })
  @Min(0, { each: true })
  kroki!: number[];
}

/** F3.7 — akcje masowe w skrzynce: najwyżej tyle zgłoszeń naraz (limit, jak w Zendesk/Freshdesk — strona skrzynki). */
export const MASOWO_MAX = 50;

/**
 * F3.7 — akcja masowa na zaznaczonych zgłoszeniach: przypisz (`assignedToId`, pusty = nikt), tag (`tag` + `tryb`
 * dodaj/usuń) albo stan (`status`). Każde zgłoszenie przechodzi przez tę samą logikę co zmiana pojedyncza.
 */
export class AkcjaMasowaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MASOWO_MAX, { message: `Najwyżej ${MASOWO_MAX} zgłoszeń naraz.` })
  @IsUUID('all', { each: true, message: 'Nieprawidłowe zgłoszenie' })
  ids!: string[];

  @IsIn(['przypisz', 'tag', 'stan'])
  akcja!: 'przypisz' | 'tag' | 'stan';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  assignedToId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  tag?: string;

  @IsOptional()
  @IsIn(['dodaj', 'usun'])
  tryb?: 'dodaj' | 'usun';

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'CLOSED'])
  status?: string;
}

/** F3.7 — scalenie: zgłoszenie z adresu (źródło) wchodzi do `celId`; powód obowiązkowy (min. 10 znaków sprawdza serwis). */
export class ScalenieZgloszeniaDto {
  @IsUUID('all', { message: 'Nieprawidłowe zgłoszenie docelowe' })
  celId!: string;

  @IsString()
  @MaxLength(2000)
  powod!: string;
}

/** F3.7 — makro: szablon odpowiedzi z akcjami (stan, tagi, przypisanie) zastosowany jednym kliknięciem. */
export class MakroZgloszeniaDto {
  @IsUUID('all', { message: 'Nieprawidłowe makro' })
  makroId!: string;
}

/** F3.7 — znacznik obecności w zgłoszeniu: otwarte / pisze odpowiedź (odpytywanie z panelu obsługi). */
export class ObecnoscZgloszeniaDto {
  @IsBoolean()
  pisze!: boolean;
}
