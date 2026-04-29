import { IsString, MinLength, IsOptional, IsIn } from 'class-validator';

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
}

export class AdminUpdateTicketDto {
  @IsOptional()
  @IsString()
  @IsIn(['OPEN', 'IN_PROGRESS', 'CLOSED'])
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
  @IsIn(['OPEN', 'IN_PROGRESS', 'CLOSED'], {
    message: 'Nieprawidłowy status zgłoszenia',
  })
  status: string;
}

export class AddTicketReplyDto {
  @IsString()
  @MinLength(2, { message: 'Odpowiedź musi mieć minimum 2 znaki' })
  message: string;
}
