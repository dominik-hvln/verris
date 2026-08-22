import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { AddonService } from './addon.service';
import { PurchaseAddonDto } from './dto/purchase-addon.dto';

/**
 * Z-06 — klucz idempotencji obciążenia za dodatek.
 *
 * Przed poprawką klucz brzmiał `addon-${userId}-${slug}-${Date.now()}`. Znacznik
 * czasu sprawiał, że każde kliknięcie dawało INNY klucz, więc mechanizm
 * idempotencji w księdze portfela nie miał czego porównywać. Dziesięć kliknięć
 * to było dziesięć obciążeń, dziesięć zgłoszeń do BOK-u i dziesięć wpisów
 * w historii zakupów.
 *
 * Testy pilnują trzech rzeczy naraz, bo poprawka tylko portfela nie wystarczy:
 * pieniądze, skutki uboczne (zgłoszenie, flaga wsparcia) i sam rekord zakupu.
 */
describe('Z-06 — idempotencja zakupu dodatku', () => {
  interface Rekord {
    id: string;
    slug: string;
    name: string;
    status: string;
    ticketId: string | null;
    idempotencyKey: string | null;
  }

  function zbuduj(opcje: { istniejacy?: Rekord; rzucP2002?: boolean } = {}) {
    const zapisane: Rekord[] = opcje.istniejacy ? [opcje.istniejacy] : [];
    const debety: Array<{ idempotencyKey?: string; amount: unknown }> = [];
    const zgloszenia: Array<{ subject: string }> = [];
    let licznik = 0;

    const prisma = {
      purchasedAddon: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
          return zapisane.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null;
        }),
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          if (opcje.rzucP2002 && licznik === 0) {
            licznik += 1;
            // Symulacja wyścigu: rekord powstał „w międzyczasie" z innego żądania.
            zapisane.push({
              id: 'zakup-z-wyscigu',
              slug: data.slug as string,
              name: data.name as string,
              status: data.status as string,
              ticketId: (data.ticketId as string) ?? null,
              idempotencyKey: data.idempotencyKey as string,
            });
            throw Object.assign(new Error('unique violation'), { code: 'P2002' });
          }
          licznik += 1;
          const rekord: Rekord = {
            id: `zakup-${licznik}`,
            slug: data.slug as string,
            name: data.name as string,
            status: data.status as string,
            ticketId: (data.ticketId as string) ?? null,
            idempotencyKey: data.idempotencyKey as string,
          };
          zapisane.push(rekord);
          return rekord;
        }),
      },
      user: { update: jest.fn(async () => ({})) },
    };

    const wallet = {
      debit: jest.fn(async (wejscie: { idempotencyKey?: string; amount: unknown }) => {
        debety.push(wejscie);
        return { id: 'tx-1' };
      }),
    };
    const tickets = {
      create: jest.fn(async (_u: string, dto: { subject: string }) => {
        zgloszenia.push(dto);
        return { id: `zgl-${zgloszenia.length}` };
      }),
    };
    const audit = { record: jest.fn(async () => undefined) };

    const service = new AddonService(
      prisma as never,
      audit as never,
      wallet as never,
      tickets as never,
    );
    return { service, prisma, wallet, tickets, debety, zgloszenia, zapisane };
  }

  describe('kształt klucza', () => {
    it('nie zawiera już znacznika czasu w milisekundach', async () => {
      const { service, debety } = zbuduj();
      await service.purchase('user-1', 'priority_support_30d');
      const klucz = debety[0].idempotencyKey ?? '';
      // Stary format: addon-user-1-priority_support_30d-1787352000000
      expect(klucz).not.toMatch(/\d{13}/);
      expect(klucz).toContain('user-1');
      expect(klucz).toContain('priority_support_30d');
    });

    it('dwa zakupy tego samego dodatku pod rząd dostają TEN SAM klucz', async () => {
      const a = zbuduj();
      await a.service.purchase('user-1', 'dedicated_ip', 'sub-1');
      const pierwszy = a.debety[0].idempotencyKey;

      const b = zbuduj();
      await b.service.purchase('user-1', 'dedicated_ip', 'sub-1');
      expect(b.debety[0].idempotencyKey).toBe(pierwszy);
    });

    it('inna usługa to inny klucz — dwa dedykowane IP dla dwóch usług są legalne', async () => {
      const a = zbuduj();
      await a.service.purchase('user-1', 'dedicated_ip', 'sub-1');
      const b = zbuduj();
      await b.service.purchase('user-1', 'dedicated_ip', 'sub-2');
      expect(b.debety[0].idempotencyKey).not.toBe(a.debety[0].idempotencyKey);
    });

    it('inny użytkownik to inny klucz', async () => {
      const a = zbuduj();
      await a.service.purchase('user-1', 'manual_setup');
      const b = zbuduj();
      await b.service.purchase('user-2', 'manual_setup');
      expect(b.debety[0].idempotencyKey).not.toBe(a.debety[0].idempotencyKey);
    });

    it('klucz od klienta wygrywa z wyliczanym', async () => {
      const { service, debety } = zbuduj();
      await service.purchase('user-1', 'manual_setup', undefined, 'intencja-abc-123');
      expect(debety[0].idempotencyKey).toBe('addon:v1:user-1:intencja-abc-123');
    });
  });

  describe('powtórzony zakup', () => {
    const istniejacy: Rekord = {
      id: 'zakup-istniejacy',
      slug: 'manual_setup',
      name: 'Konfiguracja przez specjalistę',
      status: 'QUEUED',
      ticketId: 'zgl-7',
      idempotencyKey: 'addon:v1:user-1:intencja-abc-123',
    };

    it('nie obciąża portfela drugi raz', async () => {
      const { service, wallet } = zbuduj({ istniejacy });
      await service.purchase('user-1', 'manual_setup', undefined, 'intencja-abc-123');
      expect(wallet.debit).not.toHaveBeenCalled();
    });

    it('nie tworzy drugiego zgłoszenia do BOK-u', async () => {
      const { service, tickets } = zbuduj({ istniejacy });
      await service.purchase('user-1', 'manual_setup', undefined, 'intencja-abc-123');
      expect(tickets.create).not.toHaveBeenCalled();
    });

    it('nie tworzy drugiego wpisu w historii zakupów', async () => {
      const { service, prisma } = zbuduj({ istniejacy });
      await service.purchase('user-1', 'manual_setup', undefined, 'intencja-abc-123');
      expect(prisma.purchasedAddon.create).not.toHaveBeenCalled();
    });

    it('zwraca istniejący zakup i oznacza go jako duplikat', async () => {
      const { service } = zbuduj({ istniejacy });
      const wynik = await service.purchase('user-1', 'manual_setup', undefined, 'intencja-abc-123');
      expect(wynik).toMatchObject({ ok: true, id: 'zakup-istniejacy', duplikat: true });
      expect(wynik.note).toContain('Nie pobraliśmy opłaty drugi raz');
    });

    it('dziesięć kliknięć pod rząd to jedno obciążenie i jedno zgłoszenie', async () => {
      const { service, wallet, tickets } = zbuduj();
      for (let i = 0; i < 10; i += 1) {
        await service.purchase('user-1', 'manual_setup', 'sub-1', 'jedna-decyzja-zakupu');
      }
      expect(wallet.debit).toHaveBeenCalledTimes(1);
      expect(tickets.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('wyścig dwóch równoległych żądań', () => {
    it('P2002 z unikalnego indeksu kończy się zwróceniem istniejącego zakupu', async () => {
      const { service } = zbuduj({ rzucP2002: true });
      const wynik = await service.purchase('user-1', 'manual_setup', undefined, 'klucz-wyscigu');
      expect(wynik).toMatchObject({ ok: true, id: 'zakup-z-wyscigu', duplikat: true });
    });

    it('inny błąd bazy NIE jest połykany', async () => {
      const { service, prisma } = zbuduj();
      prisma.purchasedAddon.create.mockRejectedValueOnce(
        Object.assign(new Error('deadlock'), { code: 'P2034' }),
      );
      await expect(
        service.purchase('user-1', 'priority_support_30d', undefined, 'klucz-x'),
      ).rejects.toThrow('deadlock');
    });
  });

  describe('pierwszy zakup działa normalnie', () => {
    it('obciąża portfel raz i zapisuje klucz przy rekordzie', async () => {
      const { service, wallet, zapisane } = zbuduj();
      const wynik = await service.purchase('user-1', 'priority_support_30d', undefined, 'k1');
      expect(wallet.debit).toHaveBeenCalledTimes(1);
      expect(zapisane[0].idempotencyKey).toBe('addon:v1:user-1:k1');
      expect(wynik).toMatchObject({ ok: true, status: 'APPLIED' });
      expect(wynik).not.toHaveProperty('duplikat');
    });

    it('dodatek w trybie work-order tworzy zgłoszenie', async () => {
      const { service, tickets } = zbuduj();
      const wynik = await service.purchase('user-1', 'manual_setup', undefined, 'k2');
      expect(tickets.create).toHaveBeenCalledTimes(1);
      expect(wynik).toMatchObject({ status: 'QUEUED' });
    });

    it('nieznany dodatek jest odrzucany przed jakimkolwiek obciążeniem', async () => {
      const { service, wallet } = zbuduj();
      await expect(service.purchase('user-1', 'nie_ma_takiego')).rejects.toThrow('Nieznany dodatek');
      expect(wallet.debit).not.toHaveBeenCalled();
    });
  });

  describe('walidacja wejścia (endpoint nie miał wcześniej DTO)', () => {
    const bledy = (dane: Record<string, unknown>, pole: string) =>
      validateSync(plainToInstance(PurchaseAddonDto, dane)).filter((e) => e.property === pole);

    it('odrzuca slug ze znakami spoza [a-z0-9_]', () => {
      expect(bledy({ slug: 'manual setup' }, 'slug')).not.toHaveLength(0);
      expect(bledy({ slug: "x'; drop" }, 'slug')).not.toHaveLength(0);
    });

    it('przepuszcza realne slugi z katalogu', () => {
      for (const slug of ['priority_support_30d', 'manual_setup', 'dedicated_ip']) {
        expect(bledy({ slug }, 'slug')).toHaveLength(0);
      }
    });

    it('odrzuca identyfikator usługi ze znakami specjalnymi', () => {
      expect(bledy({ slug: 'manual_setup', subscriptionId: 'sub;1' }, 'subscriptionId')).not.toHaveLength(0);
    });

    it('odrzuca zbyt krótki klucz idempotencji', () => {
      expect(bledy({ slug: 'manual_setup', idempotencyKey: 'abc' }, 'idempotencyKey')).not.toHaveLength(0);
    });

    it('przepuszcza klucz w formacie generowanym przez panel', () => {
      expect(
        bledy(
          { slug: 'manual_setup', idempotencyKey: 'manual_setup-3f2b1c4e-5a6d-7e8f-9012-3456789abcde' },
          'idempotencyKey',
        ),
      ).toHaveLength(0);
    });
  });
});
