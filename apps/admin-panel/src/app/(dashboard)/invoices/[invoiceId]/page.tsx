import Link from "next/link";
import { notFound } from "next/navigation";
import { INVOICE_STATUS_PL, WALLET_TX_STATUS_PL, etykieta, etykietaWpisuPortfela } from "@verris/contracts";
import { AdminApiError, adminApi } from "@/lib/api";
import { formatPlnAndCredits } from "@/lib/credits";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { AKCJE_FAKTURY, type FakturaDlaAkcji } from "@/lib/akcje/faktura";
import { Okruszek } from "@/components/admin-shell";
import { BladStrony } from "@/components/blad-strony";
import { LinkJesli } from "@/components/link-jesli";
import { Eyebrow, KARTA, LinkKarty, NaglowekKarty, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import type { AdminInvoiceRow } from "../data";
import type { KorektaRow } from "./korekta/data";
import { AnulujDokument, DokonczFakture, PonowKsef } from "./dzialania-faktury";
import { Pomoc } from "@/components/pomoc";

export const dynamic = "force-dynamic";

export interface FakturaSzczegoly extends AdminInvoiceRow {
  kind: string;
  korygowana: { id: string; number: string } | null;
  externalInvoiceNumber?: string | null;
  ksef: { status: string; numer: string | null; blad: string | null; wyslano: string | null; przyjeto: string | null; terminDo: string | null };
  platnosci: Array<{ id: string; type: string; status: string; amount: string; paymentProvider: string | null; description: string | null; createdAt: string }>;
}

const KSEF: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  NOT_APPLICABLE: { t: "nie dotyczy", ton: "muted" },
  PENDING: { t: "czeka na wysyłkę", ton: "warn" },
  SUBMITTED: { t: "wysłana, czeka na numer", ton: "warn" },
  ACCEPTED: { t: "przyjęta", ton: "ok" },
  REJECTED: { t: "odrzucona", ton: "crit" },
  OFFLINE: { t: "offline — do dosłania", ton: "warn" },
};
const TON_STATUSU: Record<string, "ok" | "warn" | "crit" | "muted"> = { PAID: "ok", OPEN: "warn", DRAFT: "muted", VOID: "muted", UNCOLLECTIBLE: "crit" };
const kiedy = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—");

/**
 * Strona faktury (plan E, patch 10). PDF, korekta, anulowanie (z listy faktur) i ponowienie KSeF (wcześniej
 * tylko w „Danych firmy”) w jednym miejscu; stan KSeF, płatności pokryte fakturą, korekty, klient i usługa.
 * Wynik wyszukiwarki i faktury na karcie klienta prowadzą tutaj.
 */
