import Link from "next/link";
import { KARTA, NaglowekKarty, Pigulka, WIERSZ } from "@/components/v2";
import type { LoginHistoryResponse } from "../../operators/[id]/data";

/**
 * Fala 1B (plan rozbudowy, sekcja 3a) — gotowe endpointy API na karcie klienta: maile wysłane do klienta
 * (GET /admin/email-log/user/:id i /admin/email-log/:id — tokeny i linki jednorazowe maskuje API),
 * historia logowań (GET /admin/users/:id/login-history) i „Kto oglądał” (GET /admin/users/:id/staff-audit).
 * Bez "use client" — renderuje Server Component karty. `undefined` = nie udało się odczytać.
 */
const STREFA = "Europe/Warsaw";
const kiedy = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: STREFA, dateStyle: "short", timeStyle: "short" }) : "—");

export interface MailKlienta {
  id: string;
  category: string;
  tag: string | null;
  subject: string;
  status: string;
  createdAt: string;
  sentAt: string | null;
  errorMessage: string | null;
}

/** GET /admin/email-log/:id — temat, błąd i metadata zamaskowane w API. */
export interface PodgladMaila extends MailKlienta {
  toEmail: string;
  userId: string | null;
  providerId: string | null;
  messageId: string | null;
  campaignId: string | null;
  metadata: Record<string, unknown> | null;
}

const STATUS_MAILA: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  SENT: { t: "wysłany", ton: "ok" },
  QUEUED: { t: "w kolejce", ton: "warn" },
  SUPPRESSED: { t: "wstrzymany", ton: "muted" },
  FAILED: { t: "nieudany", ton: "crit" },
  BOUNCED: { t: "odbity", ton: "crit" },
};
const RODZAJ_MAILA: Record<string, string> = { TRANSACTIONAL: "systemowy", MARKETING: "marketing", PRODUCT_UPDATE: "zmiany usługi" };
const stanMaila = (s: string) => STATUS_MAILA[s] ?? { t: s, ton: "muted" as const };

const Brak = ({ children, pierwszy }: { children: React.ReactNode; pierwszy?: boolean }) => (
  <div className={`${WIERSZ} ${pierwszy ? "!border-t-0" : ""} text-sm text-muted-foreground`}>{children}</div>
);

export function KomunikacjaKlienta({ baza, maile, podglad }: { baza: string; maile: MailKlienta[] | undefined; podglad: PodgladMaila | null | undefined }) {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" data-karta="komunikacja">
      <section className={KARTA} aria-labelledby="maile">
        <NaglowekKarty id="maile" tytul="Maile do klienta" />
        {maile === undefined ? <Brak>Nie udało się wczytać dziennika poczty.</Brak> : maile.length === 0 ? <Brak>Do klienta nie wysłano jeszcze żadnego maila.</Brak> : null}
        {maile?.map((m) => {
          const st = stanMaila(m.status);
          return (
            <Link key={m.id} href={`${baza}?sekcja=komunikacja&mail=${encodeURIComponent(m.id)}#podglad`} className={`${WIERSZ} hover:bg-raised ${podglad?.id === m.id ? "bg-raised" : ""}`} data-mail={m.id}>
              <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(m.sentAt ?? m.createdAt)}</span>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span className="truncate font-semibold">{m.subject}</span>
                <span className="text-[12.5px] text-muted-foreground">{[RODZAJ_MAILA[m.category] ?? m.category, m.tag].filter(Boolean).join(" · ")}</span>
              </span>
              <Pigulka ton={st.ton} className="!text-xs">
                {st.t}
              </Pigulka>
            </Link>
          );
        })}
      </section>
      <section id="podglad" className={`${KARTA} flex scroll-mt-24 flex-col gap-2.5 p-[18px]`} aria-labelledby="podglad-naglowek">
        <h2 id="podglad-naglowek" className="font-display text-[17px] font-bold">
          Podgląd
        </h2>
        {podglad === null ? (
          <p className="text-[13px] text-muted-foreground">Wybierz mail z listy.</p>
        ) : podglad === undefined ? (
          <p className="text-[13px] text-muted-foreground">Nie udało się wczytać maila.</p>
        ) : (
          <>
            <Para k="Temat" v={podglad.subject} />
            <Para k="Do" v={podglad.toEmail} mono />
            <Para k="Stan" v={stanMaila(podglad.status).t} />
            <Para k="Rodzaj" v={[RODZAJ_MAILA[podglad.category] ?? podglad.category, podglad.tag].filter(Boolean).join(" · ")} />
            <Para k="Utworzony" v={kiedy(podglad.createdAt)} />
            <Para k="Wysłany" v={kiedy(podglad.sentAt)} />
            {podglad.errorMessage ? <Para k="Błąd" v={podglad.errorMessage} /> : null}
            {podglad.messageId ? <Para k="Message-Id" v={podglad.messageId} mono /> : null}
            {Object.entries(podglad.metadata ?? {}).map(([k, v]) => (
              <Para key={k} k={k} v={typeof v === "string" ? v : JSON.stringify(v)} mono />
            ))}
            <p className="text-xs text-muted-foreground">Linki jednorazowe i tokeny są zamaskowane; treści maila dziennik nie przechowuje.</p>
          </>
        )}
      </section>
    </div>
  );
}

