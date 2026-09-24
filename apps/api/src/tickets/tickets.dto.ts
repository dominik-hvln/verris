import { IsBoolean, IsString, MinLength, MaxLength, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';
import { Czesciowy } from '../common/validation/czesciowy';

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

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
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
}
