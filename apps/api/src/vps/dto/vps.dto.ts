import {
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Czesciowy } from '../../common/validation/czesciowy.js';

export class OrderVpsDto {
  @IsString()
  @Length(10, 60)
  planId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 60)
  name?: string;

  /** SSH key ids to authorize; when present, no root password is set. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sshKeyIds?: string[];

  /**
   * Oświadczenie konsumenckie: żądanie rozpoczęcia świadczenia przed upływem
   * terminu odstąpienia (art. 15 ust. 3 / 21 ust. 2 upk; Regulamin §4 ust. 4).
   */
  @IsBoolean()
  @Equals(true, {
    message:
      'Wymagane jest oświadczenie o żądaniu rozpoczęcia świadczenia usługi przed upływem terminu odstąpienia od umowy.',
  })
  immediatePerformanceConsent!: boolean;
}

export class AddSshKeyDto {
  @IsString()
  @Length(1, 60)
  name!: string;

  @IsString()
  @Length(20, 8000)
  publicKey!: string;
}

export class VpsPowerDto {
  @IsIn(['on', 'off', 'reboot'])
  action!: 'on' | 'off' | 'reboot';
}

export class CreateVpsPlanDto {
  @IsString() @Length(2, 40)
  slug!: string;

  @IsString() @Length(2, 80)
  name!: string;

  @IsOptional() @IsString() @Length(0, 500)
  description?: string;

  @IsString() @Length(2, 40)
  hetznerServerType!: string;

  @IsOptional() @IsString() @Length(2, 40)
  hetznerImage?: string;

  @IsOptional() @IsString() @Length(2, 20)
  location?: string;

  @IsInt() @Min(1) @Max(128)
  vcpu!: number;

  @IsInt() @Min(1) @Max(1024)
  ramGb!: number;

  @IsInt() @Min(1) @Max(10000)
  diskGb!: number;

  @IsOptional() @IsInt() @Min(0) @Max(1000)
  trafficTb?: number;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(1_000_000)
  priceMonthly!: number;

  @IsOptional() @IsString() @Length(3, 3)
  currency?: string;

  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsInt()
  sortOrder?: number;
}

export class UpdateVpsPlanDto extends Czesciowy(CreateVpsPlanDto) {}

/** Q-08 — nowy snapshot (opis opcjonalny; pusty = data utworzenia). */
export class CreateVpsSnapshotDto {
  @IsOptional() @IsString() @Length(0, 100)
  description?: string;
}

/** Q-08 — reinstalacja systemu: nazwa obrazu z listy GET /vps/:id/images. */
export class VpsRebuildDto {
  @IsString() @Length(1, 80)
  image!: string;
}

/** Q-08 — ustawienia snapshotów (admin): cena K/GB/mies. (pusta = wyłączone) i limit na VPS. */
export class VpsSnapshotSettingsDto {
  @IsOptional() @IsString() @Length(0, 20)
  pricePerGbMonthly?: string | null;

  @IsInt() @Min(1) @Max(20)
  limit!: number;
}
