import { CustomerPermission } from '@verris/database';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class InviteSubaccountDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(12)
  @IsEnum(CustomerPermission, { each: true })
  permissions!: CustomerPermission[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** PB-20 — wybrane usługi (id subskrypcji); brak / pusta lista = całe konto. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

export class UpdateSubaccountDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(12)
  @IsEnum(CustomerPermission, { each: true })
  permissions!: CustomerPermission[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** PB-20 — wybrane usługi (id subskrypcji); brak / pusta lista = całe konto. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  serviceIds?: string[];
}

export class AcceptSubaccountInviteDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  /** P3-10 — zgody na ekranie aktywacji (jak przy rejestracji, RegisterDto), nie w oknie po pierwszym logowaniu. */
  @IsBoolean()
  @Equals(true, { message: 'Musisz zaakceptować regulamin świadczenia usług.' })
  acceptTerms!: boolean;

  @IsBoolean()
  @Equals(true, { message: 'Musisz zaakceptować politykę prywatności.' })
  acceptPrivacy!: boolean;
}

export class AcceptExistingInviteDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
