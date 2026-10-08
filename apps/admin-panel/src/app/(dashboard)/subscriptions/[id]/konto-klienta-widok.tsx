import type { ReactNode } from "react";
import { plForm } from "@/lib/pl";

/**
 * PB-42 — podgląd konta klienta dla obsługi (tylko odczyt). Ten sam plik jest w panelu staff i admin
 * (różnią się tylko akcje serwera). Odpowiedzi API: admin/subscriptions/:id/konto/<sekcja>
 * (apps/api/src/subscriptions/konto-klienta.admin.controller.ts).
 */
export type SekcjaKonta = "domeny" | "dns" | "poczta" | "bazy" | "php" | "ssl" | "cron" | "logi" | "logi-poczty";

export const SEKCJE_KONTA: ReadonlyArray<{ klucz: SekcjaKonta; etykieta: string }> = [
  { klucz: "domeny", etykieta: "Domeny" },
  { klucz: "dns", etykieta: "DNS" },
  { klucz: "poczta", etykieta: "Poczta" },
  { klucz: "bazy", etykieta: "Bazy danych" },
  { klucz: "php", etykieta: "PHP" },
  { klucz: "ssl", etykieta: "SSL" },
  { klucz: "cron", etykieta: "Cron" },
  { klucz: "logi", etykieta: "Logi WWW" },
  { klucz: "logi-poczty", etykieta: "Logi poczty" },
];

export const czySekcjaKonta = (s: string): s is SekcjaKonta => SEKCJE_KONTA.some((x) => x.klucz === s);

export interface ParametrySekcji {
  domain?: string;
  type?: "access" | "error";
  lines?: number;
}

export interface DaneDomen {
  domeny: string[];
  glowna: string | null;
  poddomeny: Array<{ subdomain: string; domain: string }>;
  fetchError: string | null;
}
export interface DaneDns {
  domeny: string[];
  domain: string | null;
  records: Array<{ id: string; name: string; type: string; value: string; ttl: number | null }>;
  fetchError: string | null;
}
export interface DanePoczty {
  skrzynki: Array<{ email: string; quotaMb: number | null }>;
  przekierowania: Array<{ email: string; destinations: string[] }>;
  fetchError: string | null;
}
export interface DaneBaz {
  bazy: string[];
  silnik: { name: string; version: string } | null;
  fetchError: string | null;
}
export interface DanePhp {
  wersja: string | null;
  dostepneWersje: string[];
  zastosowano: string | null;
  ostatnieZadanie: null | { status: string; errorMessage: string | null; createdAt: string; completedAt: string | null };
  domeny: string[];
  domena: string;
  ini: Record<string, string> | null;
  wlasneDyrektywy: number | null;
  iniBlad: string | null;
}
export interface DaneSsl {
  rows: Array<{
    domain: string;
    issuer: string;
    status: "VALID" | "EXPIRING" | "EXPIRED" | "MISMATCH" | "NONE";
    expiresAt: string | null;
    daysLeft: number | null;
    isLetsEncrypt: boolean;
  }>;
  fetchError: string | null;
}
export interface DaneCron {
  rows: Array<{ id: string; schedule: string; command: string }>;
  fetchError: string | null;
}
export interface DaneLogow {
  domeny: string[];
  domain: string | null;
  type: "access" | "error";
  lines: string[];
  truncated: boolean;
  fetchError: string | null;
}
export interface DaneLogowPoczty {
  wToku: boolean;
  wczytano: string | null;
  adres: string | null;
  wpisy: Array<{ czas: string; id: string; znak: "<=" | "=>" | "->" | "**" | "=="; adres: string; szczegoly: string }>;
  blad: string | null;
}

export type DaneSekcji =
  | { sekcja: "domeny"; dane: DaneDomen }
  | { sekcja: "dns"; dane: DaneDns }
  | { sekcja: "poczta"; dane: DanePoczty }
  | { sekcja: "bazy"; dane: DaneBaz }
  | { sekcja: "php"; dane: DanePhp }
  | { sekcja: "ssl"; dane: DaneSsl }
  | { sekcja: "cron"; dane: DaneCron }
  | { sekcja: "logi"; dane: DaneLogow }
  | { sekcja: "logi-poczty"; dane: DaneLogowPoczty };

const data = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL") : "—");
const ile = (n: number, one: string, few: string, many: string) => `${n} ${plForm(n, one, few, many)}`;

/** Błąd całej sekcji (API/uprawnienia) — reszta karty działa dalej. */
export function BladSekcji({ komunikat }: { komunikat: string }) {
  return (
    <p role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
      {komunikat}
    </p>
  );
}

