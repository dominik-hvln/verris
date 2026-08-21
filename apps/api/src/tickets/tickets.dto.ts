import { IsString, MinLength, IsOptional, IsIn, IsInt, Min, Max } from 'class-validator';

export class CreateTicketDto {
  @IsString()
  @MinLength(3, { message: 'Temat musi mieć minimum 3 znaki' })
  subject: string;

  @IsString()
  @MinLength(10, { message: 'Wiadomość musi mieć minimum 10 znaków' })
  message: string;

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
  @IsIn(['HOSTING', 'DOMAIN', 'EMAIL', 'DNS', 'BILLING', 'SSL', 'OTHER'])
  topic?: string;
}

/** SUP-1 — szybkie podpowiedzi z bazy wiedzy w formularzu zgłoszenia. */
export class KbSuggestDto {
  @IsString()
  @MinLength(2)
  query: string;

  @IsOptional()
  @IsString()
  topic?: string;
}

/** SUP-2 — szablon odpowiedzi wsparcia. */
export class CannedResponseDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  content: string;

  @IsOptional()
  @IsString()
  @IsIn(['HOSTING', 'DOMAIN', 'EMAIL', 'DNS', 'BILLING', 'SSL', 'OTHER'])
  topic?: string;

  @IsOptional()
  @IsString()
  shortcut?: string;

  @IsOptional()
  isActive?: boolean;
}

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
  status: string;
}

export class AddTicketReplyDto {
  @IsString()
  @MinLength(2, { message: 'Odpowiedź musi mieć minimum 2 znaki' })
  message: string;
}

export class SubmitCsatDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MinLength(0)
  comment?: string;
}
