import { EVENT_LABEL, EVENT_WARN, serviceEventLabel } from './service-events';

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

  it('nieznane zdarzenie → zdanie z nazwy technicznej, nie pusty string', () => {
    expect(serviceEventLabel('SOMETHING_NEW_HAPPENED')).toBe('Something new happened');
  });

  it('każde zdarzenie ostrzegawcze ma polską etykietę', () => {
    for (const type of EVENT_WARN) expect(EVENT_LABEL[type]).toBeTruthy();
  });
});
