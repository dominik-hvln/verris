import { CustomerPermission } from '@verris/database';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
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
}

export class AcceptExistingInviteDto {
  @IsString()
  @MinLength(20)
  token!: string;
}
