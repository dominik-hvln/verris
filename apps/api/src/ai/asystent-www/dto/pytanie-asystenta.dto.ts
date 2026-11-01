import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { LIMITY_ASYSTENTA } from '../konfiguracja.js';

/** POST /public/asystent — pytanie z verris.pl (bez konta). */
export class PytanieAsystentaDto {
  @IsOptional()
  @IsUUID()
  rozmowaId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(LIMITY_ASYSTENTA.maksZnakowPytania, {
    message: `Pytanie może mieć najwyżej ${LIMITY_ASYSTENTA.maksZnakowPytania} znaków.`,
  })
  pytanie!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}
