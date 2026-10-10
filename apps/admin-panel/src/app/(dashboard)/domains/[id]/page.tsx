import { bramkaStrony } from "@/lib/bramka-strony";
import { years as lata } from "@/lib/pl";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminApiError, adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { Okruszek } from "@/components/admin-shell";
import { BladStrony } from "@/components/blad-strony";
import { LinkJesli } from "@/components/link-jesli";
import { Eyebrow, KARTA, Pigulka, WIERSZ } from "@/components/v2";
import { STAN_ZAMOWIENIA, stanDomeny, TYP_ZAMOWIENIA, type KartaDomeny } from "../data";
import { DzialaniaDomeny } from "./dzialania-domeny";
import { AbonentDomeny } from "./abonent";
import { PonowZamowienie } from "../ponow-zamowienie";

export const dynamic = "force-dynamic";

const kiedy = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—");
const dzien = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" }) : "—");

/** Zdarzenia w historii domeny (dziennik i webhook rejestratora) po polsku; reszta — kod akcji. */
const ZDARZENIA: Record<string, string> = {
  DOMAIN_REGISTRAR_REGISTERED: "Zarejestrowana",
  DOMAIN_REGISTRAR_TRANSFER_SUBMITTED: "Zlecony transfer",
  DOMAIN_REGISTRAR_TRANSFER_COMPLETED: "Transfer zakończony",
  DOMAIN_REGISTRAR_RENEWED: "Odnowiona",
  DOMAIN_REGISTRAR_FAILED: "Operacja u rejestratora nieudana",
  DOMAIN_REGISTRAR_SYNCED: "Synchronizacja z rejestratorem",
  DOMAIN_TRANSFER_LOCKED: "Blokada transferu włączona",
  DOMAIN_TRANSFER_UNLOCKED: "Blokada transferu zdjęta",
  DOMAIN_AUTHCODE_REVEALED: "Pokazano kod EPP",
  DOMAIN_NAMESERVERS_UPDATED: "Zmienione serwery nazw",
  DOMAIN_REGISTRANT_UPDATED: "Zmienione dane abonenta",
  DOMAIN_WHOIS_PRIVACY_ENABLED: "Ukrycie WHOIS włączone",
  DOMAIN_WHOIS_PRIVACY_DISABLED: "Ukrycie WHOIS wyłączone",
  DOMAIN_LEFT_REGISTRAR: "Domena odeszła od rejestratora",
  REGISTRAR_WEBHOOK: "Zdarzenie od rejestratora",
  OPERATOR_DOMAIN_CHANGED: "Działanie obsługi",
};

/** Krótki opis szczegółów wpisu: powód i akcja obsługi, typ zdarzenia webhooka, płatnik odnowienia. */
function opisWpisu(h: KartaDomeny["historia"][number]): string {
  const d = h.details ?? {};
  const czesci: string[] = [];
  if (typeof d.akcja === "string") czesci.push(d.akcja);
  if (typeof d.powod === "string") czesci.push(`„${d.powod}”`);
  if (d.wynik === "blad" && typeof d.blad === "string") czesci.push(`błąd: ${d.blad}`);
  if (d.naKosztVerris === true) czesci.push("na koszt Verris");
  if (typeof d.eventType === "string") czesci.push(d.eventType);
  if (typeof d.error === "string") czesci.push(d.error);
  return czesci.join(" · ");
}

/**
 * F2.7 — karta domeny: przegląd (stan u rejestratora, wygaśnięcie, blokada, NS, WHOIS, klient, usługa), abonent
 * (odczyt na żądanie), operacje u rejestratora z powodem, zamówienia (z „Ponów” przy nieudanych) i historia.
 */
