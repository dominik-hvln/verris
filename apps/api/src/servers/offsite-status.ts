/**
 * Status kopii off-site konta. Serwer raportuje tylko ostatni przebieg node-offsite-backup.sh —
 * konto założone PÓŹNIEJ jeszcze w nim nie było (test D3 na t1: panel mówił „kopia leży poza
 * serwerem, ostatnia 18:30”, a konto powstało o 22:00 i archiwów off-site nie miało).
 */
export function statusOffsite(account: {
  createdAt: Date;
  server?: { lastOffsiteBackupOk?: boolean | null; lastOffsiteBackupAt?: Date | null } | null;
} | null | undefined) {
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
