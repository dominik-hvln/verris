import { hostBazyDlaFormularza, parsujKonfiguracje, plikDoOdczytu } from './migracja-konfiguracja-cms.js';

/** Podgląd katalogów migracji (14.10): dane bazy z pliku konfiguracyjnego CMS-a podstawiane w formularzu. */
describe('dane bazy z pliku konfiguracyjnego CMS-a', () => {
  it('WordPress: define(...), host z portem, wyłączone linie i komentarze pomijane', () => {
    const wp = `<?php
// define('DB_NAME', 'stara');
/* define('DB_USER', 'stary'); */
define( 'DB_NAME', 'sklep_wp' );
define('DB_USER', "sklep_user");
define('DB_PASSWORD', 'p\\'a"s$s');
define('DB_HOST', 'localhost:3307');
$table_prefix = 'wp_';`;
    expect(parsujKonfiguracje('wordpress', wp)).toEqual({ host: 'localhost', port: 3307, nazwa: 'sklep_wp', uzytkownik: 'sklep_user', haslo: `p'a"s$s` });
  });

  it('PrestaShop 1.7, 1.6, Magento, Drupal, Joomla', () => {
    expect(
      parsujKonfiguracje('prestashop', `<?php return array('parameters' => array('database_host' => '127.0.0.1', 'database_port' => '3306', 'database_name' => 'ps', 'database_user' => 'psu', 'database_password' => 'x'));`),
    ).toEqual({ host: '127.0.0.1', port: 3306, nazwa: 'ps', uzytkownik: 'psu', haslo: 'x' });
    expect(
      parsujKonfiguracje('prestashop16', `<?php define('_DB_SERVER_', 'db.example.pl'); define('_DB_NAME_', 'ps16'); define('_DB_USER_', 'u16'); define('_DB_PASSWD_', 'h');`),
    ).toEqual({ host: 'db.example.pl', port: null, nazwa: 'ps16', uzytkownik: 'u16', haslo: 'h' });
    expect(
      parsujKonfiguracje('magento', `<?php return ['cache' => ['frontend' => ['host' => 'redis']], 'db' => ['connection' => ['default' => ['host' => 'localhost', 'dbname' => 'm2', 'username' => 'mu', 'password' => 'mp']]]];`),
    ).toEqual({ host: 'localhost', port: null, nazwa: 'm2', uzytkownik: 'mu', haslo: 'mp' });
    expect(
      parsujKonfiguracje('drupal', `<?php\n# $databases['default']['default'] = ['database' => 'stara'];\n$databases['default']['default'] = array ('database' => 'd10', 'username' => 'du', 'password' => 'dp', 'host' => 'localhost', 'port' => '3306');`),
    ).toEqual({ host: 'localhost', port: 3306, nazwa: 'd10', uzytkownik: 'du', haslo: 'dp' });
    expect(
      parsujKonfiguracje('joomla', `<?php class JConfig { public $host = 'localhost'; public $user = 'ju'; public $password = 'jp'; public $db = 'joomla'; }`),
    ).toEqual({ host: 'localhost', port: null, nazwa: 'joomla', uzytkownik: 'ju', haslo: 'jp' });
  });

  it('brak nazwy bazy albo użytkownika → nic (nie zgadujemy)', () => {
    expect(parsujKonfiguracje('wordpress', `<?php define('DB_HOST', 'localhost');`)).toBeNull();
  });

  it('który plik czytać — po zawartości katalogu strony', () => {
    expect(plikDoOdczytu({ pliki: ['index.php', 'wp-config.php'], katalogi: ['wp-content'] })?.cms).toBe('wordpress');
    expect(plikDoOdczytu({ pliki: ['index.php'], katalogi: ['app', 'modules', 'themes', 'classes'] })?.plik).toBe('app/config/parameters.php');
    expect(plikDoOdczytu({ pliki: ['configuration.php'], katalogi: ['administrator'] })?.cms).toBe('joomla');
    expect(plikDoOdczytu({ pliki: ['index.html'], katalogi: ['img'] })).toBeNull();
  });

  it('„localhost” w pliku = serwer starego dostawcy (host podany do plików)', () => {
    expect(hostBazyDlaFormularza('localhost', 'ftp.stary.pl')).toBe('ftp.stary.pl');
    expect(hostBazyDlaFormularza('mysql5.stary.pl', 'ftp.stary.pl')).toBe('mysql5.stary.pl');
  });
});
