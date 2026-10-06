import { EVENT_LABEL, EVENT_WARN, powodBlokady, serviceEventLabel, widoczneDlaKlienta } from './service-events';

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
    for (const t of ['MIGRATION_WORKER_JOB_RETRYING', 'MIGRATION_WORKER_JOB_COMPLETED', 'MIGRATION_ATTENTION_NOTIFIED']) {
      expect(widoczneDlaKlienta(t)).toBe(false);
    }
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
