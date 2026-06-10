import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class InstallWordpressDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  siteTitle!: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9_.@-]{3,60}$/, {
    message: 'Login administratora: 3-60 znaków (litery, cyfry, . _ - @).',
  })
  adminUser!: string;

  @IsEmail()
  adminEmail!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}_[A-Z]{2}$/, { message: 'Locale w formacie np. pl_PL.' })
  locale?: string;
}
