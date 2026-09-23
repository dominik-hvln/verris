import Link from "next/link";
import { staffApi, StaffApiError } from "@/lib/staff-api";
import { BRAK_UPRAWNIENIA, KATEGORIA, STATUS_LABEL, STATUS_STYLE } from "../shared";
import { DecisionForm } from "./decision-form";

export const dynamic = "force-dynamic";

type Raport = {
  id: string; status: string; category: string; url: string; host: string; description: string;
  reporterName: string | null; reporterEmail: string; goodFaith: boolean; ip: string | null;
  subscriptionId: string | null; userId: string | null; decision: string | null; decidedAt: string | null;
  customerNotifiedAt: string | null; createdAt: string; klient: { id: string; email: string } | null;
};

export default async function AbuseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: Raport | null = null;
  let error: string | null = null;
  try {
    r = await staffApi<Raport>(`/staff/abuse/${encodeURIComponent(id)}`);
  } catch (e) {
    error = e instanceof StaffApiError && e.status === 403 ? BRAK_UPRAWNIENIA : "Nie udało się pobrać zgłoszenia.";
  }
  if (!r) return <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</p>;

  const wiersz = (k: string, v: React.ReactNode) => (
    <div className="grid gap-1 sm:grid-cols-[180px_1fr]"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="break-all text-sm text-white">{v}</dd></div>
  );
  return (
    <div className="space-y-6">
      <Link href="/abuse" className="text-sm text-muted-foreground hover:text-white">← Nadużycia</Link>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_STYLE[r.status] ?? ""}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
        <h1 className="break-all text-2xl font-bold text-white">{r.url}</h1>
      </div>
      <dl className="space-y-3 rounded-xl border border-white/10 bg-black/30 p-4">
        {wiersz("Kategoria", KATEGORIA[r.category] ?? r.category)}
        {wiersz("Przyjęte", new Date(r.createdAt).toLocaleString("pl-PL"))}
        {wiersz("Zgłaszający", `${r.reporterName ? `${r.reporterName} · ` : ""}${r.reporterEmail}${r.goodFaith ? " · oświadczenie o dobrej wierze" : ""}`)}
        {wiersz("Opis", <span className="whitespace-pre-wrap">{r.description}</span>)}
        {wiersz("Klient", r.klient ? <Link href={`/crm/${r.klient.id}`} className="text-indigo-300 hover:underline">{r.klient.email}</Link> : "nie dopasowano — sprawdź, czy domena jest u nas")}
        {r.decision ? wiersz("Uzasadnienie decyzji", <span className="whitespace-pre-wrap">{r.decision}</span>) : null}
        {r.decidedAt ? wiersz("Decyzja z", new Date(r.decidedAt).toLocaleString("pl-PL")) : null}
        {r.customerNotifiedAt ? wiersz("Klient powiadomiony", new Date(r.customerNotifiedAt).toLocaleString("pl-PL")) : null}
      </dl>
      {r.status === "ACTION_TAKEN" || r.status === "REJECTED" ? null : <DecisionForm id={r.id} maKlienta={Boolean(r.userId)} />}
    </div>
  );
}
