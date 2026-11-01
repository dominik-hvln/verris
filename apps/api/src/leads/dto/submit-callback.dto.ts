import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Pory dnia do wyboru w pasie „Wolisz porozmawiać?” (rano / w południe / po 14:00). */
export const PORY_ODDZWONIENIA = ['rano', 'poludnie', 'popoludnie'] as const;
export type PoraOddzwonienia = (typeof PORY_ODDZWONIENIA)[number];

/** Numer polski albo międzynarodowy: opcjonalny „+” na początku, cyfry ze spacjami lub myślnikami, 9–15 cyfr. */
export const WZOR_TELEFONU = /^\+?(?:\d[\s-]?){8,14}\d$/;

/** 1.11 — prośba o telefon zwrotny z verris.pl. Bez e-maila: oddzwaniamy na podany numer. */
export class SubmitCallbackDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(32)
  @Matches(WZOR_TELEFONU, { message: 'Podaj numer telefonu (9–15 cyfr).' })
  phone!: string;

  @IsIn(PORY_ODDZWONIENIA)
  preferredTime!: PoraOddzwonienia;

  /** Klauzula wyświetlona przy formularzu („Numer wykorzystamy tylko do tej rozmowy…”) — dowód informacji RODO. */
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  consentText!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  page?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captchaToken?: string;
}
