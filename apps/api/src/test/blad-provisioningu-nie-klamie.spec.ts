import { readFileSync } from 'fs';
import { join } from 'path';
import {
  categorizeProvisioningError,
  kategoriaBledu,
} from '../subscriptions/provisioning-queue.service';
import { BladEtapuProvisioningu } from '../subscriptions/provisioning-error';

/**
 * Z-18 — poprawna kontrola, którą się okłamuje.
 *
 * CO SIĘ STAŁO. Alerting zaczął działać (X-30) i w ciągu dziesięciu minut
 * pokazał cztery martwe joby provisioningu. W panelu operatora stało przy nich:
 *
 *     DirectAdmin package "starter" is missing on the node and could not be
 *     created automatically. Contact support.
 *
 * W audycie stało co innego:
 *
 *     ensureUserPackage | starter | connect ECONNREFUSED 62.238.0.223:2222
 *
 * Węzeł nie przyjmował połączeń. Z pakietem nie było nic nie tak.
 *
 * MECHANIZM. `provisioning.service.ts` łapie prawdziwy błąd, zapisuje go do
 * audytu — i rzuca dalej STAŁY NAPIS. Prawda zostaje w bazie, w górę idzie
 * zmyślona przyczyna. A wyżej stoi klasyfikator retry, który dostaje właśnie
 * ten wyprany komunikat:
 *
 *     const errCategory = categorizeProvisioningError(msg);
 *     if (!isLastAttempt && errCategory === 'transient') { ...ciche ponowienie... }
 *
 * Klasyfikator jest napisany POPRAWNIE — ma `econnrefused` na liście błędów
 * przejściowych. Tylko nigdy nie zobaczy tego słowa.
 *
 * DLACZEGO TO DOTYKA PIENIĘDZY. Przy prawdziwym kliencie i chwilowym zerwaniu
 * sieci: próba 1 → ECONNREFUSED przebrany za „brak pakietu" → `permanent` →
 * ścieżka twardej porażki odpala się JUŻ PRZY PIERWSZEJ PRÓBIE: subskrypcja na
 * FAILED, ZWROT ŚRODKÓW do portfela, status PENDING_PAYMENT. Potem `throw err`
 * i BullMQ i tak ponawia; próba 2 przechodzi, konto powstaje, a
 * `provisioning.service.ts` ustawia subskrypcję na ACTIVE. Klient ma działający
 * hosting i odzyskane pieniądze. Zwrot jest idempotentny, więc nic go nie cofa.
 *
 * RODZINA. To nie jest „kontrola, która nie kontroluje" (X-14, X-23, H-19).
 * To POPRAWNA KONTROLA, KTÓREJ SIĘ KŁAMIE — nowy wariant tej samej choroby.
 * Blisko jej też do „strażnika, który dopasowuje własną prozę" (dziesiąte
 * wystąpienie w tym projekcie): jeden z trzech komunikatów był ułożony tak, by
 * TRAFIĆ w listę błędów przejściowych („CloudLinux LVE limits could not be
 * applied"). Działał przypadkiem — dopóki ktoś nie poprawił zdania.
 *
 * POPRAWKA. Klasyfikujemy BŁĄD, nie jego prozę: `kategoriaBledu(err)` czyta
 * `przyczyna` z `BladEtapuProvisioningu`, a na napis spada tylko wtedy, gdy nic
 * lepszego nie ma.
 *
 * CZEGO TU NIE MA. Dowodu D3. Węzła obliczeniowego obecnie nie ma wcale
 * (testowy został zdjęty), więc ścieżki provisioningu nie da się dziś przejść
 * na produkcji. Dowód powstanie przy węźle #1 — w planie sprint 8.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const USLUGA = join(KORZEN, 'apps', 'api', 'src', 'subscriptions', 'provisioning.service.ts');
const KOLEJKA = join(
  KORZEN,
  'apps',
  'api',
  'src',
  'subscriptions',
  'provisioning-queue.service.ts',
);

/** Treść bez komentarzy — po raz trzynasty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

/** Prawdziwe treści z produkcji — nie wymyślone na potrzeby testu. */
const PRAWDZIWE_BLEDY_PRZEJSCIOWE = [
  'connect ECONNREFUSED 62.238.0.223:2222',
  'connect ETIMEDOUT 62.238.0.223:2222',
  'socket hang up',
  'fetch failed',
];

