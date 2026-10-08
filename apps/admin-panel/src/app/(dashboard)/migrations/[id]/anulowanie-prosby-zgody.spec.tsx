/**
 * @jest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * ADMIN-MIGR — szczegóły migracji w adminie: migracja za klienta czekająca na zgodę pokazuje termin i daje
 * „Anuluj prośbę o zgodę” (po potwierdzeniu w oknie panelu, nie window.confirm); po decyzji klienta przycisku nie ma.
 */
const refresh = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: () => undefined }) }));
jest.mock("next/link", () => ({ __esModule: true, default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
jest.mock("@/components/potwierdz", () => ({ potwierdz: jest.fn() }));
jest.mock("../actions", () => ({
  anulujProsbeZgodyAction: jest.fn(),
  getMigrationDetailAction: jest.fn(),
  resolveMigrationAttentionAction: jest.fn(),
  retryMigrationJobAction: jest.fn(),
  revealMigrationSecretsAction: jest.fn(),
}));

import { potwierdz } from "@/components/potwierdz";
import { anulujProsbeZgodyAction, getMigrationDetailAction } from "../actions";
import { MigrationDetailClient, type MigrationDetail } from "./migration-detail-client";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const okno = potwierdz as jest.Mock;
const anuluj = anulujProsbeZgodyAction as jest.Mock;
const pobierz = getMigrationDetailAction as jest.Mock;

const szczegoly = (z: Partial<MigrationDetail> = {}): MigrationDetail => ({
  id: "mig-1",
  status: "DRAFT",
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
  secretsPurgedAt: null,
  sourceForm: null,
  jobs: [],
  zaKlienta: { operatorId: "adm-1", powod: "Zgłoszenie #77", wygasa: "2026-10-15T10:00:00.000Z", decyzjaAt: null, stan: "oczekuje" },
  ...z,
});

let root: Root;
let k: HTMLElement;
const render = (d: MigrationDetail) => act(() => root.render(<MigrationDetailClient initial={d} />));
const przycisk = () => [...k.querySelectorAll("button")].find((b) => b.textContent === "Anuluj prośbę o zgodę");

beforeEach(() => {
  okno.mockReset();
  anuluj.mockReset();
  pobierz.mockReset();
  refresh.mockReset();
  k = document.createElement("div");
  document.body.appendChild(k);
  root = createRoot(k);
});
afterEach(() => {
  act(() => root.unmount());
  k.remove();
});

it("czeka na zgodę: status po polsku, powód, termin i przycisk anulowania", () => {
  render(szczegoly());
  expect(k.textContent).toContain("Czeka na zgodę klienta");
  expect(k.textContent).toContain("Powód: Zgłoszenie #77");
  expect(k.textContent).toContain("bez niej nie wystartuje");
  expect(przycisk()).toBeTruthy();
});

it("anulowanie po potwierdzeniu woła akcję i odświeża szczegóły", async () => {
  okno.mockResolvedValue(true);
  anuluj.mockResolvedValue({ ok: true });
  pobierz.mockResolvedValue({ ok: true, detail: szczegoly({ status: "CANCELED" }) });
  render(szczegoly());
  await act(async () => przycisk()!.click());
  expect(okno).toHaveBeenCalledWith(expect.stringContaining("dane dostępowe"), expect.objectContaining({ niebezpieczne: true }));
  // Przycisk akcji w oknie nie może zaczynać się jak przycisk zamknięcia („Anuluj”) — inaczej łatwo je pomylić.
  const akcja = (okno.mock.calls[0]![1] as { akcja: string }).akcja;
  expect(akcja).toBe("Wycofaj prośbę i usuń dane");
  expect(akcja).not.toMatch(/^Anuluj/);
  expect(anuluj).toHaveBeenCalledWith({ migrationId: "mig-1" });
  expect(k.textContent).toContain("Prośba anulowana, dane dostępowe usunięte.");
  expect(przycisk()).toBeUndefined();
});

it("zamknięcie okna potwierdzenia („Anuluj”) → nic nie wysyła", async () => {
  okno.mockResolvedValue(false);
  render(szczegoly());
  await act(async () => przycisk()!.click());
  expect(anuluj).not.toHaveBeenCalled();
});

it("błąd API → czytelny komunikat", async () => {
  okno.mockResolvedValue(true);
  anuluj.mockResolvedValue({ error: "Migracja już wystartowała." });
  render(szczegoly());
  await act(async () => przycisk()!.click());
  expect(k.textContent).toContain("Migracja już wystartowała.");
});

it("po zgodzie klienta — „zgodził się” i bez przycisku anulowania prośby", () => {
  render(szczegoly({ status: "QUEUED", zaKlienta: { operatorId: "adm-1", powod: "x", wygasa: null, decyzjaAt: "2026-10-09T08:00:00.000Z", stan: "zaakceptowana" } }));
  expect(k.textContent).toContain("Klient zgodził się");
  expect(k.textContent).not.toContain("odmówił");
  expect(przycisk()).toBeUndefined();
});

it("po anulowaniu przez admina tekst nie twierdzi, że klient nie zdecydował w terminie", async () => {
  okno.mockResolvedValue(true);
  anuluj.mockResolvedValue({ ok: true });
  pobierz.mockResolvedValue({
    ok: true,
    detail: szczegoly({ status: "CANCELED", zaKlienta: { operatorId: "adm-1", powod: "x", wygasa: "2026-10-15T10:00:00.000Z", decyzjaAt: null, stan: "anulowana" } }),
  });
  render(szczegoly());
  await act(async () => przycisk()!.click());
  expect(k.textContent).toContain("Prośba anulowana przez zespół przed decyzją klienta.");
  expect(k.textContent).not.toContain("nie zdecydował w terminie");
});

it("klient odmówił — tekst mówi o odmowie, nie o samej decyzji", () => {
  render(szczegoly({ status: "CANCELED", zaKlienta: { operatorId: "adm-1", powod: "x", wygasa: null, decyzjaAt: "2026-10-09T08:00:00.000Z", stan: "odrzucona" } }));
  expect(k.textContent).toContain("Klient odmówił");
  expect(k.textContent).not.toContain("zgodził się");
});

it("termin minął bez decyzji — „nie zdecydował w terminie”", () => {
  render(szczegoly({ status: "CANCELED", zaKlienta: { operatorId: "adm-1", powod: "x", wygasa: "2026-10-01T10:00:00.000Z", decyzjaAt: null, stan: "wygasla" } }));
  expect(k.textContent).toContain("Klient nie zdecydował w terminie");
});

it("zwykła migracja (bez „za klienta”) — bez sekcji", () => {
  render(szczegoly({ status: "QUEUED", zaKlienta: null }));
  expect(k.textContent).not.toContain("przygotowana za klienta");
});
