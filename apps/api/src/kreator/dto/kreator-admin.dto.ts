import { IsEmail, MaxLength } from 'class-validator';

/** Admin → Kreator stron: konto testowe dodawane po adresie e-mail (konto musi istnieć – sprawdza kontroler). */
export class KontoTestoweDto {
  @MaxLength(120, { message: 'Adres e-mail: najwyżej 120 znaków.' })
  @IsEmail({}, { message: 'Podaj poprawny adres e-mail konta klienta.' })
  email!: string;
}
