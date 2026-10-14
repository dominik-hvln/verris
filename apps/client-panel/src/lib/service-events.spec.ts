import { EVENT_LABEL, EVENT_WARN, powodBlokady, rezygnacjaZaplanowana, terminUslugi, opisTerminu, serviceEventLabel, widoczneDlaKlienta } from './service-events';

/**
 * X-05 — etykiety zdarzeń usługi na osi czasu.
 *
 * CO PILNUJE. Zdarzenie spoza słownika nie może zniknąć ani pokazać się jako
 * pusty wiersz — ma dostać czytelny zapis z nazwy technicznej. A każde
 * zdarzenie ostrzegawcze (płatność nieudana, zawieszenie…) musi mieć polską
 * etykietę, bo to są te wiersze, które klient czyta najuważniej.
 */

describe('X-05 serviceEventLabel', () => {
  it('znane zdarzenie → etykieta ze słownika', () => {
    const [type, label] = Object.entries(EVENT_LABEL)[0]!;
    expect(serviceEventLabel(type)).toBe(label);
  });

  it('nieznane zdarzenie → ogólna polska etykieta, nie angielski kod', () => {
    expect(serviceEventLabel('SOMETHING_NEW_HAPPENED')).toBe('Zmiana w usłudze');
  });

  it('próba bety 06.10: zdarzenia migracji po polsku, kroki wewnętrzne ukryte przed klientem', () => {
    // Oś „Co się działo” d3.hvln.pl pokazywała „Migration bundle completed”, „Migration escalated”, „Migration worker job retrying”.
    const widoczne = ['MIGRATION_BUNDLE_QUEUED', 'MIGRATION_BUNDLE_COMPLETED', 'MIGRATION_BUNDLE_FAILED', 'MIGRATION_ESCALATED', 'MIGRATION_CANCELED', 'AUTOSCALING_ENABLED'];
    for (const t of widoczne) {
      expect(widoczneDlaKlienta(t)).toBe(true);
      expect(EVENT_LABEL[t]).toBeTruthy();
      expect(serviceEventLabel(t)).not.toMatch(/migration|bundle|worker/i);
    }
    for (const t of ['MIGRATION_WORKER_JOB_RETRYING', 'MIGRATION_WORKER_JOB_COMPLETED', 'MIGRATION_ATTENTION_NOTIFIED', 'MIGRATION_SECRETS_EXPIRING']) {
      expect(widoczneDlaKlienta(t)).toBe(false);
    }
  });

  it('weryfikacja 11.10 (D3): działania obsługi na usłudze — „Obsługa Verris …”, bez nazwy panelu serwera i pliku limitu', () => {
    const opisy = [
      serviceEventLabel('MAIL_SENDING_BLOCKED', { source: 'OPERATOR' }),
      serviceEventLabel('MAIL_SENDING_UNBLOCKED', { source: 'OPERATOR' }),
      serviceEventLabel('MAIL_SEND_LIMIT_CHANGED', { source: 'OPERATOR', limit: 300, domyslny: 1000 }),
      serviceEventLabel('MAIL_SEND_LIMIT_CHANGED', { source: 'OPERATOR', limit: null, domyslny: 1000 }),
      serviceEventLabel('ADDON_ADDED', { source: 'OPERATOR', slug: 'priority_support_30d', name: 'Priorytetowe wsparcie (30 dni)', gratis: true }),
    ];
    expect(opisy).toEqual([
      'Obsługa Verris zablokowała wysyłkę poczty z konta',
      'Obsługa Verris przywróciła wysyłkę poczty z konta',
      'Obsługa Verris ustawiła dobowy limit wysyłki na 300 wiadomości',
      'Obsługa Verris przywróciła domyślny dobowy limit wysyłki (1000 wiadomości)',
      'Obsługa Verris dodała dodatek „Priorytetowe wsparcie (30 dni)” (bez opłaty)',
    ]);
    for (const o of opisy) expect(o).not.toMatch(/DirectAdmin|\bDA\b|exim|limit_/i);
    expect(serviceEventLabel('MAIL_SEND_LIMIT_CHANGED', { limit: 1 })).toBe('Obsługa Verris ustawiła dobowy limit wysyłki na 1 wiadomość');
    // Weryfikacja 11.10 (p. 3) — drugie dodanie aktywnego dodatku czasowego to przedłużenie, z nową datą końca.
    expect(serviceEventLabel('ADDON_ADDED', { name: 'Priorytetowe wsparcie (30 dni)', gratis: false, przedluzenie: true, aktywnyDo: '2026-12-10T10:00:00.000Z' })).toBe(
      'Obsługa Verris przedłużyła dodatek „Priorytetowe wsparcie (30 dni)” do 10 grudnia 2026',
    );
    // Szczegóły bez liczby/nazwy (starszy wpis) — ogólna etykieta, nie „undefined”.
    expect(serviceEventLabel('ADDON_ADDED', {})).toBe('Obsługa Verris dodała dodatek');
    expect(EVENT_WARN.has('MAIL_SENDING_BLOCKED')).toBe(true);
  });

  it('każde zdarzenie ostrzegawcze ma polską etykietę', () => {
    for (const type of EVENT_WARN) expect(EVENT_LABEL[type]).toBeTruthy();
  });
});

