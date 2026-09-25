import { IsString, Matches } from 'class-validator';

/** D-14 — sufiks bazy PostgreSQL (pełna nazwa: `<login>_<sufiks>`). */
export class BazaPgsqlDto {
  @IsString()
  @Matches(/^[a-z0-9]{1,16}$/, { message: 'Nazwa bazy: 1–16 znaków, małe litery i cyfry.' })
  nazwa!: string;
}
