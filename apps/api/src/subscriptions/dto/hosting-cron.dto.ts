import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * L-03 / X-09 — zadanie cron od klienta idzie prosto do DirectAdmina (CMD_API_CRON),
 * który zapisuje je do crontaba konta. Do 2026-09-23 body było interfejsem, czyli
 * bez żadnej walidacji: znak nowej linii w komendzie albo w polu harmonogramu
 * dopisywał do crontaba dodatkowy wiersz.
 */
const POLE = /^[0-9*/,-]{1,64}$/;
const KOMUNIKAT_POLA = 'Pole harmonogramu może zawierać tylko cyfry i znaki * / , -';

export class ZadanieCronDto {
  @Matches(POLE, { message: KOMUNIKAT_POLA }) minute!: string;
  @Matches(POLE, { message: KOMUNIKAT_POLA }) hour!: string;
  @Matches(POLE, { message: KOMUNIKAT_POLA }) dayOfMonth!: string;
  @Matches(POLE, { message: KOMUNIKAT_POLA }) month!: string;
  @Matches(POLE, { message: KOMUNIKAT_POLA }) dayOfWeek!: string;

  /** Jedna linia — bez znaków sterujących (nowa linia = drugi wpis w crontabie). */
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  @Matches(/^[^\x00-\x1f\x7f]+$/, { message: 'Komenda nie może zawierać znaków nowej linii ani innych znaków sterujących.' })
  command!: string;
}
