import { notFound } from "next/navigation";
import { AdminApiError, adminApi } from "@/lib/api";
import { Okruszek } from "@/components/admin-shell";
import { BladStrony } from "@/components/blad-strony";
import { Eyebrow, KARTA, Kpi, NaglowekKarty, Pigulka, RzadKpi } from "@/components/v2";
import type { CampaignRow } from "../data";

export const dynamic = "force-dynamic";

const STAN: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  DRAFT: { t: "szkic", ton: "muted" },
  SCHEDULED: { t: "zaplanowana", ton: "warn" },
  SENDING: { t: "wysyłanie", ton: "warn" },
  SENT: { t: "wysłana", ton: "ok" },
  FAILED: { t: "nieudana", ton: "crit" },
  CANCELED: { t: "odwołana", ton: "muted" },
};
const SEGMENT: Record<string, string> = {
  NEWSLETTER_OPT_IN: "Zgoda na newsletter",
  PRODUCT_UPDATES_OPT_IN: "Zgoda na nowości produktowe",
  ALL_ACTIVE_USERS: "Wszyscy aktywni (tylko legal/ważne)",
};
const kiedy = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" }) : "—");

/**
 * Fala 1B — szczegół kampanii (GET /admin/marketing/campaigns/:id, PROMO_MANAGE): treść, segment, terminy i liczniki
 * wysyłki. Wysyłka, planowanie i odwołanie zostają na liście /marketing.
 */
export default async function KampaniaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let k: CampaignRow;
  try {
    k = await adminApi<CampaignRow>(`/admin/marketing/campaigns/${encodeURIComponent(id)}`);
  } catch (e) {
    if (e instanceof AdminApiError && e.status === 404) notFound();
    return <BladStrony blad={e} tytul="Kampania" powrot={{ href: "/marketing", label: "Marketing" }} />;
  }
  const st = STAN[k.status] ?? { t: k.status, ton: "muted" as const };

  return (
    <div className="flex flex-col gap-5">
      <Okruszek tekst={k.name} />
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Kampania · {SEGMENT[k.segment] ?? k.segment}</Eyebrow>
        <h1 className="text-[28px] lg:text-[34px]">{k.name}</h1>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Pigulka ton={st.ton} className="!text-xs">
            {st.t}
          </Pigulka>
          {k.description ? <span className="text-muted-foreground">{k.description}</span> : null}
        </div>
      </div>

      <RzadKpi etykieta="Wysyłka kampanii">
        <Kpi etykieta="Odbiorcy" wartosc={k.recipientCount || "—"} />
        <Kpi etykieta="Wysłane" wartosc={k.sentCount} />
        <Kpi etykieta="Wypisani" wartosc={k.suppressedCount} opis="pominięci po wypisie" />
        <Kpi etykieta="Błędy" wartosc={k.failedCount} />
      </RzadKpi>

      <section className={`${KARTA} grid grid-cols-1 gap-4 p-5 text-sm sm:grid-cols-2 xl:grid-cols-4`} aria-label="Terminy">
        <Para k="Utworzona" v={kiedy(k.createdAt)} />
        <Para k="Zaplanowana" v={kiedy(k.scheduledAt)} />
        <Para k="Start wysyłki" v={kiedy(k.startedAt)} />
        <Para k="Koniec wysyłki" v={kiedy(k.completedAt)} />
      </section>

      <section className={KARTA} aria-labelledby="tresc">
        <NaglowekKarty id="tresc" tytul="Treść" />
        <div className="flex flex-col gap-3 border-t border-line px-[18px] py-4 text-sm">
          <Para k="Temat" v={k.subject} />
          {k.ctaLabel || k.ctaUrl ? <Para k="Przycisk" v={[k.ctaLabel, k.ctaUrl].filter(Boolean).join(" → ")} /> : null}
          <pre className="whitespace-pre-wrap rounded-[9px] border border-line bg-raised p-3 font-mono text-[13px] [overflow-wrap:anywhere]">{k.bodyMarkdown}</pre>
        </div>
      </section>
    </div>
  );
}

function Para({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="[overflow-wrap:anywhere]">{v}</span>
    </div>
  );
}
