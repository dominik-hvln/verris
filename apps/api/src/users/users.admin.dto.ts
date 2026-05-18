import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Body for `POST /admin/users/:id/diagnostics/dns-tls` (Sprint 3 / R-02). */
export class DnsTlsDiagnosticDto {
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  /** Główna domena konta DirectAdmin (musi należeć do użytkownika). */
  @IsOptional()
  @IsString()
  @MaxLength(253)
  domain?: string;
}

/** Sprint 4 / R-04 — `PATCH /admin/users/:id/operational` */
export class AdminCustomerOperationalDto {
  @IsOptional()
  @IsBoolean()
  loginBlocked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  loginBlockedReason?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16000)
  adminInternalNote?: string | null;
}

/** Sprint 4 / R-04 — `POST /admin/users/:id/email` */
export class AdminChangeCustomerEmailDto {
  @IsEmail()
  @MaxLength(320)
  newEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Sprint 4 / A-10 — `POST /admin/users/:id/grafana-access` */
export class AdminSetGrafanaAccessDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/** Sprint 4 / R-04 — `POST /admin/users/:id/reset-password` */
export class AdminResetCustomerPasswordDto {
  @IsOptional()
  @IsBoolean()
  notifyUser?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
