import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Czesciowy } from '../common/validation/czesciowy.js';

/** Role i operatorzy obsługi (panel admina). Nazwy, e-mail i uprawnienia dalej czyści serwis. */
export class RolaObslugiDto {
  @IsString() @MaxLength(80) name!: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsArray() @ArrayMaxSize(200) @IsString({ each: true }) @MaxLength(64, { each: true }) permissions!: string[];
}

export class ZmianaRoliObslugiDto extends Czesciowy(RolaObslugiDto) {}

export class NowyOperatorDto {
  @IsString() @MaxLength(254) email!: string;
  @IsOptional() @IsString() @MaxLength(80) firstName?: string;
  @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @IsOptional() @IsString() @MaxLength(64) roleId?: string | null;
  /** PB-47 — kilka ról od razu (pierwszeństwo przed roleId). */
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(64, { each: true }) roleIds?: string[];
}

export class PrzypisanieRoliDto {
  /** null = bez roli. */
  @IsOptional() @IsString() @MaxLength(64) roleId!: string | null;
}

export class AktywnoscOperatoraDto {
  @IsBoolean() active!: boolean;
}

/** PB-47 — pełna lista ról operatora (pusta = brak ról, brak dostępu). */
export class RoleOperatoraDto {
  @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(64, { each: true }) roleIds!: string[];
}

/** PB-47 — klon roli jako własnej; bez nazwy → „<nazwa> (kopia)”. */
export class KlonRoliDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
