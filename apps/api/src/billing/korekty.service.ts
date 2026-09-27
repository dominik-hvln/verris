import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Invoice, Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from './wallet-ledger.service.js';
import { nadajNumerDokumentu, STAWKA_VAT } from './faktura-za-portfel.js';
import {
  bladKorygowalnosci,
  korektaFormalna,
  kwotaDoZwrotu,
  opisKorekty,
  przeliczKorekte,
  type PozycjaKorekty,
  type RodzajKorekty,
} from './korekta-faktury.js';

export interface WystawKorekteInput {
  invoiceId: string;
  rodzaj: RodzajKorekty;
  /** Przyczyna — pole OBOWIĄZKOWE na dokumencie (art. 106j ust. 2 pkt 4). */
  przyczyna: string;
  /** Pozycje PO korekcie. Wymagane dla korekty wartościowej. */
  pozycjePo?: PozycjaKorekty[];
  /** Poprawione dane nabywcy. Wymagane dla korekty formalnej. */
  nabywcaPo?: Record<string, unknown>;
  aktorUserId: string;
}

/**
 * M-06 — wystawianie faktur korygujących.
 *
 * Osobny serwis, nie kolejne 300 linijek w `InvoicesService`, bo korekta ma
 * własne reguły dopuszczalności, własną serię numeracji i własny skutek dla
 * pieniędzy. Wsadzona do serwisu, który już robi cztery rzeczy, byłaby piątą,
 * której nikt nie znajdzie.
 */
