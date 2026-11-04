import { phpCronCommand } from './CronPhpHelper';

/** L-05 + decyzja 24 — polecenie crona: krótka nazwa PHP wybranej wersji (/usr/local/bin/phpXY), ścieżka od $HOME. */
describe('phpCronCommand', () => {
  it('buduje polecenie z wersji, domeny i pliku', () => {
    expect(phpCronCommand('8.2', 'sklep.pl', '/wp-cron.php')).toBe('/usr/local/bin/php82 -q $HOME/domains/sklep.pl/public_html/wp-cron.php');
    expect(phpCronCommand('7.4', 'a.pl', 'bin/zadanie.php')).toBe('/usr/local/bin/php74 -q $HOME/domains/a.pl/public_html/bin/zadanie.php');
    expect(phpCronCommand('8.10', 'a.pl', 'x.php')).toBe('/usr/local/bin/php810 -q $HOME/domains/a.pl/public_html/x.php');
  });
});