describe('powodBlokady', () => {
  const ev = (reason: string, createdAt = '2026-09-25T10:00:00Z') => ({ type: 'SUSPENDED', createdAt, details: { reason } });
  it('rozróżnia płatność, partnera i obsługę po ostatnim wstrzymaniu', () => {
    expect(powodBlokady('ACTIVE', [ev('RESELLER')])).toBeNull();
    expect(powodBlokady('PAST_DUE', [])).toBe('platnosc');
    expect(powodBlokady('SUSPENDED', [ev('GRACE_EXPIRED')])).toBe('platnosc');
    expect(powodBlokady('SUSPENDED', [ev('ABUSE')])).toBe('obsluga');
    expect(powodBlokady('SUSPENDED', [ev('GRACE_EXPIRED', '2026-09-01T00:00:00Z'), ev('RESELLER')])).toBe('partner');
    expect(powodBlokady('SUSPENDED', undefined)).toBe('platnosc');
  });
});

/** F3.5 — rezygnacja na koniec okresu ze stanu usługi: po cofnięciu przez obsługę zdarzenie zostaje w historii. */
describe('rezygnacjaZaplanowana', () => {
  const zdarzenie = [{ type: 'CANCEL_SCHEDULED' }];
  it('stan wygrywa z historią: cofnięta rezygnacja (cancelAt null) mimo zdarzenia CANCEL_SCHEDULED', () => {
    expect(rezygnacjaZaplanowana({ status: 'ACTIVE', cancelAt: null, events: zdarzenie })).toBe(false);
    expect(rezygnacjaZaplanowana({ status: 'ACTIVE', cancelAt: '2026-11-20T00:00:00Z', events: [] })).toBe(true);
  });
  it('starsze API bez pola — po zdarzeniu; nieaktywna usługa — nigdy', () => {
    expect(rezygnacjaZaplanowana({ status: 'ACTIVE', events: zdarzenie })).toBe(true);
    expect(rezygnacjaZaplanowana({ status: 'PAST_DUE', cancelAt: '2026-11-20T00:00:00Z', events: zdarzenie })).toBe(false);
  });
});

/** Weryfikacja 11.10 — po rezygnacji nagłówek karty, lista usług i pulpit mówiły „odnawia się 8 lis 2026”. */
describe('terminUslugi / opisTerminu', () => {
  const fmt = (iso: string) => iso.slice(0, 10);
  const baza = { status: 'ACTIVE', currentPeriodEnd: '2026-11-08T10:00:00Z' };
  it('rezygnacja na koniec okresu: „działa do … · nie odnowi się” z datą z cancelAt', () => {
    const s = { ...baza, cancelAt: '2026-11-08T10:00:00Z' };
    expect(terminUslugi(s)).toEqual({ rezygnacja: true, data: '2026-11-08T10:00:00Z' });
    expect(opisTerminu(s, fmt)).toBe('działa do 2026-11-08 · nie odnowi się');
  });
  it('bez rezygnacji: „odnawia się …”; lista bez pola i bez zdarzeń — też', () => {
    expect(opisTerminu({ ...baza, cancelAt: null }, fmt)).toBe('odnawia się 2026-11-08');
    expect(opisTerminu(baza, fmt)).toBe('odnawia się 2026-11-08');
    expect(opisTerminu({ ...baza, currentPeriodEnd: null, cancelAt: null }, fmt)).toBeNull();
  });
  it('zakończona usługa nie ma terminu odnowienia (anulacja od razu ustawia cancelAt = teraz)', () => {
    expect(opisTerminu({ status: 'CANCELED', currentPeriodEnd: '2026-11-08T10:00:00Z', cancelAt: '2026-10-11T10:00:00Z' }, fmt)).toBeNull();
    expect(opisTerminu({ status: 'EXPIRED', currentPeriodEnd: '2026-11-08T10:00:00Z', cancelAt: null }, fmt)).toBeNull();
  });
});
