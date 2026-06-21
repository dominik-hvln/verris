import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsIn,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
} from 'class-validator';
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

  @IsOptional()
  @IsString()
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

  @IsOptional()
  @IsString()
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
