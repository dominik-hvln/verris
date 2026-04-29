import {
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
