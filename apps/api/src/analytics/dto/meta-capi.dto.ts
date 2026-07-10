import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Payload z panelu (server action) do wysyłki Purchase przez Conversions API. */
export class MetaCapiPurchaseDto {
  /** MUSI być identyczny z `event_id` Pixela w przeglądarce (dedup): `purchase-<transactionId>`. */
  @IsString()
  @MaxLength(200)
  eventId!: string;

  @IsNumber()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contentName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  eventSourceUrl?: string;

  /** Cookie `_fbp` (odczytane po stronie panelu). Podnosi EMQ. */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  fbp?: string;

  /** Cookie `_fbc` (odczytane po stronie panelu). Podnosi EMQ. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  fbc?: string;

  /** IP użytkownika (forwardowane przez panel z x-forwarded-for). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientIp?: string;

  /** User-Agent użytkownika (forwardowany przez panel). */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  userAgent?: string;
}
