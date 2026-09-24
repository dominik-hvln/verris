"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { Plus } from "lucide-react";
import { fetchTickets, type TicketSummary } from "./actions";
import { PageHeaderRow } from "@/components/panel";
import { Kpi, KpiStrip, SectionHead } from "@/components/panel/v2";

const TH = "whitespace-nowrap px-3 pb-2.5 pt-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground";
const TD = "border-t border-line px-3 py-[11px] align-middle";

/** Stan zgłoszenia: kropka + słowo (jak we wzorcu). Czekamy na klienta = ostrzeżenie. */
const STATUS: Record<string, { label: string; tone: "data" | "warn" | "muted" }> = {
  OPEN: { label: "przyjęte", tone: "data" },
  IN_PROGRESS: { label: "w toku", tone: "data" },
  WAITING_CUSTOMER: { label: "czekamy na Ciebie", tone: "warn" },
};

export default function SupportPage() {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [blad, setBlad] = useState(false);

  useEffect(() => {
    fetchTickets()
      .then(setTickets)
      .catch(() => setBlad(true))
      .finally(() => setLoading(false));
  }, []);

  // Awaria ≠ „nie masz zgłoszeń”: liczniki pokazują „—”, lista mówi, co się stało (X-39).
  const count = (pred: (t: TicketSummary) => boolean) => (loading ? "…" : blad ? "—" : tickets.filter(pred).length);
  const open = (t: TicketSummary) => t.status in STATUS;

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PageHeaderRow
        title="Centrum pomocy"
        description="Zgłoś problem lub napisz do zespołu wsparcia — odpowiadamy po polsku."
        actions={
          <Link
            href="/dashboard/support/new"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi sm:w-auto"
          >
            <Plus className="h-4 w-4" />
            Nowe zgłoszenie
          </Link>
        }
      />

      <KpiStrip>
        <Kpi label="Otwarte" value={count(open)} foot={<span>przyjęte i w toku</span>} />
        <Kpi label="Czekamy na Ciebie" value={count((t) => t.status === "WAITING_CUSTOMER")} foot={<span>odpowiedz, by ruszyć dalej</span>} />
        <Kpi label="Rozwiązane" value={count((t) => !open(t))} foot={<span>zamknięte zgłoszenia</span>} />
        <Kpi
          label="Ostatnia aktywność"
          value={loading || tickets.length === 0 ? "—" : format(new Date(Math.max(...tickets.map((t) => +new Date(t.updatedAt)))), "d MMM", { locale: pl })}
          foot={<span>najnowsza zmiana w zgłoszeniach</span>}
        />
      </KpiStrip>

      <section>
        <SectionHead
          title="Twoje zgłoszenia"
          action={
            <Link href="/dashboard/knowledge" className="text-[13px] text-data-hi hover:underline">
              Baza wiedzy
            </Link>
          }
        />
        {loading ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">Wczytywanie zgłoszeń…</p>
        ) : blad ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-warn">
            Nie udało się pobrać zgłoszeń. Odśwież stronę za chwilę — jeśli problem wróci, napisz na{" "}
            <a href="mailto:kontakt@verris.pl" className="text-data-hi hover:underline">kontakt@verris.pl</a>.
          </p>
        ) : tickets.length === 0 ? (
          <p className="m-0 rounded-[10px] border border-line bg-card px-4 py-[22px] text-sm text-muted-foreground">
            Nie masz zgłoszeń.{" "}
            <Link href="/dashboard/support/new" className="text-data-hi hover:underline">
              Napisz do nas
            </Link>
            , jeśli czegoś potrzebujesz.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line bg-card">
            <table className="v2-stack w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className={TH}>Zgłoszenie</th>
                  <th className={TH}>Stan</th>
                  <th className={TH}>Ostatnia zmiana</th>
                  <th className={`${TH} text-right`}>Odpowiedzi</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => {
                  const st = STATUS[t.status] ?? { label: "rozwiązane", tone: "muted" as const };
                  return (
                    <tr
                      key={t.id}
                      tabIndex={0}
                      className="cursor-pointer hover:bg-raised/40"
                      onClick={() => router.push(`/dashboard/support/${t.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && router.push(`/dashboard/support/${t.id}`)}
                    >
                      <td className={TD} data-label="Zgłoszenie">
                        <b className="block font-semibold text-foreground">{t.subject}</b>
                      </td>
                      <td className={TD} data-label="Stan">
                        <span
                          className={`inline-flex items-center gap-[7px] whitespace-nowrap text-[12.5px] font-semibold ${
                            st.tone === "data" ? "text-data-hi" : st.tone === "warn" ? "text-warn" : "text-muted-foreground"
                          }`}
                        >
                          <span
                            className={`h-[7px] w-[7px] rounded-full bg-current ${
                              st.tone === "data" ? "v2-breathe" : st.tone === "warn" ? "v2-breathe v2-breathe-warn" : ""
                            }`}
                          />
                          {st.label}
                        </span>
                      </td>
                      <td className={`${TD} whitespace-nowrap font-mono text-xs text-muted-foreground`} data-label="Ostatnia zmiana">
                        {format(new Date(t.updatedAt), "d MMM yyyy, HH:mm", { locale: pl })}
                      </td>
                      <td className={`${TD} text-right tabular-nums text-muted-foreground`} data-label="Odpowiedzi">{t._count.replies}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
