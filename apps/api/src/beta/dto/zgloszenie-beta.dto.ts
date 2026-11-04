import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** A1-04 — litery (także polskie i innych alfabetów), spacja, myślnik, apostrof; pierwsza litera. */
export const IMIE_RE = /^\s*\p{L}[\p{L}\p{M} '’-]*\s*$/u;

/** Co tester chce sprawdzić — te same wartości wysyła formularz verris.pl/beta. */
export const ZAKRESY_BETA = ['WORDPRESS', 'SKLEP', 'STRONY_DLA_KLIENTOW', 'POCZTA', 'INNE'] as const;
export type ZakresBeta = (typeof ZAKRESY_BETA)[number];

export class UtmZgloszeniaDto {
  @IsOptional() @IsString() @MaxLength(100) source?: string;
  @IsOptional() @IsString() @MaxLength(100) medium?: string;
  @IsOptional() @IsString() @MaxLength(100) campaign?: string;
  @IsOptional() @IsString() @MaxLength(100) content?: string;
  @IsOptional() @IsString() @MaxLength(100) term?: string;
}

/** POST /public/beta/zgloszenia — formularz otwartej bety na verris.pl/beta. */
export class ZgloszenieBetaDto {
  /**
   * A1-04 — imię jak imię: litery, spacje, myślnik, apostrof (do 60 znaków). Bez cyfr, kropek i „://” — pole trafia
   * do prawdziwych maili Verris (zaproszenie), więc nie da się w nim przemycić domeny ani zdania.
   */
  @IsString()
  @MinLength(1)
  @MaxLength(60, { message: 'Imię może mieć najwyżej 60 znaków.' })
  @Matches(IMIE_RE, { message: 'Imię może zawierać tylko litery, spacje, myślnik i apostrof.' })
  imie!: string;

  @IsEmail() @MaxLength(320) email!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ArrayUnique()
  @IsIn(ZAKRESY_BETA, { each: true })
  zakres!: ZakresBeta[];

  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }, { message: 'Adres strony musi zaczynać się od http:// albo https://.' })
  @MaxLength(2048)
  strona?: string;

  @IsOptional() @IsString() @MaxLength(100) obecnyHosting?: string;

  @IsOptional() @IsString() @MaxLength(1000) uwagi?: string;

  /** Zgoda na kontakt w sprawie testów — bez niej zgłoszenia nie przyjmujemy. */
  @IsBoolean() @Equals(true, { message: 'Zgoda jest wymagana.' }) zgoda!: true;

  /** Treść klauzuli pokazanej przy polu zgody (dowód RODO). */
  @IsString() @MinLength(1) @MaxLength(2000) zgodaTekst!: string;

  @IsOptional() @IsObject() @ValidateNested() @Type(() => UtmZgloszeniaDto) utm?: UtmZgloszeniaDto;

  @IsOptional() @IsString() @MaxLength(2048) page?: string;

  /**
   * Pułapka na boty — pole ukryte w formularzu; człowiek go nie wypełnia. P1-07 (beta 3.11): wcześniej `firma`,
   * a takie pole autouzupełnianie przeglądarki wypełniało nazwą firmy z profilu — zgłoszenie przepadało po cichu.
   * Nazwa bez znaczenia dla heurystyk autouzupełniania (nie imię, firma, adres, telefon).
   */
  @IsOptional() @IsString() @MaxLength(200) pulapka?: string;

  @IsOptional() @IsString() @MaxLength(4096) captchaToken?: string;
}
