import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, IsBoolean } from 'class-validator';
import { IsStrongPassword } from '../auth/password-policy.validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  companyName?: string;

  // M-09 — NIP albo numer VAT-UE (z prefiksem kraju); sprawdzany w VIES przy doładowaniu.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9 .-]*$/, { message: 'NIP / numer VAT-UE: tylko litery, cyfry, spacje, kropki i myślniki.' })
  nip?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  // M-09 — kod kraju ISO (PL, DE…): od niego zależy stawka VAT na dokumentach.
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Kraj: dwuliterowy kod ISO (np. PL, DE).' })
  country?: string;

  @IsOptional()
  @IsIn(['pl', 'en'])
  locale?: string;

  /** Dokładnie 4 href z katalogu skrótów panelu klienta. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @IsString({ each: true })
  sidebarQuickLinks?: string[];

  /** PB-16 — widok panelu (Prosty/Pełny) zapamiętany per użytkownik. */
  @IsOptional()
  @IsIn(['simple', 'full'])
  panelViewMode?: 'simple' | 'full';

  /** PB-16 — motyw treści panelu per użytkownik. */
  @IsOptional()
  @IsIn(['dark', 'light'])
  panelTheme?: 'dark' | 'light';

  /** PROD-02 — baner „Pierwsze kroki” schowany (true) albo przywrócony (false). */
  @IsOptional()
  @IsBoolean()
  onboardingHidden?: boolean;
}

export class ApplyReferralCodeDto {
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  code!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Aktualne hasło jest wymagane' })
  currentPassword: string;

  // SEC-5 — ujednolicona polityka haseł (≥10 znaków, 3/4 klasy, blokada
  // popularnych) — tak samo jak rejestracja i reset hasła.
  @IsString()
  @MaxLength(72)
  @IsStrongPassword()
  newPassword: string;
}

export class RedeemEcoPointsDto {
  @IsInt()
  @Min(100)
  @Max(5_000)
  points!: number;
}
