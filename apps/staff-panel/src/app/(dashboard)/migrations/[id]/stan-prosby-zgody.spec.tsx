import { renderToStaticMarkup } from "react-dom/server";

/**
 * ADMIN-MIGR (ustalenie recenzenta, błąd odziedziczony z PB-45) — sekcja „Migracja przygotowana przez obsługę”
 * opisuje, co się stało z prośbą o zgodę, według stanu policzonego przez API. Do 08.10 anulowanie przez operatora
 * pokazywało „Klient nie zdecydował w terminie.”, a odmowa klienta — samo „Klient zdecydował <data>.”.
 */
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("../actions", () => ({
  anulujProsbeZgodyAction: jest.fn(),
  getMigrationDetailAction: jest.fn(),
  resolveMigrationAttentionAction: jest.fn(),
  retryMigrationJobAction: jest.fn(),
  revealMigrationSecretsAction: jest.fn(),
}));

import { MigrationDetailClient, type MigrationDetail } from "./migration-detail-client";

type ZaKlienta = NonNullable<MigrationDetail["zaKlienta"]>;

const szczegoly = (status: string, zaKlienta: ZaKlienta): MigrationDetail => ({
  id: "mig-1",
  status,
  currentStep: null,
  targetDomain: "firma.pl",
  sourcePanelType: "manual",
  needsAttention: false,
  attentionReason: null,
  cutoverMode: null,
  cutoverAt: null,
  bytesTransferred: "0",
  filesTransferred: 0,
  databasesMigrated: 0,
  mailboxesMigrated: 0,
  startedAt: null,
  completedAt: null,
  createdAt: "2026-10-08T10:00:00.000Z",
  updatedAt: "2026-10-08T10:00:00.000Z",
  lastError: null,
  ticketId: null,
  clientEmail: "jan@firma.pl",
  clientName: "Jan Kowalski",
  clientUserId: "u1",
  planName: "Hosting",
  accountDomain: "firma.pl",
  accountUsername: "firma",
  serverId: null,
  subscriptionId: "s1",
  secretsPurgedAt: "2026-10-08T11:00:00.000Z",
  sourceForm: null,
  jobs: [],
  zaKlienta,
});

const tekst = (status: string, z: Partial<ZaKlienta>) =>
  renderToStaticMarkup(
    <MigrationDetailClient
      initial={szczegoly(status, { operatorId: "op-1", powod: "Zgłoszenie #77", wygasa: "2026-10-15T10:00:00.000Z", decyzjaAt: null, stan: "oczekuje", ...z })}
    />,
  );

it("czeka na zgodę — termin i przycisk anulowania", () => {
  const html = tekst("DRAFT", {});
  expect(html).toContain("Czeka na zgodę klienta do");
  expect(html).toContain("Anuluj prośbę i usuń dane dostępowe");
});

it("anulował operator przed terminem — nie „klient nie zdecydował w terminie”", () => {
  const html = tekst("CANCELED", { stan: "anulowana" });
  expect(html).toContain("Prośba anulowana przez zespół przed decyzją klienta.");
  expect(html).not.toContain("nie zdecydował w terminie");
});

it("klient odmówił — „odmówił”, nie samo „zdecydował”", () => {
  const html = tekst("CANCELED", { stan: "odrzucona", decyzjaAt: "2026-10-09T08:00:00.000Z" });
  expect(html).toContain("Klient odmówił");
  expect(html).not.toContain("zgodził się");
});

it("klient się zgodził — „zgodził się”", () => {
  const html = tekst("QUEUED", { stan: "zaakceptowana", decyzjaAt: "2026-10-09T08:00:00.000Z" });
  expect(html).toContain("Klient zgodził się");
  expect(html).not.toContain("Anuluj prośbę");
});

it("termin minął bez decyzji — „nie zdecydował w terminie”", () => {
  expect(tekst("CANCELED", { stan: "wygasla", wygasa: "2026-10-01T10:00:00.000Z" })).toContain("Klient nie zdecydował w terminie");
});
