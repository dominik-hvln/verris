import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Na jakiej podstawie obsługa uznała nabywcę spoza UE (np. „rejestr firm CH, UID CHE-…, potwierdzone przez księgową 09.10”). */
export class ZweryfikujVatDto {
  @IsString()
  @MinLength(10, { message: 'Podstawa weryfikacji: co najmniej 10 znaków (dokument, rejestr, kto potwierdził).' })
  @MaxLength(500)
  podstawa!: string;
}

export class CofnijWeryfikacjeVatDto {
  @IsString()
  @MinLength(5, { message: 'Powód: co najmniej 5 znaków.' })
  @MaxLength(500)
  powod!: string;
}

export class ZmienDaneVatDto {
  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'Kraj: dwuliterowy kod ISO (np. PL, DE).' })
  country?: string;

  // Jak UpdateProfileDto.nip — NIP albo numer VAT-UE.
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9 .-]*$/, { message: 'NIP / numer VAT-UE: tylko litery, cyfry, spacje, kropki i myślniki.' })
  nip?: string;

  @IsString()
  @MinLength(5, { message: 'Powód zmiany: co najmniej 5 znaków (np. numer zgłoszenia).' })
  @MaxLength(500)
  powod!: string;
}
