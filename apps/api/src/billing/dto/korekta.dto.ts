import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** M-06 — pozycja PO korekcie. Cena brutto, jak wszędzie w tym systemie. */
export class PozycjaKorektyDto {
  @IsString()
  @MaxLength(200)
  nazwa!: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  ilosc!: number;

  /** Cena BRUTTO za sztukę PO korekcie. Zero oznacza pełny zwrot tej pozycji. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1000000)
  cenaBrutto!: number;
}

export class WystawKorekteDto {
  @IsIn(['WARTOSCIOWA', 'FORMALNA'])
  rodzaj!: 'WARTOSCIOWA' | 'FORMALNA';

  /**
   * Przyczyna korekty — pole OBOWIĄZKOWE na dokumencie
   * (art. 106j ust. 2 pkt 4 ustawy o VAT), więc wymagane też tutaj.
   * Minimum pięć znaków, bo „ok" nie jest przyczyną.
   */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  przyczyna!: string;

  /** Pozycje po korekcie — wymagane dla korekty wartościowej. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PozycjaKorektyDto)
  pozycjePo?: PozycjaKorektyDto[];

  /** Poprawione dane nabywcy — wymagane dla korekty formalnej. */
  @IsOptional()
  @IsObject()
  nabywcaPo?: Record<string, unknown>;
}
