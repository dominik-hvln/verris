import { IsIn, IsString, MaxLength } from 'class-validator';

/** POST /kreator/strony/:id/cms/wordpress – domena opublikowanej strony; tryb: instalacja podglądu albo zamiana. */
export class PrzejscieWordpressDto {
  @IsString()
  @MaxLength(253, { message: 'Nieprawidłowa domena.' })
  domena!: string;

  @IsIn(['podglad', 'zamiana'], { message: 'Nieznany krok przejścia na WordPressa.' })
  tryb!: 'podglad' | 'zamiana';
}