// Jak REASON_LABELS na karcie operatora (operators/[id]/page.tsx).
const POWOD_PORAZKI: Record<string, string> = {
  unknown_user: "nieznany e-mail",
  bad_password: "błędne hasło",
  "2fa_failed": "błędny kod 2FA",
  too_many_attempts: "limit prób",
  session_expired: "sesja wygasła",
};

export function LogowaniaKlienta({ historia }: { historia: LoginHistoryResponse | undefined }) {
  return (
    <section id="logowania" className={`${KARTA} scroll-mt-24`} aria-labelledby="logowania-naglowek" data-karta="logowania">
      <NaglowekKarty id="logowania-naglowek" tytul="Historia logowań (30 dni)">
        {historia?.lockout.currentlyLockedOut ? (
          <Pigulka ton="crit" className="ml-auto !text-xs">
            blokada po {historia.lockout.recentFailures} nieudanych próbach
          </Pigulka>
        ) : null}
      </NaglowekKarty>
      {historia === undefined ? <Brak>Nie udało się wczytać historii logowań.</Brak> : historia.rows.length === 0 ? <Brak>Brak logowań w ostatnich 30 dniach.</Brak> : null}
      {historia?.suspiciousAlerts.length ? (
        <div className={`${WIERSZ} text-sm text-warn`}>Podejrzane logowania: {historia.suspiciousAlerts.length} — ostatnie {kiedy(historia.suspiciousAlerts[0]!.createdAt)}.</div>
      ) : null}
      {historia?.rows.slice(0, 50).map((r) => (
        <div key={r.id} className={WIERSZ}>
          <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(r.occurredAt)}</span>
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="font-mono text-[13px]">
              {r.ip ?? "—"}
              {r.countryCode ? ` · ${r.countryCode}` : ""}
            </span>
            <span className="truncate text-[12.5px] text-muted-foreground">{r.userAgent ?? "—"}</span>
          </span>
          {r.isNewDevice ? (
            <Pigulka ton="warn" kropka={false} className="!text-[11px]">
              nowe urządzenie
            </Pigulka>
          ) : null}
          <Pigulka ton={r.kind === "success" ? "ok" : "crit"} className="!text-xs">
            {r.kind === "success" ? (r.method ?? "udane") : (POWOD_PORAZKI[r.reason ?? ""] ?? r.reason ?? "nieudane")}
          </Pigulka>
        </div>
      ))}
    </section>
  );
}

/** Odpowiedź GET /admin/users/:id/staff-audit (ADMIN: wszystkie wpisy konta). */
export interface DziennikOperatorow {
  rows: Array<{ id: string; action: string; actorUserId: string | null; actorEmail?: string | null; impersonatedBy: string | null; details: Record<string, unknown> | null; createdAt: string }>;
}

const OTWARCIA: Record<string, string> = {
  OPERATOR_CUSTOMER_CARD_VIEWED: "karta klienta",
  OPERATOR_ACCOUNT_VIEWED: "konto hostingu",
  USER_IMPERSONATION_STARTED: "logowanie jako klient",
};

/** Wpisy „operator otworzył kartę / konto / wszedł jako klient” — reszta dziennika jest w zakładce wyżej. */
export function ktoOgladal(d: DziennikOperatorow | undefined) {
  return d?.rows.filter((r) => r.action in OTWARCIA && !!r.actorUserId);
}

export function KtoOgladal({ dziennik }: { dziennik: DziennikOperatorow | undefined }) {
  const wpisy = ktoOgladal(dziennik);
  return (
    <section className={KARTA} aria-labelledby="kto-ogladal" data-karta="kto-ogladal">
      <NaglowekKarty id="kto-ogladal" tytul="Kto oglądał" />
      {wpisy === undefined ? <Brak>Nie udało się wczytać dziennika operatorów.</Brak> : wpisy.length === 0 ? <Brak>Nikt z zespołu nie otwierał danych klienta.</Brak> : null}
      {wpisy?.map((r) => (
        <div key={r.id} className={WIERSZ}>
          <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(r.createdAt)}</span>
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            {r.actorUserId ? (
              <Link href={`/operators/${r.actorUserId}`} className="font-mono text-[13px] hover:underline">
                {r.actorEmail ?? r.actorUserId}
              </Link>
            ) : null}
            <span className="text-[12.5px] text-muted-foreground">{OTWARCIA[r.action]}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

function Para({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className={`min-w-0 text-right [overflow-wrap:anywhere] ${mono ? "font-mono text-[13px]" : ""}`}>{v}</span>
    </div>
  );
}
