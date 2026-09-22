import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/**
 * Skrzynki pocztowe — body idzie prosto do DirectAdmina (CMD_API_POP).
 * Do 2026-09-23 było nietypowane (interfejs zamiast klasy = brak walidacji).
 */
const QUOTA_MIN_MB = 10;
const QUOTA_MAX_MB = 102_400;

class SkrzynkaBaza {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class SkrzynkaZHaslem extends SkrzynkaBaza {
  @IsString()
  @MinLength(8, { message: 'Hasło skrzynki musi mieć co najmniej 8 znaków.' })
  @MaxLength(128)
  @Matches(/^[^\x00-\x1f\x7f]+$/, { message: 'Hasło nie może zawierać znaków sterujących.' })
  password!: string;
}

export class UtworzSkrzynkeDto extends SkrzynkaZHaslem {
  @IsOptional()
  @IsInt()
  @Min(QUOTA_MIN_MB)
  @Max(QUOTA_MAX_MB)
  quotaMb?: number;
}

export class ZmienHasloSkrzynkiDto extends SkrzynkaZHaslem {}

/** E-05 — zmiana rozmiaru istniejącej skrzynki. */
export class ZmienRozmiarSkrzynkiDto extends SkrzynkaBaza {
  @IsInt()
  @Min(QUOTA_MIN_MB, { message: `Rozmiar skrzynki to co najmniej ${QUOTA_MIN_MB} MB.` })
  @Max(QUOTA_MAX_MB)
  quotaMb!: number;
}
