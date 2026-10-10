"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PRZYCISK } from "@/components/v2";
import { enableResellerAction, updateResellerAction } from "../../resellers/actions";
import type { ResellerRow } from "../../resellers/data";

const STATUS: Record<ResellerRow["status"], string> = { PENDING: "wniosek", ACTIVE: "aktywny", SUSPENDED: "zawieszony" };
const POLE = "w-24 rounded-[9px] border border-line-strong bg-transparent px-2.5 py-1.5 text-sm text-foreground";

/**
 * Plan E, patch 11 — reseller na karcie klienta: włączenie z narzutem bez wpisywania e-maila albo ID
 * (strona /resellers tego wymagała), zmiana narzutu i statusu.
 */
export function ResellerKlienta({ userId, reseller }: { userId: string; reseller: ResellerRow | null }) {
  const router = useRouter();
  const [narzut, setNarzut] = useState(String(reseller?.markupPct ?? 20));
  const [marka, setMarka] = useState(reseller?.brandName ?? "");
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const wykonaj = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBlad(null);
    start(async () => {
      const r = await fn();
      if (r.ok) router.refresh();
      else setBlad(r.error);
    });
  };
  const procent = Number.parseInt(narzut, 10);
  const poprawny = Number.isInteger(procent) && procent >= 0 && procent <= 300;

  return (
    <div className="flex flex-col gap-2.5">
      {reseller ? (
        <p className="text-sm">
          Status: <strong>{STATUS[reseller.status]}</strong> · kod <span className="font-mono">{reseller.code}</span>
        </p>
      ) : (
        <p className="text-[13px] text-muted-foreground">Klient nie jest resellerem.</p>
      )}
      <div className="flex flex-wrap items-end gap-2.5">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Narzut (%)
          <input type="number" min={0} max={300} value={narzut} onChange={(e) => setNarzut(e.target.value)} className={POLE} />
        </label>
        {reseller ? null : (
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Marka (opcjonalnie)
            <input value={marka} maxLength={80} onChange={(e) => setMarka(e.target.value)} className={`${POLE} w-44`} />
          </label>
        )}
        {reseller ? (
          <>
            <button type="button" disabled={pending || !poprawny || procent === reseller.markupPct} className={PRZYCISK} onClick={() => wykonaj(() => updateResellerAction(userId, { markupPct: procent }))}>
              Zapisz narzut
            </button>
            {reseller.status === "ACTIVE" ? (
              <button type="button" disabled={pending} className={PRZYCISK} onClick={() => wykonaj(() => updateResellerAction(userId, { status: "SUSPENDED" }))}>
                Zawieś
              </button>
            ) : (
              <button type="button" disabled={pending} className={PRZYCISK} onClick={() => wykonaj(() => updateResellerAction(userId, { status: "ACTIVE" }))}>
                {reseller.status === "PENDING" ? "Zatwierdź" : "Aktywuj"}
              </button>
            )}
          </>
        ) : (
          <button type="button" disabled={pending || !poprawny} className={PRZYCISK} onClick={() => wykonaj(() => enableResellerAction({ userId, markupPct: procent, brandName: marka.trim() || undefined }))}>
            Włącz resellera
          </button>
        )}
      </div>
      {blad ? <p className="text-xs text-crit">{blad}</p> : null}
    </div>
  );
}
