/** Statusy migracji i kroków po polsku — obsługa nie ma czytać enumów z bazy (`MigrationStatus`, `MigrationWorkerJobStatus`). */
const STATUS_PL: Record<string, string> = {
  ATTENTION: "Pilne",
  QUEUED: "W kolejce",
  RUNNING: "W toku",
  RETRYING: "Ponawiane",
  FAILED: "Nieudane",
  COMPLETED: "Ukończone",
  DRAFT: "Czeka na zgodę klienta",
  CANCELED: "Anulowane",
};

export const statusPl = (s: string) => STATUS_PL[s] ?? s;
