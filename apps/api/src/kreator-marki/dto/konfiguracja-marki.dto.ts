import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DOSTEPNOSCI_MARKI, MODEL_MARKI_RE, ZAKRESY_MARKI as Z, type DostepnoscMarki } from '../konfiguracja-marki.js';

/**
 * Admin → Kreator marki: PUT /admin/kreator-marki/konfiguracja. Pola pominięte zostają bez zmian (scalanie
 * w scalKonfiguracjeMarki – także w obiektach zagnieżdżonych). Lista kont testowych ma osobne trasy (konto musi istnieć).
 */
const calk = (pole: string, z: { min: number; max: number }) => `${pole}: liczba całkowita od ${z.min} do ${z.max}.`;
const CENA = `Cena brutto: od ${Z.cenaBrutto.min} do ${Z.cenaBrutto.max} zł, najwyżej 2 miejsca po przecinku.`;

export class LimityMarkiDto {
  @IsOptional()
  @IsInt({ message: calk('Marki na koncie', Z.marek) })
  @Min(Z.marek.min, { message: calk('Marki na koncie', Z.marek) })
  @Max(Z.marek.max, { message: calk('Marki na koncie', Z.marek) })
  marek?: number;

  @IsOptional()
  @IsInt({ message: calk('Serie propozycji', Z.seriiMies) })
  @Min(Z.seriiMies.min, { message: calk('Serie propozycji', Z.seriiMies) })
  @Max(Z.seriiMies.max, { message: calk('Serie propozycji', Z.seriiMies) })
  seriiMies?: number;

  @IsOptional()
  @IsInt({ message: calk('Zmiany AI', Z.zmianAiMies) })
  @Min(Z.zmianAiMies.min, { message: calk('Zmiany AI', Z.zmianAiMies) })
  @Max(Z.zmianAiMies.max, { message: calk('Zmiany AI', Z.zmianAiMies) })
  zmianAiMies?: number;
}

export class PakietMarkiDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: CENA })
  @Min(Z.cenaBrutto.min, { message: CENA })
  @Max(Z.cenaBrutto.max, { message: CENA })
  cenaBrutto?: number;

  @IsOptional()
  @IsInt({ message: calk('Serie w Pakiecie', Z.serie) })
  @Min(Z.serie.min, { message: calk('Serie w Pakiecie', Z.serie) })
  @Max(Z.serie.max, { message: calk('Serie w Pakiecie', Z.serie) })
  serie?: number;

  @IsOptional()
  @IsInt({ message: calk('Zmiany AI w Pakiecie', Z.zmianyAi) })
  @Min(Z.zmianyAi.min, { message: calk('Zmiany AI w Pakiecie', Z.zmianyAi) })
  @Max(Z.zmianyAi.max, { message: calk('Zmiany AI w Pakiecie', Z.zmianyAi) })
  zmianyAi?: number;

  @IsOptional()
  @IsInt({ message: calk('Aktualizacje szablonów (mies.)', Z.aktualizacjeSzablonowMies) })
  @Min(Z.aktualizacjeSzablonowMies.min, { message: calk('Aktualizacje szablonów (mies.)', Z.aktualizacjeSzablonowMies) })
  @Max(Z.aktualizacjeSzablonowMies.max, { message: calk('Aktualizacje szablonów (mies.)', Z.aktualizacjeSzablonowMies) })
  aktualizacjeSzablonowMies?: number;
}

export class DrugaMarkaDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: CENA })
  @Min(Z.cenaBrutto.min, { message: CENA })
  @Max(Z.cenaBrutto.max, { message: CENA })
  cenaBrutto?: number;
}

export class KonfiguracjaMarkiDto {
  @IsOptional()
  @IsBoolean()
  wlaczony?: boolean;

  @IsOptional()
  @IsIn([...DOSTEPNOSCI_MARKI], { message: 'Dostępność: lista kont, beta albo wszyscy.' })
  dostepnosc?: DostepnoscMarki;

  @IsOptional()
  @ValidateNested()
  @Type(() => LimityMarkiDto)
  wCenieHostingu?: LimityMarkiDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PakietMarkiDto)
  pakiet?: PakietMarkiDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => DrugaMarkaDto)
  drugaMarka?: DrugaMarkaDto;

  @IsOptional()
  @IsBoolean()
  pakietWKreatorzeProRocznym?: boolean;

  @IsOptional()
  @IsBoolean()
  symboleAi?: boolean;

  @IsOptional()
  @Matches(MODEL_MARKI_RE, { message: 'Kreator marki obsługuje tylko modele Anthropic (claude-…).' })
  modelGeneracji?: string;

  @IsOptional()
  @Matches(MODEL_MARKI_RE, { message: 'Kreator marki obsługuje tylko modele Anthropic (claude-…).' })
  modelZmian?: string;

  @IsOptional()
  @IsInt({ message: calk('Maks. rozmiar wgrania (MB)', Z.maksRozmiarWgraniaMb) })
  @Min(Z.maksRozmiarWgraniaMb.min, { message: calk('Maks. rozmiar wgrania (MB)', Z.maksRozmiarWgraniaMb) })
  @Max(Z.maksRozmiarWgraniaMb.max, { message: calk('Maks. rozmiar wgrania (MB)', Z.maksRozmiarWgraniaMb) })
  maksRozmiarWgraniaMb?: number;
}