export default async function FakturaPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  let f: FakturaSzczegoly;
  try {
    f = await adminApi<FakturaSzczegoly>(`/admin/invoices/${encodeURIComponent(invoiceId)}`);
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 404 || e.status === 400)) notFound();
    return <BladStrony blad={e} tytul="Faktura" powrot={{ href: "/invoices", label: "Faktury" }} />;
  }
  const [dostep, korekty] = await Promise.all([
    fetchStaffAccess(),
    f.kind === "KOREKTA" ? ([] as KorektaRow[]) : adminApi<KorektaRow[]>(`/admin/invoices/${encodeURIComponent(f.id)}/korekty`).catch(() => [] as KorektaRow[]),
  ]);

  const obiekt: FakturaDlaAkcji = { id: f.id, status: f.status, kind: f.kind, ksefStatus: f.ksef.status, maPdf: f.hasVerrisPdf, klientId: f.user.id };
  const akcja = (id: string) => {
    const a = AKCJE_FAKTURY.find((x) => x.id === id)!;
    return a.kiedy(obiekt) ? { zablokowane: brakUprawnienia(a.perm, dostep), href: a.href(obiekt) } : null;
  };
  const pdf = akcja("pdf");
  const korekta = akcja("korekta");
  const anuluj = akcja("anuluj");
  const ksef = akcja("ksef");
  const upo = akcja("upo");
  const dokoncz = akcja("dokoncz");
  // Wniosek o anulowanie składa się z CUSTOMERS_VIEW (rejestr wniosków API: doZlozenia).
  const wniosekAnulowania = !!anuluj?.zablokowane && !brakUprawnienia("CUSTOMERS_VIEW", dostep);
  const nabywca = f.user.companyName ?? f.user.name ?? f.user.email;
  // Strona faktury wymaga BILLING_VIEW — karta klienta i usługi mogą być poza rolą (link bez drogi do odmowy).
  const doKlienta = !brakUprawnienia("CUSTOMERS_VIEW", dostep);
  const doUslugi = !brakUprawnienia(["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], dostep);
  const stanKsef = KSEF[f.ksef.status] ?? { t: f.ksef.status, ton: "muted" as const };

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={f.number} mono />
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>{f.kind === "KOREKTA" ? "Faktura korygująca" : "Faktura"}</Eyebrow>
          <h1 className="break-all text-[28px] lg:text-[34px]" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            {f.number}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-verris-body">
            <Pigulka ton={TON_STATUSU[f.status] ?? "muted"} className="!text-xs">
              {etykieta(INVOICE_STATUS_PL, f.status)}
            </Pigulka>
            {f.ksef.status !== "NOT_APPLICABLE" ? (
              <Pigulka ton={stanKsef.ton} className="!text-xs">
                KSeF: {stanKsef.t}
              </Pigulka>
            ) : null}
            <LinkJesli wolno={doKlienta} href={`/customers/${f.user.id}`} className="hover:underline">
              {nabywca}
            </LinkJesli>
          </div>
        </div>
      </div>

      <section className={`${KARTA} grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2 xl:grid-cols-4`} aria-label="Dane faktury">
        <Para k="Kwota brutto">{formatPlnAndCredits(f.amount, f.currency)}</Para>
        <Para k="Wystawiona">{kiedy(f.issuedAt)}</Para>
        <Para k="Termin">{kiedy(f.dueAt)}</Para>
        <Para k="Zapłacona">{kiedy(f.paidAt)}</Para>
        <Para k="Nabywca">
          <LinkJesli wolno={doKlienta} href={`/customers/${f.user.id}`} className="hover:underline">
            {f.user.email}
          </LinkJesli>
        </Para>
        <Para k="Usługa">
          {f.subscription ? (
            <LinkJesli wolno={doUslugi} href={`/subscriptions/${f.subscription.id}`} className="hover:underline">
              {f.subscription.domain ?? f.subscription.planName ?? "usługa"}
            </LinkJesli>
          ) : (
            "—"
          )}
        </Para>
        {f.korygowana ? (
          <Para k="Koryguje">
            <Link href={`/invoices/${f.korygowana.id}`} className="font-mono hover:underline">
              {f.korygowana.number}
            </Link>
          </Para>
        ) : null}
        {f.externalInvoiceNumber ? <Para k="Faktura VAT (program księgowy)">{f.externalInvoiceNumber}</Para> : null}
      </section>

      <section className={`${KARTA} flex flex-col gap-4 p-5`} aria-labelledby="dzialania-faktury" data-dzialania="dzialania-faktury">
        <h2 id="dzialania-faktury" className="font-display text-[17px] font-bold">
          Działania
        </h2>
        <div className="flex flex-wrap items-center gap-2.5">
          {pdf ? (
            pdf.zablokowane ? (
              <Zablokowane powod={pdf.zablokowane}>Pobierz PDF</Zablokowane>
            ) : (
              <a id="pdf" href={`/api/invoices-pdf/${f.id}`} className={PRZYCISK}>
                Pobierz PDF
              </a>
            )
          ) : null}
          {f.hostedUrl ? (
            <a href={f.hostedUrl} target="_blank" rel="noopener noreferrer" className={PRZYCISK}>
              Faktura w Stripe ↗
            </a>
          ) : null}
          {korekta ? (
            korekta.zablokowane ? (
              <Zablokowane powod={korekta.zablokowane}>Wystaw korektę</Zablokowane>
            ) : (
              <Link href={korekta.href} className={PRZYCISK}>
                Wystaw korektę
              </Link>
            )
          ) : null}
        </div>
        {dokoncz ? (
          <div id="dokoncz" className="flex scroll-mt-24 flex-col gap-2 border-t border-line pt-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              Faktura bez PDF-u <Pomoc id="dokoncz-fakture" />
            </h3>
            {dokoncz.zablokowane ? <Zablokowane powod={dokoncz.zablokowane}>Dokończ wystawienie</Zablokowane> : <DokonczFakture invoiceId={f.id} number={f.number} />}
          </div>
        ) : null}
        {anuluj ? (
          <div id="anuluj" className="flex scroll-mt-24 flex-col gap-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Anulowanie dokumentu</h3>
            {anuluj.zablokowane && !wniosekAnulowania ? (
              <Zablokowane powod={anuluj.zablokowane}>Anuluj dokument</Zablokowane>
            ) : (
              <AnulujDokument invoiceId={f.id} number={f.number} userId={f.user.id} wniosek={!!anuluj.zablokowane} />
            )}
          </div>
        ) : null}
      </section>

      <section id="ksef" className={`${KARTA} flex scroll-mt-24 flex-col gap-2.5 p-5`} aria-labelledby="ksef-naglowek">
        <h2 id="ksef-naglowek" className="font-display text-[17px] font-bold">
          KSeF
        </h2>
        <Para k="Stan" poziomo>
          {stanKsef.t}
        </Para>
        {f.ksef.numer ? (
          <Para k="Numer KSeF" poziomo>
            <span className="font-mono">{f.ksef.numer}</span>
          </Para>
        ) : null}
        {f.ksef.wyslano ? (
          <Para k="Wysłana" poziomo>
            {kiedy(f.ksef.wyslano)}
          </Para>
        ) : null}
        {f.ksef.przyjeto ? (
          <Para k="Przyjęta" poziomo>
            {kiedy(f.ksef.przyjeto)}
          </Para>
        ) : null}
        {f.ksef.terminDo ? (
          <Para k="Termin przesłania" poziomo>
            {kiedy(f.ksef.terminDo)}
          </Para>
        ) : null}
        {f.ksef.blad ? <p className="text-sm text-crit [overflow-wrap:anywhere]">{f.ksef.blad}</p> : null}
        {upo ? (
          <span id="upo" className="flex scroll-mt-24 items-center gap-1.5">
            {upo.zablokowane ? (
              <Zablokowane powod={upo.zablokowane}>Pobierz UPO</Zablokowane>
            ) : (
              <a href={`/api/invoices-upo/${f.id}`} className={`${PRZYCISK} self-start`}>
                Pobierz UPO
              </a>
            )}
            <Pomoc id="upo" />
          </span>
        ) : null}
        {ksef ? ksef.zablokowane ? <Zablokowane powod={ksef.zablokowane}>Ponów wysyłkę do KSeF</Zablokowane> : <PonowKsef invoiceId={f.id} number={f.number} /> : null}
      </section>

      <section className={KARTA} aria-labelledby="platnosci">
        <NaglowekKarty id="platnosci" tytul="Płatności">
          {doKlienta ? <LinkKarty href={`/customers/${f.user.id}?sekcja=rozliczenia#portfel`}>Portfel klienta →</LinkKarty> : null}
        </NaglowekKarty>
        {f.platnosci.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak wpisów portfela pokrytych tą fakturą.</div> : null}
        {f.platnosci.map((w) => (
          <div key={w.id} className={WIERSZ}>
            <span className="w-[150px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(w.createdAt)}</span>
            <span className="flex min-w-0 flex-1 flex-col text-sm">
              <span>{etykietaWpisuPortfela(w.type, w.amount)}</span>
              <span className="text-[12.5px] text-muted-foreground">{[w.description, w.paymentProvider, etykieta(WALLET_TX_STATUS_PL, w.status)].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="font-mono text-[13px]">{formatPlnAndCredits(w.amount, f.currency)}</span>
          </div>
        ))}
      </section>

      {korekty.length ? (
        <section className={KARTA} aria-labelledby="korekty">
          <NaglowekKarty id="korekty" tytul="Korekty" />
          {korekty.map((k) => (
            <Link key={k.id} href={`/invoices/${k.id}`} className={`${WIERSZ} hover:bg-raised`}>
              <span className="flex-1 font-mono text-[13px]">{k.number}</span>
              <span className="text-[13px] text-muted-foreground">{k.correctionReason ?? ""}</span>
              <span className="font-mono text-[13px]">{formatPlnAndCredits(k.roznicaBrutto, k.currency)}</span>
            </Link>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Zablokowane({ powod, children }: { powod: string; children: React.ReactNode }) {
  return (
    <span aria-disabled="true" title={powod} className={`${PRZYCISK} cursor-not-allowed self-start opacity-50`}>
      {children}
      <span className="sr-only"> — {powod}</span>
    </span>
  );
}

function Para({ k, children, poziomo }: { k: string; children: React.ReactNode; poziomo?: boolean }) {
  return (
    <div className={poziomo ? "flex justify-between gap-4 text-sm" : "flex flex-col gap-0.5"}>
      <span className="text-muted-foreground">{k}</span>
      <span className={poziomo ? "text-right" : ""}>{children}</span>
    </div>
  );
}
