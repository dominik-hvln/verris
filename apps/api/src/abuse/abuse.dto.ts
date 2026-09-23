import { Equals, IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const KATEGORIE_NADUZYC = [
  'SPAM', 'PHISHING', 'MALWARE', 'ILLEGAL_CONTENT', 'COPYRIGHT', 'PERSONAL_DATA', 'OTHER',
] as const;
export type KategoriaNaduzycia = (typeof KATEGORIE_NADUZYC)[number];

/** DSA art. 16 ust. 2: uzasadnienie, dokładny URL, dane zgłaszającego, oświadczenie o dobrej wierze. */
export class ZgloszenieNaduzyciaDto {
  @IsIn(KATEGORIE_NADUZYC)
  category!: KategoriaNaduzycia;

  @IsString() @MinLength(8) @MaxLength(2048)
  url!: string;

  @IsString() @MinLength(20, { message: 'Opisz, co jest nie tak (min. 20 znaków).' }) @MaxLength(8000)
  description!: string;

  @IsOptional() @IsString() @MaxLength(120)
  reporterName?: string;

  @IsEmail() @MaxLength(254)
  reporterEmail!: string;

  @IsBoolean()
  @Equals(true, { message: 'Potwierdź, że zgłoszenie składasz w dobrej wierze.' })
  goodFaith!: boolean;

  /** Pułapka na boty — prawdziwy formularz zostawia puste. */
  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

export const DECYZJE = ['IN_REVIEW', 'ACTION_TAKEN', 'REJECTED'] as const;

export class DecyzjaNaduzyciaDto {
  @IsIn(DECYZJE)
  status!: (typeof DECYZJE)[number];

  /** Uzasadnienie — trafia do zgłaszającego, a przy ACTION_TAKEN także do klienta (DSA art. 17). */
  @IsOptional() @IsString() @MaxLength(8000)
  decision?: string;

  @IsOptional() @IsBoolean()
  notifyCustomer?: boolean;
}
