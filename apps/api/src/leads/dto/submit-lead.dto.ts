import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class SubmitLeadDto {
  @IsIn(['MIGRATION', 'CONTACT'])
  kind!: 'MIGRATION' | 'CONTACT';

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  /** Treść zapytania (formularz kontaktowy). */
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  /** Źródło zdarzenia (migration_plan / contact_form) — spójne z pomiarem. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  /** Zgoda marketingowa (wymagana dla MIGRATION). */
  @IsOptional()
  @IsBoolean()
  marketingConsent?: boolean;

  /** Treść klauzuli zgody wyświetlonej użytkownikowi (dowód RODO). */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  consentText?: string;

  /** Adres strony, z której wysłano (do audytu). */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  page?: string;
}
