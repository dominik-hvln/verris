import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import { DOSTAWCY_ZDJEC } from '../biblioteka/dostawca.js';

/** POST /kreator/zasoby (multipart: `plik` + pola tekstowe). */
export class WgrajZasobDto {
  @IsOptional()
  @IsUUID('all', { message: 'Nieprawidłowy identyfikator strony.' })
  stronaId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Opis zdjęcia (alt): najwyżej 200 znaków.' })
  alt?: string;
}

/** POST /kreator/biblioteka/import */
export class ImportZasobuDto extends WgrajZasobDto {
  @IsIn(DOSTAWCY_ZDJEC as unknown as string[], { message: 'Nieznana biblioteka zdjęć.' })
  dostawca!: string;

  /** Id zdjęcia u dostawcy: liczba (Pixabay, Pexels) albo uuid (Openverse). */
  @IsString()
  @Matches(/^([0-9]{1,20}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i, { message: 'Nieprawidłowy identyfikator zdjęcia.' })
  id!: string;
}

/** GET /kreator/zasoby */
export class ListaZasobowDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  strona?: number;
}

/** GET /kreator/zasoby/adresy?ids=a,b,c */
export class AdresyZasobowDto {
  @IsString()
  @MaxLength(3800)
  @Matches(/^[0-9a-f-]{36}(,[0-9a-f-]{36})*$/i, { message: 'Nieprawidłowe identyfikatory zdjęć.' })
  ids!: string;
}

/** GET /kreator/biblioteka?q=&dostawca=&strona= */
export class SzukajZdjecDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Fraza: najwyżej 100 znaków.' })
  q?: string;

  @IsOptional()
  @IsIn(DOSTAWCY_ZDJEC as unknown as string[], { message: 'Nieznana biblioteka zdjęć.' })
  dostawca?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  strona?: number;
}
