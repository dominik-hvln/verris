import { readFileSync } from 'fs';
import { join } from 'path';
import { ProvisioningActions } from '../common/audit/audit.actions';

/**
 * X-32 — alarm kazał posprzątać kolejkę, a nie było czym sprzątać.
 *
 * JAK TO WYSZŁO. `X-30` naprawiło alerting, `VerrisProvisioningQueueFailed`
 * zapalił się z prawdziwego powodu i wskazał cztery martwe joby (`Z-18`).
 * Naturalny następny ruch — usunąć je — okazał się niewykonalny: panel operatora
 * ma przy nich WYŁĄCZNIE przycisk „Retry", a kontroler administracyjny dwa
 * endpointy: listowanie i ponowienie.
 *
 * Retry nic tu nie daje. Węzła nie ma, więc job padnie ponownie, podbije licznik
 * prób i dołoży kolejne wpisy do audytu — cztery martwe joby zamieniają się
 * w cztery martwe joby z dłuższą historią.
 *
 * Zostawało grzebanie w Redisie ręcznie, a to jest dokładnie ta klasa operacji,
 * przeciwko której powstał cały dzisiejszy dzień: stan produkcyjny dotyczący
 * subskrypcji klientów, zmieniony BEZ ŚLADU W AUDYCIE. Za trzy miesiące nikt nie
 * odtworzy, co i dlaczego zniknęło.
 *
 * TRZY REGUŁY, KTÓRYCH PILNUJE TEN STRAŻNIK
 * ─────────────────────────────────────────
 * 1. ODRZUCIĆ MOŻNA TYLKO JOB W STANIE `failed`. Usunięcie joba aktywnego albo
 *    czekającego osierociłoby provisioning w trakcie — konto na węźle mogłoby
 *    powstać, a system przestałby o nim wiedzieć.
 * 2. POWÓD JEST WYMAGANY, tak samo jak przy retry. Operacja bez powodu to
 *    operacja, której za pół roku nikt nie wyjaśni.
 * 3. AUDYT ZAPAMIĘTUJE, CO ZNIKNĘŁO — subskrypcję, joba, liczbę prób i ostatni
 *    błąd. Po `Z-18` ten błąd niesie wreszcie prawdziwą przyczynę, więc wpis
 *    w audycie jest wart tyle, ile w nim stoi.
 *
 * CZEGO ODRZUCENIE NIE ROBI. Nie dotyka subskrypcji. Usuwa wpis z kolejki i tyle.
 * To jest świadome: sprzątanie kolejki i decyzja o losie zamówienia to dwie różne
 * sprawy i nie chcę, żeby jeden przycisk robił obie. Panel musi to powiedzieć
 * wprost, bo operator ma prawo założyć inaczej.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const USLUGA = join(
  KORZEN,
  'apps',
  'api',
  'src',
  'subscriptions',
  'provisioning-queue.service.ts',
);
const KONTROLER = join(
  KORZEN,
  'apps',
  'api',
  'src',
  'subscriptions',
  'provisioning-queue.admin.controller.ts',
);
const PANEL = join(
  KORZEN,
  'apps',
  'admin-panel',
  'src',
  'app',
  '(dashboard)',
  'provisioning-queue',
);

/** Treść bez komentarzy — po raz czternasty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

describe('X-32 — martwy job da się odrzucić, ale tylko ze śladem', () => {
  const usluga = kod(USLUGA);
  const kontroler = kod(KONTROLER);

  it('strażnik czyta właściwe pliki', () => {
    expect(usluga).toContain('retryJob');
    expect(kontroler).toContain('admin/provisioning-queue');
  });

  it('istnieje akcja audytu dla odrzucenia', () => {
    // Bez własnej akcji odrzucenie wtopiłoby się w retry i w raportach
    // wyglądałoby jak ponowienie.
    expect(ProvisioningActions).toHaveProperty('PROVISIONING_JOB_DISCARDED_BY_ADMIN');
  });

  it('usługa ma metodę odrzucenia', () => {
    expect(usluga).toContain('odrzucJob');
  });

  it('odrzucić można TYLKO joba w stanie failed', () => {
    // Najważniejsza asercja w tym pliku. Usunięcie joba aktywnego osierociłoby
    // provisioning w trakcie: konto na węźle mogłoby powstać, a system
    // przestałby o nim wiedzieć.
    const od = usluga.indexOf('async odrzucJob');
    expect(od).toBeGreaterThan(-1);
    const metoda = usluga.slice(od, usluga.indexOf('\n  async ', od + 10));
    expect(metoda).toContain('getState');
    expect(metoda).toContain("'failed'");
  });

  it('odrzucenie zapisuje ślad w audycie razem z tym, co zniknęło', () => {
    const od = usluga.indexOf('async odrzucJob');
    const metoda = usluga.slice(od, usluga.indexOf('\n  async ', od + 10));
    expect(metoda).toContain('PROVISIONING_JOB_DISCARDED_BY_ADMIN');
    expect(metoda).toContain('subscriptionId');
    expect(metoda).toContain('reason');
    // Ostatni błąd joba — po Z-18 niesie prawdziwą przyczynę, więc wpis
    // w audycie ma realną wartość dowodową.
    expect(metoda).toMatch(/failedReason/);
    expect(metoda).toMatch(/attemptsMade/);
  });

  it('usunięcie idzie PO zapisaniu tego, co usuwamy', () => {
    // Odwrotna kolejność gubiłaby dane w chwili, w której są potrzebne:
    // po `job.remove()` nie ma już czego odczytać.
    const od = usluga.indexOf('async odrzucJob');
    const metoda = usluga.slice(od, usluga.indexOf('\n  async ', od + 10));
    const odczyt = metoda.indexOf('failedReason');
    const usuniecie = metoda.indexOf('.remove()');
    expect(odczyt).toBeGreaterThan(-1);
    expect(usuniecie).toBeGreaterThan(odczyt);
  });

  it('kontroler wymaga powodu, tak samo jak przy retry', () => {
    const od = kontroler.indexOf('odrzuc');
    expect(od).toBeGreaterThan(-1);
    const fragment = kontroler.slice(od);
    expect(fragment).toContain('reason');
    expect(fragment).toContain('BadRequestException');
  });

  it('endpoint jest za tymi samymi strażnikami co reszta kolejki', () => {
    // Uprawnienie PROVISIONING_MANAGE i role ADMIN/STAFF stoją na klasie —
    // asercja pilnuje, żeby nikt nie wystawił odrzucania osobnym, luźniejszym
    // kontrolerem.
    expect(kontroler).toContain("@StaffPerm('PROVISIONING_MANAGE')");
    expect(kontroler).toContain('@Roles(Role.ADMIN, Role.STAFF)');
    expect(kontroler.indexOf('@StaffPerm')).toBeLessThan(kontroler.indexOf('odrzuc'));
  });
});

describe('X-32 — panel mówi, czego ta operacja NIE robi', () => {
  // Pliki czytane LENIWIE, wewnątrz asercji. Odczyt na poziomie `describe`
  // wywalałby cały plik testowy, zanim cokolwiek się policzy — a wtedy nie
  // wiadomo, ILE asercji czerwieni się na starym kodzie, tylko że „nie
  // skompilowało się". To rozróżnienie ma w tym projekcie znaczenie.
  const akcje = () => kod(join(PANEL, 'actions.ts'));
  const przycisk = () => kod(join(PANEL, 'odrzuc-button.tsx'));
  const strona = () => kod(join(PANEL, 'page.tsx'));

  it('strażnik czyta właściwe pliki', () => {
    expect(akcje()).toContain('retryProvisioningJob');
    expect(strona()).toContain('RetryButton');
  });

  it('jest akcja serwerowa i przycisk', () => {
    expect(akcje()).toContain('odrzucProvisioningJob');
    expect(przycisk()).toContain('OdrzucButton');
    expect(strona()).toContain('OdrzucButton');
  });

  it('przycisk wymaga powodu, zanim cokolwiek wyśle', () => {
    expect(przycisk()).toContain('reason');
    expect(przycisk()).toMatch(/reason\.trim\(\)\.length\s*[<>]=?\s*\d/);
  });

  it('przycisk mówi wprost, że subskrypcja zostaje nietknięta', () => {
    // Operator ma prawo założyć, że „odrzuć" anuluje zamówienie. Nie anuluje —
    // i to musi być napisane tam, gdzie się klika, a nie tylko w dokumentacji.
    expect(przycisk()).toMatch(/subskrypcj/i);
  });

  it('odrzucanie pokazuje się tylko przy jobach, które padły', () => {
    // Ten sam warunek co przy retry: `row.failedReason`. Asercja nie mierzy
    // odległości w znakach — komentarz albo zmiana układu przesunęłyby ją bez
    // powodu, a wtedy „naprawiałbym" test zamiast kodu. Sprawdzam relację:
    // między warunkiem a przyciskiem nie kończy się gałąź prawdziwa.
    const tresc = strona();
    // `<OdrzucButton`, nie samo `OdrzucButton` — inaczej trafiamy w import
    // na górze pliku, czyli w miejsce przed jakimkolwiek warunkiem.
    const uzycie = tresc.indexOf('<OdrzucButton');
    const warunek = tresc.lastIndexOf('row.failedReason ?', uzycie);
    const przyciskIdx = tresc.indexOf('<OdrzucButton', warunek);
    expect(warunek).toBeGreaterThan(-1);
    expect(przyciskIdx).toBeGreaterThan(warunek);
    expect(tresc.slice(warunek, przyciskIdx)).not.toContain(': null');
  });
});
