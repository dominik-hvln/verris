/**
 * Formularz /kontakt (makieta 14.10): temat rozmowy i opcjonalny adres strony. API leadów przyjmuje jedną
 * wiadomość (`message`, maks. 5000 znaków), więc temat i adres idą jako pierwsze linie treści.
 */
export const TEMATY_KONTAKTU: { nazwa: string; podpowiedz: string }[] = [
  { nazwa: 'Hosting', podpowiedz: 'Napisz, jaka to strona (WordPress, sklep, inna) i ile ma mniej więcej odwiedzin.' },
  {
    nazwa: 'Przeniesienie strony',
    podpowiedz: 'Podaj adres strony i obecnego dostawcę. Haseł i dostępów tu nie wpisuj — podasz je bezpiecznie w panelu.',
  },
  { nazwa: 'Domeny', podpowiedz: 'Podaj domenę, o którą pytasz.' },
  { nazwa: 'Współpraca', podpowiedz: 'Agencja, freelancer, partner? Opisz krótko, czym się zajmujesz.' },
];

export function trescKontaktu(temat: string, strona: string, wiadomosc: string): string {
  const naglowek = [`Temat: ${temat}`, ...(strona.trim() ? [`Strona: ${strona.trim()}`] : [])].join('\n');
  return `${naglowek}\n\n${wiadomosc.trim()}`;
}
