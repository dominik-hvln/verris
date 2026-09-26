import Link from "next/link";
import { notFound } from "next/navigation";
import { UserCog } from "lucide-react";
import {
  INVOICE_STATUS_PL,
  TICKET_PRIORITY_PL,
  TICKET_STATUS_PL,
  WALLET_TX_STATUS_PL,
  WALLET_TX_TYPE_PL,
  etykieta,
} from "@verris/contracts";
import { formatCredits, formatPlnAndCredits } from "@/lib/credits";
import { AdminApiError, adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { Okruszek } from "@/components/admin-shell";
import { Eyebrow, KARTA, Kpi, LinkKarty, NaglowekKarty, Pigulka, PRZYCISK, PRZYCISK_GLOWNY, RzadKpi, WIERSZ, Zakladki } from "@/components/v2";
import { getCustomerOperationalDetail } from "../data";
import { CustomerOperationalForms } from "./operational-forms";
import { CreditWalletButton } from "../credit-wallet-button";
import { ImpersonateButton } from "../impersonate-button";
import { WarunkiIndywidualne, type PodgladWarunkow } from "./warunki-indywidualne";
import { rozliczeniePoza, ustawWarunki, zalozUsluge } from "./warunki-actions";
import { pobierzProfilKlienta, type ProfilKlienta } from "./profil-data";
import { NotatkaWewnetrzna } from "./notatka-wewnetrzna";

export const dynamic = "force-dynamic";

/**
 * PB-34 — karta klienta 1:1 z makiety AdminKlient.dc.html. Dane z tego samego widoku 360° co w panelu
 * obsługi (`/admin/users/:id/customer-profile`); formularze operacyjne i warunki indywidualne bez zmian,
 * tylko w zakładkach.
 */
const SEKCJE = ["przeglad", "uslugi", "rozliczenia", "warunki", "zgloszenia", "dostepy", "dziennik"] as const;
type Sekcja = (typeof SEKCJE)[number];
const STREFA = "Europe/Warsaw";

const data = (iso: string | null | undefined, rok = true) =>
  iso ? new Date(iso).toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", ...(rok ? { year: "numeric" } : {}), timeZone: STREFA }) : "—";
function kiedy(iso: string) {
  const d = new Date(iso);
  const dzien = (x: Date) => x.toLocaleDateString("pl-PL", { timeZone: STREFA });
  const godz = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: STREFA });
  return dzien(d) === dzien(new Date()) ? `dziś ${godz}` : `${data(iso, false)} ${godz}`;
}
/** Komponent serwerowy renderuje się raz na żądanie — „teraz” to chwila żądania. */
const chwila = () => Date.now();
const kwota = (v: string | number | null | undefined) => formatCredits(v ?? 0);

const STAN_USLUGI: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ACTIVE: { t: "działa", ton: "ok" },
  PROVISIONING: { t: "zakładanie", ton: "warn" },
  PENDING_PAYMENT: { t: "czeka na płatność", ton: "warn" },
  PAST_DUE: { t: "zaległa płatność", ton: "warn" },
  SUSPENDED: { t: "zawieszona", ton: "crit" },
  CANCELED: { t: "anulowana", ton: "muted" },
  EXPIRED: { t: "wygasła", ton: "muted" },
};
const ZRODLO: Record<string, string> = { WALLET: "portfel Verris", STRIPE_CARD: "karta (Stripe)", MANUAL: "przelew / poza Verris" };
const RODZAJ_OSI: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ticket: { t: "zgłoszenie", ton: "warn" },
  invoice: { t: "faktura", ton: "muted" },
  wallet: { t: "portfel", ton: "ok" },
  audit: { t: "zdarzenie", ton: "muted" },
};
const AKCJE: Record<string, string> = {
  SUBSCRIPTION_CUSTOM_TERMS: "Zmieniono warunki usługi",
  SUBSCRIPTION_CREATED: "Nowa usługa",
  SUBSCRIPTION_ACTIVATED: "Usługa uruchomiona",
  SUBSCRIPTION_SUSPENDED: "Usługa zawieszona",
  SUBSCRIPTION_UNSUSPENDED: "Usługa wznowiona",
  SUBSCRIPTION_CANCELED: "Usługa anulowana",
  SUBSCRIPTION_CANCEL_SCHEDULED: "Zaplanowano anulowanie usługi",
  PLAN_CHANGED: "Zmiana pakietu",
  EMAIL_CHANGE_CONFIRMED: "Zmiana adresu e-mail",
  RESELLER_CLIENT_CREATED: "Konto założone przez resellera",
  ADMIN_CUSTOMER_CREATED_BY_OPERATOR: "Konto założone przez operatora",
  PROMO_CODE_REDEEMED: "Użyto kodu promocyjnego",
  SLA_CREDIT_GRANTED: "Przyznano rekompensatę SLA",
  HOSTING_RESTORE_COMPLETED: "Odtworzono kopię",
};

