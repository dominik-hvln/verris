import { ArrayMaxSize, IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Menedżer plików — kształt ciał żądań. Ścieżki i nazwy sprawdza dalej FilesService (bezpieczna ścieżka,
 * limity rozmiaru); tu odcinamy typy inne niż napis i znaki sterujące w nazwach.
 */
const BEZ_STERUJACYCH = /^[^\x00-\x1f\x7f]*$/;
const KOMUNIKAT = 'Nazwa lub ścieżka nie może zawierać znaków sterujących.';
const MAX_ZAZNACZONYCH = 1000;

class WKatalogu {
  @IsOptional() @IsString() @MaxLength(4096) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT })
  dir?: string;
}

class Zaznaczone extends WKatalogu {
  @IsArray()
  @ArrayMaxSize(MAX_ZAZNACZONYCH)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @Matches(BEZ_STERUJACYCH, { each: true, message: KOMUNIKAT })
  names!: string[];
}

export class ZapiszPlikDto extends WKatalogu {
  @IsString() @MaxLength(255) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) filename!: string;
  /** Rozmiar w bajtach pilnuje serwis (MAX_WRITE_BYTES). */
  @IsString() content!: string;
}

export class NowyKatalogDto extends WKatalogu {
  @IsString() @MaxLength(255) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) name!: string;
}

export class ZmienNazweDto extends WKatalogu {
  @IsString() @MaxLength(255) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) oldName!: string;
  @IsString() @MaxLength(255) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) newName!: string;
}

export class UsunPlikiDto extends Zaznaczone {}

export class PrzeniesPlikiDto extends Zaznaczone {
  @IsOptional() @IsString() @MaxLength(4096) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) dest?: string;
}

export class SpakujDto extends Zaznaczone {
  @IsString() @MaxLength(255) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) name!: string;
}

export class RozpakujDto {
  @IsString() @MaxLength(4096) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) path!: string;
  @IsOptional() @IsString() @MaxLength(4096) @Matches(BEZ_STERUJACYCH, { message: KOMUNIKAT }) dest?: string;
}

export class UprawnieniaDto extends Zaznaczone {
  @IsString() @Matches(/^[0-7]{3,4}$/, { message: 'Uprawnienia w zapisie ósemkowym, np. 644 lub 0755.' }) mode!: string;
}

export class WgrajPlikDto extends WKatalogu {}
