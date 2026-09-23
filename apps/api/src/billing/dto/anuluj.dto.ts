import { IsString, MaxLength, MinLength } from 'class-validator';

/** M-08 — anulowanie nieopłaconego dokumentu. Powód trafia do audytu. */
export class AnulujDokumentDto {
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  powod!: string;
}
