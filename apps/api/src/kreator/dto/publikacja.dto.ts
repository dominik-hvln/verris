import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** POST /kreator/strony/:id/publikuj – domena sprawdzana w serwisie (należy do konta, opłacony hosting). */
export class PublikujDto {
  @IsOptional()
  @IsString()
  @MaxLength(253, { message: 'Nieprawidłowa domena.' })
  domena?: string;

  @IsOptional()
  @IsBoolean()
  zastap?: boolean;
}