@Injectable()
export class KorektyService {
  private readonly logger = new Logger(KorektyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: WalletLedgerService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Wystawia korektę i — dla korekty zmniejszającej — zwraca różnicę do
   * portfela klienta W TEJ SAMEJ TRANSAKCJI.
   *
   * Atomowość nie jest tu ozdobą. Gdyby zwrot szedł osobno, operator
   * wystawiałby korektę i musiał pamiętać o drugim kroku — a to dokładnie ten
   * kształt, który w tym projekcie wyprodukował już cztery błędy. Klient widzi
   * jedno zdarzenie („oddaliście mi pieniądze"), więc system też ma je zapisać
   * jako jedno.
   */
  async wystaw(input: WystawKorekteInput): Promise<{ id: string; number: string; zwrot: string }> {
    const pierwotna = await this.prisma.invoice.findUnique({
      where: { id: input.invoiceId },
    });
    if (!pierwotna) throw new NotFoundException(`Nie ma faktury ${input.invoiceId}`);

    const blad = bladKorygowalnosci(pierwotna as never);
    if (blad) throw new BadRequestException(blad);

    if (!input.przyczyna?.trim()) {
      throw new BadRequestException(
        'Przyczyna korekty jest obowiązkowa na dokumencie (art. 106j ust. 2 pkt 4).',
      );
    }

    if (input.rodzaj === 'FORMALNA' && !input.nabywcaPo) {
      throw new BadRequestException(
        'Korekta formalna bez poprawionych danych nabywcy niczego nie poprawia.',
      );
    }

    const teraz = new Date();
    let zwrot = new Prisma.Decimal(0);
    let wynik!: ReturnType<typeof korektaFormalna>;

    const korekta = await this.prisma.$transaction(async (tx) => {
      // Blokada faktury pierwotnej: dwa równoległe „wystaw” (dwuklik) liczą się jedno po drugim,
      // a drugie widzi już pierwszą korektę. Wcześniej oba liczyły od stanu pierwotnego i oba zwracały.
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${pierwotna.id} FOR UPDATE`;
      const ostatnia = await tx.invoice.findFirst({
        where: { correctedId: pierwotna.id, kind: 'KOREKTA' },
        orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
      });
      const stan = stanPoKorektach(pierwotna, ostatnia);
      try {
        wynik =
          input.rodzaj === 'FORMALNA'
            ? korektaFormalna(stan as never)
            : przeliczKorekte(stan as never, input.pozycjePo ?? []);
      } catch (err) {
        throw new BadRequestException(err instanceof Error ? err.message : String(err));
      }
      zwrot = kwotaDoZwrotu(wynik.roznica);
      const { numer, rodzajPrawny } = await nadajNumerDokumentu(tx, teraz, {
        rodzajPierwotnej: pierwotna.rodzajPrawny,
      });

      const dok = await tx.invoice.create({
        data: {
          userId: pierwotna.userId,
          subscriptionId: pierwotna.subscriptionId,
          number: numer,
          rodzajPrawny,
          kind: 'KOREKTA',
          status: 'PAID',
          correctedId: pierwotna.id,
          correctionKind: input.rodzaj,
          correctionReason: input.przyczyna.trim(),

          // W `amount` siedzi RÓŻNICA ze znakiem, nie nowa kwota. To ona
          // wchodzi do rejestru VAT i to ona mówi, ile pieniędzy się rusza.
          amount: wynik.roznica.brutto,
          netAmount: wynik.roznica.netto,
          vatAmount: wynik.roznica.vat,
          vatRate: new Prisma.Decimal(STAWKA_VAT),
          currency: pierwotna.currency,

          // Stan przed korektą zapisujemy NA korekcie, a nie odczytujemy
          // z faktury pierwotnej — ta może zostać skorygowana ponownie,
          // a dokument ma pokazywać stan, do którego się odnosi.
          correctedAmount: stan.amount,
          correctedNet: stan.netAmount,
          correctedVat: stan.vatAmount,
          correctedLineItems: (stan.lineItems ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          correctedBuyer: (stan.buyerSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,

          lineItems: wynik.pozycjePo as unknown as Prisma.InputJsonValue,
          buyerSnapshot: (input.nabywcaPo ??
            stan.buyerSnapshot ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          sellerSnapshot: (pierwotna.sellerSnapshot ?? Prisma.JsonNull) as Prisma.InputJsonValue,

          provider: pierwotna.provider,
          // Para (provider, providerRef) jest unikalna, więc referencja musi
          // być inna niż na fakturze pierwotnej — a jednocześnie stała dla
          // tej korekty, żeby powtórzone wywołanie odbiło się o bazę.
          providerRef: `korekta:${pierwotna.id}:${numer}`,
          issuedAt: teraz,
          paidAt: teraz,
        },
      });

      if (zwrot.greaterThan(0)) {
        // Zwrot idzie przez tę samą metodę księgi co każde inne uznanie —
        // blokada wiersza użytkownika, przeliczenie salda, wpis do księgi.
        // Jedno miejsce zmieniające saldo, nadal jedno.
        const wpis = await this.ledger.zapiszWpis(
          tx,
          {
            userId: pierwotna.userId,
            amount: zwrot,
            type: WalletTxType.REFUND,
            description: opisKorekty(
              input.rodzaj,
              pierwotna.number,
              wynik.roznica,
              pierwotna.currency,
            ),
            idempotencyKey: `korekta:${dok.id}`,
            subscriptionId: pierwotna.subscriptionId ?? undefined,
          },
          'credit',
          zwrot,
          zwrot,
        );
        await tx.walletTransaction.update({
          where: { id: wpis.id },
          data: { invoiceId: dok.id },
        });
      }

      return dok;
    });

    await this.audit.record({
      action: 'FAKTURA_KOREKTA_WYSTAWIONA',
      userId: pierwotna.userId,
      actorUserId: input.aktorUserId,
      details: {
        korektaId: korekta.id,
        numerKorekty: korekta.number,
        numerPierwotnej: pierwotna.number,
        rodzaj: input.rodzaj,
        przyczyna: input.przyczyna.trim(),
        przed: wynik.przed.brutto.toFixed(2),
        po: wynik.po.brutto.toFixed(2),
        roznica: wynik.roznica.brutto.toFixed(2),
        zwrocono: zwrot.toFixed(2),
      },
    });

    this.logger.log(
      `Korekta ${korekta.number} do ${pierwotna.number}: ` +
        `${wynik.przed.brutto.toFixed(2)} → ${wynik.po.brutto.toFixed(2)} ` +
        `${pierwotna.currency}` +
        (zwrot.greaterThan(0) ? `, zwrot ${zwrot.toFixed(2)}` : ''),
    );

    return { id: korekta.id, number: korekta.number, zwrot: zwrot.toFixed(2) };
  }

  /** Korekty wystawione do danej faktury, od najstarszej. */
  async listaDlaFaktury(invoiceId: string): Promise<Invoice[]> {
    return this.prisma.invoice.findMany({
      where: { correctedId: invoiceId },
      orderBy: { createdAt: 'asc' },
    });
  }
}

/**
 * Stan faktury po wszystkich dotychczasowych korektach — od niego liczy się kolejna.
 * Każda korekta zapisuje stan przed (`corrected*`) i różnicę (`amount`/`netAmount`/`vatAmount`),
 * więc stan po ostatniej to ich suma; pozycje i nabywca — z ostatniej korekty.
 */
export function stanPoKorektach(pierwotna: Invoice, ostatnia: Invoice | null): Invoice {
  if (!ostatnia) return pierwotna;
  const suma = (a: Prisma.Decimal | null, b: Prisma.Decimal | null) => (a === null || b === null ? null : a.add(b));
  return {
    ...pierwotna,
    amount: (ostatnia.correctedAmount ?? pierwotna.amount).add(ostatnia.amount),
    netAmount: suma(ostatnia.correctedNet, ostatnia.netAmount),
    vatAmount: suma(ostatnia.correctedVat, ostatnia.vatAmount),
    lineItems: ostatnia.lineItems,
    buyerSnapshot: ostatnia.buyerSnapshot ?? pierwotna.buyerSnapshot,
  };
}
