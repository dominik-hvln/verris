import { phpCronCommand } from './CronPhpHelper';

/** L-05 — polecenie crona: binarka CustomBuild wybranej wersji, ścieżka od $HOME. */
describe('phpCronCommand', () => {
  it('buduje polecenie z wersji, domeny i pliku', () => {
    expect(phpCronCommand('8.2', 'sklep.pl', '/wp-cron.php')).toBe('/opt/alt/php82/usr/bin/php -q $HOME/domains/sklep.pl/public_html/wp-cron.php');
    expect(phpCronCommand('7.4', 'a.pl', 'bin/zadanie.php')).toBe('/opt/alt/php74/usr/bin/php -q $HOME/domains/a.pl/public_html/bin/zadanie.php');
  });
});
