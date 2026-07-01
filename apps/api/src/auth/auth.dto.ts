import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { IsStrongPassword } from './password-policy.validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MaxLength(72)
  @IsStrongPassword()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  /** Kod polecenia (np. EKO-AB12CD34) — Etap G. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  ref?: string;

  /** RSL — kod resellera; klient zostaje powiązany z resellerem (white-label). */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reseller?: string;

  /**
   * RODO Sprint 1 / L-03 — wymagane zgody przy rejestracji.
   *
   * `acceptTerms` i `acceptPrivacy` MUSZĄ być `true`. `Equals(true)` w
   * class-validator wymusza zarówno `boolean` jak i konkretną wartość, więc
   * front-end nie może puścić `false` ani `undefined`.
   */
  @IsBoolean()
  @Equals(true, { message: 'Musisz zaakceptować regulamin świadczenia usług.' })
  acceptTerms!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'Musisz zaakceptować politykę prywatności.' })
  acceptPrivacy!: boolean;

  /** Opcjonalny opt-in marketingowy (RODO art. 6(1)(a) — zgoda). */
  @IsOptional()
  @IsBoolean()
  acceptMarketing?: boolean;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class VerifyTwoFactorDto {
  @IsString()
  @IsNotEmpty()
  challengeToken!: string;

  @IsString()
  @Length(6, 32)
  code!: string;
}

export class ConfirmTwoFactorDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class DisableTwoFactorDto {
  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  code?: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @MaxLength(72)
  @IsStrongPassword()
  newPassword!: string;
}

export class EmailVerificationConfirmDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

/** SEC-9 — żądanie zmiany adresu e-mail (wymaga potwierdzenia hasłem). */
export class RequestEmailChangeDto {
  @IsEmail()
  newEmail!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class ConfirmEmailChangeDto {
  @IsString()
  @IsNotEmpty()
  token!: string;
}

export class EmailVerificationRequestDto {
  @IsEmail()
  email!: string;
}

/** #30 — break-glass login for privileged accounts (password + TOTP + code). */
export class BreakGlassLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;

  /** TOTP or 2FA recovery code. */
  @IsString()
  @Length(6, 32)
  code!: string;

  /** Single-use break-glass code (xxxxx-xxxxx). */
  @IsString()
  @Length(8, 32)
  breakGlassCode!: string;
}

/** #30 — re-auth before (re)generating break-glass codes. */
export class RegenerateBreakGlassDto {
  @IsString()
  @IsNotEmpty()
  password!: string;

  @IsString()
  @Length(6, 32)
  code!: string;
}