/** Węzeł nie odpowiedział albo odmówił — pokazujemy to, co mamy, i komunikat zamiast pustej listy. */
function BladWezla({ komunikat }: { komunikat: string | null }) {
  if (!komunikat) return null;
  return (
    <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      Odczyt z serwera nie powiódł się: {komunikat}
    </p>
  );
}

function Pusto({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function Tabela({ naglowki, wiersze }: { naglowki: string[]; wiersze: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs text-white">
        <thead className="border-b border-white/10 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {naglowki.map((n) => (
              <th key={n} className="px-2 py-1.5 font-semibold">
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {wiersze.map((w, i) => (
            <tr key={i}>
              {w.map((k, j) => (
                <td key={j} className="px-2 py-1.5 align-top font-mono break-all">
                  {k}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const SSL_STATUS: Record<DaneSsl["rows"][number]["status"], string> = {
  VALID: "ważny",
  EXPIRING: "wkrótce wygasa",
  EXPIRED: "wygasł",
  MISMATCH: "nie pasuje do domeny",
  NONE: "brak certyfikatu",
};

const STATUS_ZADANIA: Record<string, string> = {
  QUEUED: "w kolejce",
  RUNNING: "w toku",
  COMPLETED: "zakończona",
  FAILED: "nieudana",
  CANCELLED: "anulowana",
};

const ZNAK_POCZTY: Record<DaneLogowPoczty["wpisy"][number]["znak"], string> = {
  "<=": "przyjęta",
  "=>": "dostarczona",
  "->": "dostarczona (kolejny adresat)",
  "**": "odrzucona",
  "==": "odłożona",
};

export function WidokSekcjiKonta({ wynik }: { wynik: DaneSekcji }) {
  switch (wynik.sekcja) {
    case "domeny": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          <p className="text-xs text-muted-foreground">
            {ile(d.domeny.length, "domena", "domeny", "domen")}, {ile(d.poddomeny.length, "poddomena", "poddomeny", "poddomen")}
          </p>
          {d.domeny.length ? (
            <ul className="space-y-1 font-mono text-xs text-white">
              {d.domeny.map((n) => (
                <li key={n}>
                  {n}
                  {n === d.glowna ? <span className="ml-2 text-[10px] text-cyan-300">główna</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Pusto>Brak domen na koncie.</Pusto>
          )}
          {d.poddomeny.length ? (
            <Tabela naglowki={["Poddomena", "Domena"]} wiersze={d.poddomeny.map((p) => [`${p.subdomain}.${p.domain}`, p.domain])} />
          ) : null}
        </div>
      );
    }
    case "dns": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          <p className="text-xs text-muted-foreground">
            Strefa {d.domain ?? "—"}: {ile(d.records.length, "rekord", "rekordy", "rekordów")}
          </p>
          {d.records.length ? (
            <Tabela
              naglowki={["Nazwa", "Typ", "Wartość", "TTL"]}
              wiersze={d.records.map((r) => [r.name, r.type, r.value, r.ttl ?? "—"])}
            />
          ) : d.fetchError ? null : (
            <Pusto>Strefa nie ma rekordów.</Pusto>
          )}
        </div>
      );
    }
    case "poczta": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          <p className="text-xs text-muted-foreground">
            {ile(d.skrzynki.length, "skrzynka", "skrzynki", "skrzynek")}, {ile(d.przekierowania.length, "przekierowanie", "przekierowania", "przekierowań")}
          </p>
          {d.skrzynki.length ? (
            <Tabela
              naglowki={["Skrzynka", "Rozmiar"]}
              wiersze={d.skrzynki.map((s) => [s.email, s.quotaMb ? `${s.quotaMb} MB` : "bez limitu"])}
            />
          ) : null}
          {d.przekierowania.length ? (
            <Tabela
              naglowki={["Adres", "Przekierowanie do"]}
              wiersze={d.przekierowania.map((p) => [p.email, p.destinations.join(", ")])}
            />
          ) : null}
          {!d.skrzynki.length && !d.przekierowania.length && !d.fetchError ? <Pusto>Brak skrzynek i przekierowań.</Pusto> : null}
        </div>
      );
    }
    case "bazy": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          <p className="text-xs text-muted-foreground">
            {ile(d.bazy.length, "baza", "bazy", "baz")}
            {d.silnik ? ` · ${d.silnik.name} ${d.silnik.version}` : ""}
          </p>
          {d.bazy.length ? (
            <ul className="space-y-1 font-mono text-xs text-white">
              {d.bazy.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : d.fetchError ? null : (
            <Pusto>Brak baz danych.</Pusto>
          )}
        </div>
      );
    }
    case "php": {
      const d = wynik.dane;
      const ini = Object.entries(d.ini ?? {});
      return (
        <div className="space-y-3 text-xs text-white">
          <p>
            Wersja PHP konta: <span className="font-mono">{d.wersja ?? "domyślna serwera"}</span>
            {d.zastosowano ? <span className="text-muted-foreground"> · zastosowano {data(d.zastosowano)}</span> : null}
          </p>
          {d.ostatnieZadanie ? (
            <p className="text-muted-foreground">
              Ostatnia zmiana: {STATUS_ZADANIA[d.ostatnieZadanie.status] ?? d.ostatnieZadanie.status} ({data(d.ostatnieZadanie.createdAt)})
              {d.ostatnieZadanie.errorMessage ? <span className="text-rose-200"> — {d.ostatnieZadanie.errorMessage}</span> : null}
            </p>
          ) : null}
          <p className="text-muted-foreground">Ustawienia PHP domeny {d.domena}:</p>
          <BladWezla komunikat={d.iniBlad} />
          {ini.length ? (
            <Tabela naglowki={["Dyrektywa", "Wartość"]} wiersze={ini.map(([k, v]) => [k, v])} />
          ) : d.iniBlad ? null : (
            <Pusto>Domyślne ustawienia (bez zmian z panelu).</Pusto>
          )}
          {d.wlasneDyrektywy ? (
            <p className="text-muted-foreground">
              Poza ustawieniami z panelu plik .user.ini ma {ile(d.wlasneDyrektywy, "własną dyrektywę", "własne dyrektywy", "własnych dyrektyw")}.
            </p>
          ) : null}
        </div>
      );
    }
    case "ssl": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          {d.rows.length ? (
            <Tabela
              naglowki={["Domena", "Status", "Wystawca", "Ważny do"]}
              wiersze={d.rows.map((r) => [
                r.domain,
                SSL_STATUS[r.status] ?? r.status,
                r.issuer,
                r.expiresAt
                  ? `${new Date(r.expiresAt).toLocaleDateString("pl-PL")}${r.daysLeft !== null ? ` (${ile(r.daysLeft, "dzień", "dni", "dni")})` : ""}`
                  : "—",
              ])}
            />
          ) : d.fetchError ? null : (
            <Pusto>Brak domen do sprawdzenia.</Pusto>
          )}
        </div>
      );
    }
    case "cron": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          {d.rows.length ? (
            <Tabela naglowki={["Harmonogram", "Polecenie"]} wiersze={d.rows.map((r) => [r.schedule, r.command])} />
          ) : d.fetchError ? null : (
            <Pusto>Brak zadań cron.</Pusto>
          )}
        </div>
      );
    }
    case "logi": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          <BladWezla komunikat={d.fetchError} />
          <p className="text-xs text-muted-foreground">
            {d.type === "error" ? "Log błędów" : "Log dostępu"} {d.domain ?? "—"}: {ile(d.lines.length, "linia", "linie", "linii")}
            {d.truncated ? " (obcięte do ostatnich)" : ""}
          </p>
          {d.lines.length ? (
            <pre className="max-h-96 overflow-auto rounded-lg border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-neutral-200 whitespace-pre-wrap break-all">
              {d.lines.join("\n")}
            </pre>
          ) : d.fetchError ? null : (
            <Pusto>Brak wpisów w logu.</Pusto>
          )}
        </div>
      );
    }
    case "logi-poczty": {
      const d = wynik.dane;
      return (
        <div className="space-y-3">
          {d.blad ? <BladWezla komunikat={d.blad} /> : null}
          <p className="text-xs text-muted-foreground">
            {d.wczytano
              ? `Ostatnio wczytany dziennik: ${data(d.wczytano)}${d.adres ? ` · adres ${d.adres}` : ""} · ${ile(d.wpisy.length, "wpis", "wpisy", "wpisów")}`
              : "Dziennik poczty nie był jeszcze wczytany. Wczytanie (zadanie na serwerze) zleca klient w panelu w zakładce Poczta."}
            {d.wToku ? " Wczytywanie w toku." : ""}
          </p>
          {d.wpisy.length ? (
            <Tabela
              naglowki={["Czas", "Zdarzenie", "Adres", "Szczegóły"]}
              wiersze={d.wpisy.map((w) => [w.czas, ZNAK_POCZTY[w.znak] ?? w.znak, w.adres, w.szczegoly])}
            />
          ) : null}
        </div>
      );
    }
  }
}
