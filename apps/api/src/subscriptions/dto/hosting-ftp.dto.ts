import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Konta FTP — body idzie prosto do DirectAdmina (CMD_API_FTP). Do 2026-09-23
 * było nietypowane (interfejs zamiast klasy = brak walidacji).
 */
class HasloFtp {
  @IsString()
  @MinLength(8, { message: 'Hasło FTP musi mieć co najmniej 8 znaków.' })
  @MaxLength(128)
  @Matches(/^[^\x00-\x1f\x7f]+$/, { message: 'Hasło nie może zawierać znaków sterujących.' })
  password!: string;
}

export class UtworzKontoFtpDto extends HasloFtp {
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9._-]{0,31}$/i, { message: 'Login FTP: litery, cyfry, kropka, myślnik lub podkreślnik (do 32 znaków).' })
  username!: string;

  /** Katalog w obrębie konta; bez „..” i znaków sterujących. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^(?!.*\.\.)[^\x00-\x1f\x7f]*$/, { message: 'Niepoprawny katalog.' })
  directory?: string;
}

/** C-18 — zmiana hasła istniejącego konta FTP. */
export class ZmienHasloFtpDto extends HasloFtp {}
