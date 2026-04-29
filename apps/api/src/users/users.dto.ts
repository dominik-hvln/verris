import { IsString, IsOptional, MinLength, MaxLength, IsIn, IsInt, Min, Max } from 'class-validator';

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

  @IsString()
  @MinLength(8, { message: 'Nowe hasło musi mieć minimum 8 znaków' })
  newPassword: string;
}

export class RedeemEcoPointsDto {
  @IsInt()
  @Min(100)
  @Max(5_000)
  points!: number;
}