export default async function KartaDomenyPage({ params }: { params: Promise<{ id: string }> }) {
  const bramka = await bramkaStrony("/domains/[id]");
  if (bramka) return bramka;
  const { id } = await params;
  let d: KartaDomeny;
  try {
    d = await adminApi<KartaDomeny>(`/admin/domains/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 404 || e.status === 400)) notFound();
    return <BladStrony blad={e} tytul="Domena" powrot={{ href: "/domains", label: "Domeny" }} />;
  }
  const dostep = await fetchStaffAccess();
  const s = stanDomeny(d);
  const doUslugi = !brakUprawnienia(["CUSTOMERS_VIEW", "SUBSCRIPTIONS_MANAGE"], dostep);
  const klient = [d.klient.firstName, d.klient.lastName].filter(Boolean).join(" ") || d.klient.email;
  const zapis = brakUprawnienia("DOMAINS_MANAGE", dostep);

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={d.name} mono />
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Domena</Eyebrow>
        <h1 className="break-all text-[28px] lg:text-[34px]" style={{ fontFamily: "var(--font-mono)", fontWeight: 500 }}>
          {d.name}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-sm text-verris-body">
          <Pigulka ton={s.ton} className="!text-xs">
            {s.t}
          </Pigulka>
          <Link href={`/customers/${d.klient.id}`} className="hover:underline">
            {klient}
          </Link>
        </div>
      </div>

      <section className={`${KARTA} grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2 xl:grid-cols-4`} aria-label="Przegląd domeny">
        <Para k="Rejestrator">{d.uNas ? `${d.registrarProvider ?? "—"} · ${d.registrarExternalId}` : "poza Verris"}</Para>
        <Para k="Stan u rejestratora">{d.registrarStatus ?? "—"}</Para>
        <Para k="Wygasa">{d.uNas ? dzien(d.expiresAt) : "—"}</Para>
        <Para k="Automatyczne odnowienie">{d.autoRenew ? "tak" : "nie"}</Para>
        <Para k="Blokada transferu">{d.uNas ? (d.transferLock ? "tak" : "nie") : "—"}</Para>
        <Para k="Ukrycie WHOIS">{d.uNas ? (d.whoisPrivacy ? "tak" : "nie") : "—"}</Para>
        <Para k="Serwery nazw">
          <span className="font-mono text-[13px]">{d.nameservers.length ? d.nameservers.join(", ") : "—"}</span>
        </Para>
        <Para k="Ostatnia synchronizacja">{kiedy(d.lastRegistrarSyncAt)}</Para>
        <Para k="Klient">
          <Link href={`/customers/${d.klient.id}`} className="hover:underline">
            {d.klient.email}
          </Link>
        </Para>
        <Para k="Portfel klienta">{`${Number(d.klient.walletBalance).toFixed(2)} zł`}</Para>
        <Para k="Usługa hostingu">
          {d.usluga ? (
            <LinkJesli wolno={doUslugi} href={`/subscriptions/${d.usluga.id}`} className="hover:underline">
              konto {d.usluga.stanKonta.toLowerCase()}
            </LinkJesli>
          ) : (
            "—"
          )}
        </Para>
        <Para k="Dodana">{dzien(d.createdAt)}</Para>
      </section>

      {d.uNas ? (
        <DzialaniaDomeny domainId={d.id} domena={d.name} transferLock={d.transferLock} nameservers={d.nameservers} saldoKlienta={d.klient.walletBalance} dostep={dostep} />
      ) : (
        <p className={`${KARTA} p-5 text-sm text-muted-foreground`}>Domena nie jest zarejestrowana przez Verris — blokadą, kodem EPP i odnowieniem zarządza jej obecny rejestrator.</p>
      )}

      {d.uNas ? (
        <section className={`${KARTA} flex flex-col gap-3 p-5`} aria-labelledby="abonent-naglowek">
          <h2 id="abonent-naglowek" className="font-display text-[17px] font-bold">
            Abonent
          </h2>
          <AbonentDomeny domainId={d.id} zablokowane={brakUprawnienia("CUSTOMERS_VIEW", dostep)} />
        </section>
      ) : null}

      <section className={KARTA} aria-label="Zamówienia u rejestratora">
        <div className={`${WIERSZ} !border-t-0 font-display text-[15px] font-bold`}>Zamówienia</div>
        {d.zamowienia.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zamówień u rejestratora.</div> : null}
        {d.zamowienia.map((z) => (
          <div key={z.id} className={`${WIERSZ} flex-wrap`} data-zamowienie={z.id}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold">
                {TYP_ZAMOWIENIA[z.type] ?? z.type} · {lata(z.years)}
              </span>
              <span className="text-[12.5px] text-muted-foreground">
                {kiedy(z.createdAt)} · {z.priceAmount ? `${z.priceAmount} ${z.currency}` : "—"}
                {z.type === "RENEW" && z.status === "COMPLETED" && !z.walletTxId ? " · na koszt Verris" : ""}
              </span>
              {z.lastError ? <span className="break-all text-[12px] text-crit">{z.lastError}</span> : null}
            </span>
            <span className="w-[120px]">
              <Pigulka ton={STAN_ZAMOWIENIA[z.status]?.ton ?? "muted"} className="!text-xs">
                {STAN_ZAMOWIENIA[z.status]?.t ?? z.status}
              </Pigulka>
            </span>
            {z.moznaPonowic ? (
              <span className="w-full sm:w-[280px]">
                <PonowZamowienie orderId={z.id} domena={d.name} typ={z.type} kwota={z.priceAmount} zablokowane={zapis} moznaPonowic />
              </span>
            ) : null}
          </div>
        ))}
      </section>

      <section className={KARTA} aria-label="Historia domeny">
        <div className={`${WIERSZ} !border-t-0 font-display text-[15px] font-bold`}>Historia</div>
        {d.historia.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak wpisów.</div> : null}
        {d.historia.map((h) => (
          <div key={h.id} className={WIERSZ}>
            <span className="w-[150px] shrink-0 font-mono text-[12px] text-muted-foreground">{kiedy(h.createdAt)}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span>{ZDARZENIA[h.action] ?? h.action}</span>
              <span className="break-all text-[12px] text-muted-foreground">{[h.aktor, opisWpisu(h)].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

function Para({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span>{children}</span>
    </div>
  );
}
