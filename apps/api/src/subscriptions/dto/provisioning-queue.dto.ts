import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Ponowienie / odrzucenie zadania kolejki provisioningu — powód trafia do audytu. */
export class PowodDecyzjiDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
