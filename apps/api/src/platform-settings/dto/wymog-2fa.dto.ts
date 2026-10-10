import { IsBoolean } from 'class-validator';

/** D10 — przełącznik „wymuś 2FA dla zespołu”. */
export class UstawWymog2faDto {
  @IsBoolean()
  wlaczony!: boolean;
}
