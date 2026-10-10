import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import { NieWczytano } from "@/components/nie-wczytano";

/** Odpowiedź GET /admin/users/:id/zespol (F2.4; bez tokenów zaproszeń i haseł). */
export interface ZespolKlienta {
  jestSubkontem: boolean;
  subkonta: Array<{ id: string; email: string; nazwa: string | null; etykieta: string | null; uprawnienia: string[]; uslugi: string[] | null; wylaczone: boolean; utworzono: string }>;
  czlonkostwa: Array<{ id: string; czlonekId: string; email: string; nazwa: string | null; etykieta: string | null; uprawnienia: string[]; uslugi: string[] | null; utworzono: string }>;
  zaproszenia: Array<{ id: string; email: string; etykieta: string | null; uprawnienia: string[]; uslugi: string[] | null; wygasa: string; utworzono: string }>;
}

/** Nazwy uprawnień klienta jak w panelu klienta (apps/client-panel/src/app/dashboard/iam/constants.ts). */
const UPRAWNIENIE: Record<string, string> = {
  BILLING_READ: "płatności (podgląd)",
  BILLING_MANAGE: "płatności",
  SERVICES_READ: "usługi (podgląd)",
  SERVICES_MANAGE: "usługi",
  DOMAINS_READ: "domeny (podgląd)",
  DOMAINS_MANAGE: "domeny",
  DNS_MANAGE: "DNS",
  EMAIL_MANAGE: "poczta",
  FILES_MANAGE: "pliki",
  TICKETS_READ: "zgłoszenia (podgląd)",
  TICKETS_MANAGE: "zgłoszenia",
  SETTINGS_MANAGE: "ustawienia konta",
};

const data = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });
const opis = (uprawnienia: string[], uslugi: string[] | null) =>
  [uprawnienia.length ? uprawnienia.map((u) => UPRAWNIENIE[u] ?? u).join(", ") : "bez uprawnień", uslugi ? `tylko: ${uslugi.join(", ")}` : "całe konto"].join(" · ");

/**
 * F2.4 — członkowie zespołu klienta na karcie (Dostępy): subkonta, osoby z własnym kontem Verris i oczekujące
 * zaproszenia. Tylko odczyt — zmiany robi właściciel konta w swoim panelu. Odczyt jest w dzienniku (API).
 */
export function ZespolKlientaKarta({ zespol }: { zespol: ZespolKlienta | undefined }) {
  const pusto = zespol && zespol.subkonta.length + zespol.czlonkostwa.length + zespol.zaproszenia.length === 0;
  return (
    <section className={KARTA} aria-labelledby="zespol-klienta" data-karta="zespol">
      <NaglowekKarty id="zespol-klienta" tytul="Zespół klienta" />
      {zespol === undefined ? <NieWczytano co="zespołu klienta" /> : null}
      {pusto ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Klient nie dodał nikogo do swojego konta.</div> : null}
      {zespol?.subkonta.map((s) => (
        <div key={s.id} className={`${WIERSZ} flex-wrap`} data-zespol="subkonto">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{s.nazwa ?? s.email}{s.etykieta ? ` · ${s.etykieta}` : ""}</span>
            <span className="break-all font-mono text-[12px] text-muted-foreground">{s.email}</span>
            <span className="text-[12.5px] text-muted-foreground">{opis(s.uprawnienia, s.uslugi)}</span>
          </span>
          <Pigulka ton={s.wylaczone ? "muted" : "ok"} className="!text-xs">
            {s.wylaczone ? "subkonto wyłączone" : "subkonto"}
          </Pigulka>
        </div>
      ))}
      {zespol?.czlonkostwa.map((c) => (
        <div key={c.id} className={`${WIERSZ} flex-wrap`} data-zespol="czlonek">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-semibold">{c.nazwa ?? c.email}{c.etykieta ? ` · ${c.etykieta}` : ""}</span>
            <span className="break-all font-mono text-[12px] text-muted-foreground">{c.email}</span>
            <span className="text-[12.5px] text-muted-foreground">{opis(c.uprawnienia, c.uslugi)}</span>
          </span>
          <Pigulka ton="warn" className="!text-xs">
            własne konto Verris
          </Pigulka>
        </div>
      ))}
      {zespol?.zaproszenia.map((z) => (
        <div key={z.id} className={`${WIERSZ} flex-wrap`} data-zespol="zaproszenie">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="break-all font-mono text-[13px]">{z.email}{z.etykieta ? ` · ${z.etykieta}` : ""}</span>
            <span className="text-[12.5px] text-muted-foreground">{opis(z.uprawnienia, z.uslugi)} · ważne do {data(z.wygasa)}</span>
          </span>
          <Pigulka ton="muted" className="!text-xs">
            zaproszenie
          </Pigulka>
        </div>
      ))}
    </section>
  );
}
