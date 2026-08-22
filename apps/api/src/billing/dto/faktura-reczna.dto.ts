import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Z-01 — pozycja faktury wystawianej ręcznie przez operatora.
 *
 * Kwoty podaje się BRUTTO, tak jak wszędzie indziej w tym systemie: ceny
 * w cenniku, na stronie i w koszyku są brutto. Operator, który musiałby
 * przeliczać netto w pamięci, prędzej czy później pomyli się o grosz — a to
 * jest dokument księgowy.
 */
export class PozycjaRecznaDto {
  @IsString()
  @MaxLength(200)
  nazwa!: string;

  @IsInt()
  @Min(1)
  @Max(9999)
  ilosc!: number;

  /** Cena BRUTTO za sztukę. */
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000000)
  cenaBrutto!: number;
}

export class FakturaRecznaDto {
  @IsUUID()
  userId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PozycjaRecznaDto)
  pozycje!: PozycjaRecznaDto[];

  @IsOptional()
  @IsIn(['PLN', 'EUR', 'USD'])
  waluta?: 'PLN' | 'EUR' | 'USD';

  /**
   * Powód wystawienia — trafia do dziennika audytu, nie na fakturę.
   * Wymagany, bo faktura wystawiona ręcznie zawsze jest wyjątkiem od reguły,
   * a wyjątek bez uzasadnienia po miesiącu jest nie do odtworzenia.
   */
  @IsString()
  @MaxLength(500)
  powod!: string;
}