function wpisOsi(e: ProfilKlienta["customerTimeline"][number]) {
  if (e.kind === "wallet") return { tekst: `${etykieta(WALLET_TX_TYPE_PL, e.code)} ${e.meta}`, kod: false };
  if (e.kind === "invoice") return { tekst: `${e.title} · ${etykieta(INVOICE_STATUS_PL, e.code)} · ${e.meta}`, kod: false };
  if (e.kind === "ticket") return { tekst: `„${e.title}” · ${etykieta(TICKET_STATUS_PL, e.code)}`, kod: false };
  return AKCJE[e.code] ? { tekst: AKCJE[e.code], kod: false } : { tekst: e.code, kod: true };
}

export default async function AdminCustomerCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ sekcja?: string }>;
}) {
  const { userId } = await params;
  const q = await searchParams;
  const sekcja: Sekcja = (SEKCJE as readonly string[]).includes(q.sekcja ?? "") ? (q.sekcja as Sekcja) : "przeglad";

  let p: ProfilKlienta;
  let detail: Awaited<ReturnType<typeof getCustomerOperationalDetail>>;
  try {
    [p, detail] = await Promise.all([pobierzProfilKlienta(userId), getCustomerOperationalDetail(userId)]);
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 404 || e.status === 400)) notFound();
    return <BladStrony blad={e} tytul="Klient" powrot={{ href: "/customers", label: "Klienci" }} />;
  }
  // PB-27 / PB-28 — sekcja tylko dla admina i pracownika z CUSTOM_TERMS_MANAGE (403 = bez sekcji).
  const warunki = await adminApi<PodgladWarunkow>(`/admin/custom-terms/user/${encodeURIComponent(userId)}`).catch(() => null);

  const u = p.user;
  const osoba = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  const nazwa = u.companyName?.trim() || osoba || u.email;
  const inicjaly = (nazwa.match(/\p{L}+/gu) ?? [nazwa]).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  const baza = `/customers/${u.id}`;
  const teraz = chwila();

  const zywe = p.subscriptions.filter((s) => !["CANCELED", "EXPIRED"].includes(s.status));
  const aktywne = p.subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE");
  const odnowienia = aktywne.map((s) => s.currentPeriodEnd).filter((x): x is string => !!x).sort();
  const indywidualne = p.subscriptions.filter((s) => s.individualPrice != null || (s.autoscalingDiscountPct ?? 0) > 0);
  const serweryZAwaria = new Set(p.statusPageOpenIncidents.map((i) => i.serverId));
  const otwarteZgl = p.recentTickets.filter((t) => t.status !== "CLOSED");
  const poTerminie = otwarteZgl.filter((t) => !t.firstResponseAt && t.slaResponseDueAt && new Date(t.slaResponseDueAt).getTime() < teraz);
  const kondycja = Math.max(0, 100 - p.supportInsights.riskScore);
  const zrodla = [...new Set(zywe.map((s) => ZRODLO[s.paymentSource] ?? s.paymentSource))];
  const obsluga = process.env.NEXT_PUBLIC_STAFF_PANEL_URL?.trim() || "https://staff.verris.pl";
  const zgloszenieHref = (id: string) => new URL(`/tickets/${id}`, obsluga).toString();

  const wierszUslugi = (s: ProfilKlienta["subscriptions"][number]) => {
    const st = s.account?.server && serweryZAwaria.has(s.account.server.id) && s.status === "ACTIVE" ? { t: "awaria", ton: "crit" as const } : STAN_USLUGI[s.status] ?? { t: s.status, ton: "muted" as const };
    const cena = s.individualPrice ?? s.priceAmount;
    const okres = s.interval === "YEAR" ? "rok" : "mies.";
    const dopisek = [
      s.individualPrice != null && s.listPriceAmount ? `cennik ${kwota(s.listPriceAmount).replace(/ K$/, "")}` : null,
      s.autoscalingDiscountPct ? `autoskal. −${s.autoscalingDiscountPct}%` : null,
    ].filter(Boolean);
    return (
      <div key={s.id} className={WIERSZ}>
        <Link href={`/subscriptions/${s.id}`} className="flex min-w-0 flex-1 flex-col hover:underline">
          <span className="font-semibold">{s.account?.domain ?? s.serviceTag ?? s.plan.name}</span>
          <span className="text-[12.5px] text-muted-foreground">
            {[s.plan.name, s.account?.server ? s.account.server.name ?? s.account.server.ipAddress : null].filter(Boolean).join(" · ")}
          </span>
        </Link>
        <span className="flex w-[120px] flex-col sm:w-[150px]">
          <span className="font-mono text-[13px]">
            {kwota(cena)} / {okres}
          </span>
          {dopisek.length ? <span className="text-xs text-muted-foreground">{dopisek.join(" · ")}</span> : null}
        </span>
        <span className="hidden w-[110px] font-mono text-[13px] sm:block">{data(s.cancelAt ?? s.currentPeriodEnd)}</span>
        <span className="w-[100px]">
          <Pigulka ton={st.ton} className="!text-xs">
            {s.cancelAt && s.status === "ACTIVE" ? "do końca okresu" : st.t}
          </Pigulka>
        </span>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={nazwa} />
      <div className="flex flex-wrap items-end gap-4">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-verris-green font-display text-[22px] font-bold text-verris-paper">
          {inicjaly}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>
            Klient od {data(u.createdAt)}
            {u.reseller ? ` · przez resellera ${u.reseller.nazwa}` : ""}
          </Eyebrow>
          <h1 className="text-[28px] lg:text-[34px]">{nazwa}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-verris-body">
            <span className="break-all font-mono">{u.email}</span>
            {u.companyName && osoba ? <span className="text-muted-foreground">· {osoba}</span> : null}
            <Pigulka ton={u.isTwoFactorEnabled ? "ok" : "warn"} className="!text-xs">
              {u.isTwoFactorEnabled ? "2FA włączone" : "bez 2FA"}
            </Pigulka>
            {indywidualne.length ? (
              <Pigulka ton="muted" className="!text-xs">
                warunki indywidualne
              </Pigulka>
            ) : null}
            {detail.isInternal ? (
              <Pigulka ton="muted" className="!text-xs">
                konto wewnętrzne
              </Pigulka>
            ) : null}
            {u.loginBlocked ? (
              <Pigulka ton="crit" className="!text-xs">
                logowanie zablokowane
              </Pigulka>
            ) : null}
            {u.deletionRequestedAt ? (
              <Pigulka ton="warn" className="!text-xs">
                wniosek o usunięcie z {data(u.deletionRequestedAt)}
              </Pigulka>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2.5">
          <CreditWalletButton userId={u.id} email={u.email} currentBalance={u.walletBalance} className={PRZYCISK} etykieta="Dodaj kredyty" />
          <a href={`mailto:${u.email}`} className={PRZYCISK}>
            Napisz do klienta
          </a>
          <ImpersonateButton userId={u.id} email={u.email} accountRole="USER" className={PRZYCISK_GLOWNY} etykieta="Zaloguj jako klient" />
        </div>
      </div>

      <RzadKpi etykieta="Podsumowanie klienta">
        <Kpi
          etykieta="Saldo portfela"
          wartosc={Number(u.walletBalance).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          jednostka="K"
          opis={u.autoDoladowanie ? `auto-doładowanie przy ${kwota(u.autoDoladowanie.prog)}` : "bez auto-doładowania"}
        />
        <Kpi
          etykieta="Usługi"
          wartosc={aktywne.length}
          jednostka="aktywne"
          opis={odnowienia[0] ? `najbliższe odnowienie ${data(odnowienia[0], false)}` : zywe.length ? `${zywe.length - aktywne.length} w innym stanie` : "brak usług"}
        />
        <Kpi etykieta="Kondycja" wartosc={kondycja} jednostka="/ 100">
          <span
            className={`text-[13px] ${p.supportInsights.riskLevel === "high" ? "text-crit" : p.supportInsights.riskLevel === "medium" ? "text-warn" : "text-data-hi"}`}
            title={p.supportInsights.reasons.join(" · ") || undefined}
          >
            {p.supportInsights.riskLevel === "high" ? "wysokie ryzyko odejścia" : p.supportInsights.riskLevel === "medium" ? "średnie ryzyko odejścia" : "niskie ryzyko odejścia"}
          </span>
        </Kpi>
        <Kpi etykieta="Zgłoszenia" wartosc={otwarteZgl.length} jednostka="otwarte">
          {poTerminie[0] ? (
            <a href={zgloszenieHref(poTerminie[0].id)} className="text-[13px] font-semibold text-crit hover:underline">
              #{poTerminie[0].id.slice(0, 8)} — po terminie SLA →
            </a>
          ) : otwarteZgl[0] ? (
            <a href={zgloszenieHref(otwarteZgl[0].id)} className="text-[13px] font-semibold text-data-hi hover:underline">
              #{otwarteZgl[0].id.slice(0, 8)} — {etykieta(TICKET_STATUS_PL, otwarteZgl[0].status).toLowerCase()} →
            </a>
          ) : (
            <span className="text-[13px] text-muted-foreground">nic otwartego</span>
          )}
        </Kpi>
      </RzadKpi>

      <Zakladki
        etykieta="Sekcje klienta"
        pozycje={[
          { nazwa: "Przegląd", href: baza, on: sekcja === "przeglad" },
          { nazwa: `Usługi (${zywe.length})`, href: `${baza}?sekcja=uslugi`, on: sekcja === "uslugi" },
          { nazwa: "Rozliczenia", href: `${baza}?sekcja=rozliczenia`, on: sekcja === "rozliczenia" },
          ...(warunki ? [{ nazwa: "Warunki indywidualne", href: `${baza}?sekcja=warunki`, on: sekcja === "warunki" }] : []),
          { nazwa: "Zgłoszenia", href: `${baza}?sekcja=zgloszenia`, on: sekcja === "zgloszenia", licznik: poTerminie.length || undefined },
          { nazwa: "Dostępy i bezpieczeństwo", href: `${baza}?sekcja=dostepy`, on: sekcja === "dostepy" },
          { nazwa: "Dziennik", href: `${baza}?sekcja=dziennik`, on: sekcja === "dziennik" },
        ]}
      />

      {sekcja === "przeglad" ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5">
            <section className={KARTA} aria-labelledby="us">
              <NaglowekKarty id="us" tytul="Usługi">
                {warunki ? (
                  <Link href={`${baza}?sekcja=warunki`} className={`${PRZYCISK} ml-auto !h-[34px] !text-[13px]`}>
                    Załóż usługę klientowi
                  </Link>
                ) : null}
              </NaglowekKarty>
              <div className={`${WIERSZ} !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
                <span className="flex-1">Usługa</span>
                <span className="w-[120px] sm:w-[150px]">Cena klienta</span>
                <span className="hidden w-[110px] sm:block">Odnowienie</span>
                <span className="w-[100px]">Stan</span>
              </div>
              {zywe.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Klient nie ma aktywnych usług.</div> : zywe.map(wierszUslugi)}
            </section>

            <section className={KARTA} aria-labelledby="tl">
              <NaglowekKarty id="tl" tytul="Oś czasu">
                <LinkKarty href={`${baza}?sekcja=dziennik`}>Pełny dziennik →</LinkKarty>
              </NaglowekKarty>
              {p.customerTimeline.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zdarzeń.</div> : null}
              {p.customerTimeline.slice(0, 6).map((e) => {
                const w = wpisOsi(e);
                const r = RODZAJ_OSI[e.kind] ?? { t: e.kind, ton: "muted" as const };
                return (
                  <div key={e.id} className={WIERSZ}>
                    <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(e.createdAt)}</span>
                    <Pigulka ton={r.ton} kropka={false} className="!text-[11px]">
                      {r.t}
                    </Pigulka>
                    <span className={`flex-1 text-sm ${w.kod ? "font-mono text-[13px]" : ""}`}>{w.tekst}</span>
                  </div>
                );
              })}
            </section>
          </div>

          <div className="flex flex-col gap-5">
            <section className={`${KARTA} flex flex-col gap-2.5 p-[18px]`} aria-labelledby="war">
              <div className="flex items-center">
                <h2 id="war" className="font-display text-[17px] font-bold">
                  Rozliczenie
                </h2>
                <LinkKarty href={`${baza}?sekcja=rozliczenia`}>Szczegóły</LinkKarty>
              </div>
              <Para k="Sposób" v={zrodla.join(", ") || "—"} />
              <Para k="Warunki indywidualne" v={indywidualne.length ? `${indywidualne.length} ${indywidualne.length === 1 ? "usługa" : "usług(i)"}` : "brak"} />
              <Para k="Dane do faktury" v={u.companyName && u.nip ? `komplet · NIP ${u.nip}` : u.nip ? `NIP ${u.nip} · bez nazwy firmy` : "osoba prywatna / brak NIP"} />
              <Para k="Metoda płatności" v={p.paymentMethods.find((m) => m.isDefault) ? `${p.paymentMethods.find((m) => m.isDefault)!.brand ?? "karta"} •••• ${p.paymentMethods.find((m) => m.isDefault)!.last4 ?? ""}` : "brak zapisanej"} />
            </section>

            <section className={`${KARTA} flex flex-col gap-2.5 p-[18px]`} aria-labelledby="nt">
              <h2 id="nt" className="font-display text-[17px] font-bold">
                Notatka wewnętrzna
              </h2>
              <NotatkaWewnetrzna userId={u.id} poczatkowa={detail.adminInternalNote ?? ""} />
            </section>

            <section className={KARTA} aria-labelledby="wr">
              <div className="flex flex-col px-[18px] py-4">
                <h2 id="wr" className="font-display text-[17px] font-bold">
                  Operacje wrażliwe
                </h2>
                <span className="text-[13px] text-muted-foreground">każda wymaga powodu i trafia do dziennika</span>
              </div>
              {[
                { t: "Reset hasła", a: "Resetuj…", h: "reset" },
                { t: "Zmiana adresu e-mail", a: "Zmień…", h: "email" },
                { t: u.loginBlocked ? "Odblokowanie logowania" : "Blokada logowania", a: u.loginBlocked ? "Odblokuj…" : "Zablokuj…", h: "blokada" },
              ].map((o) => (
                <div key={o.h} className={WIERSZ}>
                  <span className="flex-1">{o.t}</span>
                  <Link href={`${baza}?sekcja=dostepy#${o.h}`} className={`${PRZYCISK} !h-8 !text-[13px]`}>
                    {o.a}
                  </Link>
                </div>
              ))}
              <div className={WIERSZ}>
                <span className="flex-1 text-crit">Usunięcie konta (RODO)</span>
                <Link href={`${baza}?sekcja=dostepy#usuniecie`} className={`${PRZYCISK} !h-8 !border-[color-mix(in_srgb,var(--crit)_40%,transparent)] !text-[13px] !text-crit`}>
                  Usuń…
                </Link>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {sekcja === "uslugi" ? (
        <section className={KARTA} aria-label="Wszystkie usługi">
          <div className={`${WIERSZ} !border-t-0 !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
            <span className="flex-1">Usługa</span>
            <span className="w-[120px] sm:w-[150px]">Cena klienta</span>
            <span className="hidden w-[110px] sm:block">Odnowienie</span>
            <span className="w-[100px]">Stan</span>
          </div>
          {p.subscriptions.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak usług.</div> : p.subscriptions.map(wierszUslugi)}
          {p.domains.length ? (
            <div className={`${WIERSZ} flex-wrap text-sm`}>
              <span className="text-muted-foreground">Domeny:</span>
              {p.domains.map((d) => (
                <span key={d.id} className="font-mono text-[13px]">
                  {d.name}
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {sekcja === "rozliczenia" ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <section className={KARTA} aria-labelledby="portfel">
            <NaglowekKarty id="portfel" tytul="Portfel">
              <span className="ml-auto font-mono text-[13px]">{formatPlnAndCredits(u.walletBalance, u.walletCurrency)}</span>
            </NaglowekKarty>
            {p.walletLedger.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak operacji.</div> : null}
            {p.walletLedger.map((w) => (
              <div key={w.id} className={WIERSZ}>
                <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(w.createdAt)}</span>
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <span>{etykieta(WALLET_TX_TYPE_PL, w.type)}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {[w.description, etykieta(WALLET_TX_STATUS_PL, w.status)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className={`font-mono text-[13px] ${Number(w.amount) < 0 ? "" : "text-data-hi"}`}>{kwota(w.amount)}</span>
              </div>
            ))}
          </section>
          <div className="flex flex-col gap-5">
            <section className={KARTA} aria-labelledby="faktury">
              <NaglowekKarty id="faktury" tytul="Faktury" />
              {p.recentInvoices.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak faktur.</div> : null}
              {p.recentInvoices.map((f) => (
                <div key={f.id} className={WIERSZ}>
                  <span className="flex-1 font-mono text-[13px]">{f.number}</span>
                  <span className="text-[13px] text-muted-foreground">{etykieta(INVOICE_STATUS_PL, f.status)}</span>
                  <span className="w-[110px] text-right font-mono text-[13px]">{formatPlnAndCredits(f.amount, f.currency)}</span>
                </div>
              ))}
            </section>
            <section className={KARTA} aria-labelledby="metody">
              <NaglowekKarty id="metody" tytul="Metody płatności" />
              {p.paymentMethods.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zapisanych metod.</div> : null}
              {p.paymentMethods.map((m) => (
                <div key={m.id} className={WIERSZ}>
                  <span className="flex-1 text-sm">
                    {m.brand ?? m.provider} •••• {m.last4 ?? "—"}
                    {m.expMonth && m.expYear ? <span className="text-muted-foreground"> · ważna do {String(m.expMonth).padStart(2, "0")}/{m.expYear}</span> : null}
                  </span>
                  {m.isDefault ? (
                    <Pigulka ton="ok" className="!text-xs">
                      domyślna
                    </Pigulka>
                  ) : null}
                </div>
              ))}
            </section>
          </div>
        </div>
      ) : null}

      {sekcja === "warunki" && warunki ? (
        <WarunkiIndywidualne userId={u.id} dane={warunki} akcje={{ zaloz: zalozUsluge, ustaw: ustawWarunki, poza: rozliczeniePoza }} />
      ) : null}

      {sekcja === "zgloszenia" ? (
        <section className={KARTA} aria-label="Zgłoszenia klienta">
          {p.recentTickets.length === 0 ? <div className={`${WIERSZ} !border-t-0 text-sm text-muted-foreground`}>Klient nie pisał jeszcze do obsługi.</div> : null}
          {p.recentTickets.map((t, i) => {
            const po = !t.firstResponseAt && t.status !== "CLOSED" && t.slaResponseDueAt && new Date(t.slaResponseDueAt).getTime() < teraz;
            return (
              <a key={t.id} href={zgloszenieHref(t.id)} className={`${WIERSZ} ${i === 0 ? "!border-t-0" : ""} hover:bg-raised`}>
                <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(t.createdAt)}</span>
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <span className="font-semibold">{t.subject}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    #{t.id.slice(0, 8)} · {etykieta(TICKET_PRIORITY_PL, t.priority)} · {t.replyCount} odp.
                  </span>
                </span>
                {po ? (
                  <Pigulka ton="crit" className="!text-xs">
                    po terminie SLA
                  </Pigulka>
                ) : (
                  <Pigulka ton={t.status === "CLOSED" ? "muted" : "warn"} className="!text-xs">
                    {etykieta(TICKET_STATUS_PL, t.status).toLowerCase()}
                  </Pigulka>
                )}
              </a>
            );
          })}
        </section>
      ) : null}

      {sekcja === "dostepy" ? (
        <>
          <section className={`${KARTA} flex flex-col gap-2 p-5`} aria-label="Dostęp do konta">
            <Para k="Logowanie dwuetapowe (2FA)" v={u.isTwoFactorEnabled ? "włączone" : "wyłączone"} />
            <Para k="Logowanie" v={u.loginBlocked ? `zablokowane${u.loginBlockedReason ? ` — ${u.loginBlockedReason}` : ""}` : "dozwolone"} />
            <Para k="Klient Stripe" v={u.stripeCustomerId ?? "—"} mono />
            <Para k="ID konta" v={u.id} mono />
          </section>
          <CustomerOperationalForms detail={detail} />
        </>
      ) : null}

      {sekcja === "dziennik" ? (
        <section className={KARTA} aria-label="Dziennik klienta">
          {p.auditTrail.length === 0 ? <div className={`${WIERSZ} !border-t-0 text-sm text-muted-foreground`}>Brak wpisów.</div> : null}
          {p.auditTrail.map((a, i) => (
            <div key={a.id} className={`${WIERSZ} ${i === 0 ? "!border-t-0" : ""} items-start`}>
              <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(a.createdAt)}</span>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span>{AKCJE[a.action] ?? <span className="font-mono text-[13px]">{a.action}</span>}</span>
                <span className="break-all font-mono text-[11.5px] text-muted-foreground">
                  {[a.ipAddress, a.details ? JSON.stringify(a.details).slice(0, 220) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
            </div>
          ))}
          <p className="flex items-center gap-2 border-t border-line px-[18px] py-3 text-xs text-muted-foreground">
            <UserCog className="h-3.5 w-3.5" />
            Każda operacja na koncie jest zapisywana (kody ADMIN_CUSTOMER_*). Pełny dziennik platformy:{" "}
            <Link href="/audit" className="underline">
              Dziennik bezpieczeństwa
            </Link>
            .
          </p>
        </section>
      ) : null}
    </div>
  );
}

function Para({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-all text-right ${mono ? "font-mono text-[13px]" : ""}`}>{v}</span>
    </div>
  );
}