describe('Z-18 — klasyfikujemy błąd, nie jego prozę', () => {
  it('strażnik czyta właściwy plik', () => {
    expect(typeof kategoriaBledu).toBe('function');
    expect(typeof categorizeProvisioningError).toBe('function');
  });

  it.each(PRAWDZIWE_BLEDY_PRZEJSCIOWE)(
    'oryginalna treść „%s" jest przejściowa (to działało zawsze)',
    (tresc) => {
      expect(categorizeProvisioningError(tresc)).toBe('transient');
    },
  );

  it.each(PRAWDZIWE_BLEDY_PRZEJSCIOWE)(
    'ta sama treść ZAWINIĘTA w komunikat dla człowieka nadal jest przejściowa: %s',
    (tresc) => {
      // To jest CAŁA pozycja Z-18 w jednym zdaniu. Przed poprawką ten sam błąd
      // po opakowaniu stawał się „permanent" i odpalał zwrot środków.
      const err = new BladEtapuProvisioningu(
        'ensureUserPackage',
        tresc,
        'DirectAdmin package "starter" is missing on the node and could not be created automatically.',
      );
      expect(kategoriaBledu(err)).toBe('transient');
    },
  );

  it('błąd trwały pozostaje trwały', () => {
    const err = new BladEtapuProvisioningu(
      'createAccount',
      'DirectAdmin API Error: Unable to Create User — A valid IP was not provided',
      'Failed to create the hosting account on the selected node.',
    );
    expect(kategoriaBledu(err)).toBe('permanent');
  });

  it('zwykły Error nadal daje się sklasyfikować po treści', () => {
    // Nie każdy błąd przejdzie przez nasze opakowanie — awaria może wyjść
    // z Prismy, z sieci, skądkolwiek. Ścieżka zapasowa musi zostać.
    expect(kategoriaBledu(new Error('connect ECONNREFUSED 10.0.0.1:2222'))).toBe('transient');
    expect(kategoriaBledu('connect ECONNREFUSED 10.0.0.1:2222')).toBe('transient');
    expect(kategoriaBledu(new Error('domain already exists'))).toBe('permanent');
  });

  it('komunikat niesie przyczynę, bo panel czyta failedReason z BullMQ', () => {
    // Kolumna BŁĄD w panelu operatora i pole `failedCategory` biorą się
    // z `job.failedReason`, czyli z `Error.message`. Gdyby przyczyna została
    // tylko we właściwości, panel dalej pokazywałby zmyśloną historię.
    const err = new BladEtapuProvisioningu(
      'ensureUserPackage',
      'connect ECONNREFUSED 62.238.0.223:2222',
      'DirectAdmin package "starter" is missing on the node.',
    );
    expect(err.message).toContain('ECONNREFUSED');
    expect(err.message).toContain('DirectAdmin package');
    expect(categorizeProvisioningError(err.message)).toBe('transient');
  });

  it('etap jest zapamiętany, bo bez niego nie wiadomo, gdzie się urwało', () => {
    const err = new BladEtapuProvisioningu('createAccount', 'cokolwiek', 'komunikat');
    expect(err.etap).toBe('createAccount');
    expect(err.przyczyna).toBe('cokolwiek');
  });
});

describe('Z-18 — żaden etap nie wypiera prawdziwej przyczyny', () => {
  const usluga = kod(USLUGA);
  const kolejka = kod(KOLEJKA);

  it('strażnik czyta właściwe pliki', () => {
    expect(usluga).toContain('ensureUserPackage');
    expect(kolejka).toContain('runJob');
  });

  it('provisioning.service nie rzuca gołego ServiceUnavailableException z bloku catch', () => {
    // Goły wyjątek gubi przyczynę. Każde takie miejsce to potencjalny zwrot
    // środków za usługę, która za chwilę się wykona.
    const bloki = usluga.split('catch (err)').slice(1);
    expect(bloki.length).toBeGreaterThan(0);
    for (const blok of bloki) {
      const doKonca = blok.slice(0, blok.indexOf('\n  }\n') + 1 || undefined);
      if (doKonca.includes('throw new ServiceUnavailableException')) {
        throw new Error(
          'Blok catch rzuca ServiceUnavailableException zamiast BladEtapuProvisioningu — ' +
            'prawdziwa przyczyna zostanie wyprana, a klasyfikator retry dostanie zmyśloną.',
        );
      }
    }
  });

  it('provisioning.service używa BladEtapuProvisioningu', () => {
    expect(usluga).toContain('BladEtapuProvisioningu');
    // Trzy etapy, które wołają DirectAdmina i mogą paść na sieci.
    for (const etap of ['ensureUserPackage', 'createAccount', 'setAccountLimits']) {
      expect(usluga).toContain(`'${etap}'`);
    }
  });

  it('kolejka klasyfikuje OBIEKT błędu, nie napis', () => {
    // Sedno poprawki: `kategoriaBledu(err)` zamiast
    // `categorizeProvisioningError(msg)` na ścieżce decyzji o ponowieniu.
    expect(kolejka).toContain('kategoriaBledu(err)');
    const od = kolejka.indexOf('const errCategory');
    expect(od).toBeGreaterThan(-1);
    expect(kolejka.slice(od, od + 120)).toContain('kategoriaBledu(err)');
  });

  it('audyt zapisuje przyczynę osobno od komunikatu', () => {
    // Żeby przy następnym takim śledztwie nie trzeba było zgadywać, co było
    // naprawdę — tak jak dziś trzeba było zajrzeć do AuditLog.
    //
    // Asercja celowo patrzy na blok catch w `runJob`, a nie na cały plik:
    // słowo „przyczyna" pada też w komentarzu przy `kategoriaBledu`, więc
    // sprawdzanie całego pliku przechodziłoby, nic nie sprawdzając.
    const od = kolejka.indexOf('const errCategory');
    const doKonca = kolejka.slice(od, kolejka.indexOf('private async markQueued', od));
    expect(od).toBeGreaterThan(-1);
    expect(doKonca).toContain('przyczyna');
  });
});
