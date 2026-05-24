import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
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
  @MinLength(8)
  @MaxLength(72)
  newPassword!: string;
}
