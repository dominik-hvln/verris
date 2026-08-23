import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Z-18 — błąd etapu provisioningu, który nie gubi własnej przyczyny.
 *
 * DLACZEGO POWSTAŁ. Do 2026-08-23 każdy etap wołający DirectAdmina łapał
 * prawdziwy błąd, zapisywał go do audytu i rzucał dalej STAŁY NAPIS:
 *
 *     throw new ServiceUnavailableException(
 *       `DirectAdmin package "${slug}" is missing on the node…`)
 *
 * Prawda zostawała w bazie, w górę szła zmyślona przyczyna. A wyżej stoi
 * klasyfikator retry, który czytał właśnie ten wyprany komunikat — i dla
 * `connect ECONNREFUSED` (błędu z definicji przejściowego, wymienionego na
 * liście wprost) zwracał `permanent`. Ścieżka twardej porażki odpalała się już
 * przy pierwszej próbie: subskrypcja na FAILED, ZWROT ŚRODKÓW, status
 * PENDING_PAYMENT. Potem BullMQ i tak ponawiał i druga próba mogła się udać —
 * konto powstawało, subskrypcja szła na ACTIVE. Klient z działającym hostingiem
 * i odzyskanymi pieniędzmi; zwrot idempotentny, więc nie do cofnięcia.
 *
 * TRZY WŁAŚCIWOŚCI, KAŻDA Z POWODU
 * ────────────────────────────────
 * `etap`      — gdzie się urwało. Bez tego śledztwo zaczyna się od zgadywania.
 * `przyczyna` — ORYGINALNA treść błędu. To po niej klasyfikuje `kategoriaBledu`.
 * `message`   — komunikat dla człowieka Z DOKLEJONĄ przyczyną.
 *
 * Doklejenie przyczyny do `message` nie jest ozdobą. Panel operatora pokazuje
 * `job.failedReason` z BullMQ, a to jest po prostu `Error.message`; pole
 * `failedCategory` liczy się z tego samego napisu. Gdyby przyczyna została
 * wyłącznie we właściwości obiektu, panel dalej opowiadałby zmyśloną historię —
 * czyli dokładnie to, co kazało mi dziś zajrzeć do `AuditLog`, żeby dowiedzieć
 * się, co się naprawdę stało.
 */
export class BladEtapuProvisioningu extends ServiceUnavailableException {
  constructor(
    readonly etap: string,
    readonly przyczyna: string,
    komunikatDlaCzlowieka: string,
  ) {
    super(`${komunikatDlaCzlowieka} [${etap}: ${przyczyna}]`);
  }
}
