import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Dane sprzedawcy (Verris) na fakturach — edytowane w panelu admina. */
export class UpdateSellerCompanyDto {
  @IsString() @MinLength(2) @MaxLength(200)
  name!: string;

  @IsOptional() @IsString() @MaxLength(20)
  nip?: string;

  @IsOptional() @IsString() @MaxLength(20)
  regon?: string;

  @IsOptional() @IsString() @MaxLength(20)
  krs?: string;

  @IsOptional() @IsString() @MaxLength(200)
  address?: string;

  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @IsOptional() @IsString() @MaxLength(10)
  postalCode?: string;

  @IsOptional() @IsString() @MaxLength(2)
  country?: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(40)
  bankAccount?: string;
}

/** Konfiguracja KSeF — token i klucz publiczny przekazywane tylko przy zmianie. */
export class UpdateKsefSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsIn(['test', 'prod'])
  env!: 'test' | 'prod';

  @IsOptional() @IsString() @MaxLength(20)
  nip?: string;

  @IsOptional() @IsString() @MaxLength(200)
  token?: string;

  @IsOptional() @IsString() @MaxLength(8000)
  publicKeyPem?: string;
}
