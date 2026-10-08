"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { AlertCircle, Loader2, Play } from "lucide-react";
import { Select } from "@/components/select";
import { KARTA, NaglowekKarty, PRZYCISK } from "@/components/v2";
import type { ProfilKlienta } from "./profil-data";
import { diagnostykaDnsTlsAction } from "./diagnostyka-actions";

/**
 * PB-46 — diagnostyka DNS + TLS na karcie klienta admina. Odtworzona z panelu obsługi (StaffDnsTlsPanel)
 * w stylach admina — aplikacje nie importują od siebie komponentów. Ten sam endpoint, ten sam zapis w dzienniku.
 */
export function DiagnostykaDnsTls({ userId, subscriptions }: { userId: string; subscriptions: ProfilKlienta["subscriptions"] }) {
  const zKontem = useMemo(() => subscriptions.filter((s) => s.account?.domain), [subscriptions]);
  const [subscriptionId, setSubscriptionId] = useState(() => zKontem[0]?.id ?? "");
  const [domena, setDomena] = useState("");
  const idListy = useId();
  const [blad, setBlad] = useState<string | null>(null);
  const [wynik, setWynik] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const uruchom = () => {
    setBlad(null);
    setWynik(null);
    start(async () => {
      const d = domena.trim();
      const r = await diagnostykaDnsTlsAction(userId, { subscriptionId: d ? undefined : subscriptionId || undefined, domain: d || undefined });
      if (r.ok === false) {
        setBlad(r.error);
        return;
      }
      setWynik(JSON.stringify(r.data, null, 2));
    });
  };

  return (
    <section className={KARTA} aria-labelledby="dns-tls" data-karta="dns-tls">
      <NaglowekKarty id="dns-tls" tytul="Diagnostyka DNS i TLS" />
      <div className="flex flex-col gap-4 border-t border-line px-[18px] py-4">
        <p className="text-[13px] text-muted-foreground">
          Rekordy DNS i certyfikat na porcie 443 dla domeny konta hostingowego. Każde uruchomienie trafia do dziennika.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={idListy} className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              Usługa (domena konta)
            </label>
            <Select
              id={idListy}
              value={subscriptionId}
              onChange={setSubscriptionId}
              disabled={!!domena.trim() || zKontem.length === 0}
              className="mt-1.5 w-full rounded-[9px] border border-line-strong bg-background px-3 py-2 text-sm disabled:opacity-50"
              options={
                zKontem.length === 0
                  ? [{ value: "", label: "Brak konta z domeną" }]
                  : zKontem.map((s) => ({ value: s.id, label: `${s.plan.name} — ${s.account?.domain}` }))
              }
            />
          </div>
          <label className="block">
            <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Lub domena ręcznie (FQDN konta)</span>
            <input
              value={domena}
              onChange={(e) => setDomena(e.target.value)}
              placeholder="np. example.pl"
              className="mt-1.5 w-full rounded-[9px] border border-line-strong bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>
        </div>
        {blad ? (
          <p className="flex items-start gap-2 text-[13px] text-crit">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {blad}
          </p>
        ) : null}
        <div>
          <button type="button" onClick={uruchom} disabled={pending || (!domena.trim() && !subscriptionId)} className={PRZYCISK}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Uruchom
          </button>
        </div>
        {wynik ? (
          <pre className="max-h-[28rem] overflow-auto rounded-[9px] border border-line bg-background p-3 font-mono text-[11px]">{wynik}</pre>
        ) : null}
      </div>
    </section>
  );
}
