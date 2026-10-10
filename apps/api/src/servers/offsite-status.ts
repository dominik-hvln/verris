/**
 * Status kopii off-site konta. Serwer raportuje tylko ostatni przebieg node-offsite-backup.sh —
 * konto założone PÓŹNIEJ jeszcze w nim nie było (test D3 na t1: panel mówił „kopia leży poza
 * serwerem, ostatnia 18:30”, a konto powstało o 22:00 i archiwów off-site nie miało).
 *
 * F3.3 — gdy węzeł raportuje wynik każdego konta (Account.offsiteBackup*), liczy się wynik KONTA, nie przebiegu:
 * kopia konta, której nie udało się zrobić, nie jest „chroniona” tylko dlatego, że reszta węzła się skopiowała.
 * Poprzednia udana kopia leży poza serwerem, więc konto z nieudanym ostatnim przebiegiem dalej ma kopię — z jej datą.
 */
export function statusOffsite(account: {
  createdAt: Date;
  offsiteBackupOkAt?: Date | null;
  offsiteBackupFailedAt?: Date | null;
  server?: { lastOffsiteBackupOk?: boolean | null; lastOffsiteBackupAt?: Date | null } | null;
} | null | undefined) {
  const okKonta = account?.offsiteBackupOkAt ?? null;
  const bladKonta = account?.offsiteBackupFailedAt ?? null;
  if (okKonta || bladKonta) {
    return {
      protected: okKonta !== null,
      pending: false,
      lastRunAt: okKonta ? okKonta.toISOString() : null,
      lastRunOk: !(bladKonta && (!okKonta || bladKonta > okKonta)),
    };
  }
  const srv = account?.server;
  const at = srv?.lastOffsiteBackupAt ?? null;
  const ok = Boolean(srv?.lastOffsiteBackupOk);
  const objelo = Boolean(account && at && at >= account.createdAt);
  return {
    protected: ok && objelo,
    /** Przebiegi działają, ale konto jest nowsze niż ostatni z nich — pierwsza kopia przy następnym. */
    pending: ok && !objelo,
    lastRunAt: objelo && at ? at.toISOString() : null,
    lastRunOk: srv ? (srv.lastOffsiteBackupOk ?? null) : null,
  };
}
