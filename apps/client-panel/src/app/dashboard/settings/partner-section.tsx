"use client";

import { useEffect, useState } from "react";
import { Loader2, Unlink } from "lucide-react";
import { potwierdz } from "@/components/panel";
import { odepnijOdPartnera, pobierzPartnera, type PartnerKonta } from "./partner-actions";

/**
 * O-05 — „Twoje konto prowadzi partner X”. Klient zawsze widzi, kto prowadzi konto
 * (nic nie ukrywamy przed klientem), i może się odpiąć; subkonto tylko widzi.
 */
export function PartnerSection({
  isSubaccount,
  showToast,
}: {
  isSubaccount: boolean;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [partner, setPartner] = useState<PartnerKonta | null>(null);
  const [zajety, setZajety] = useState(false);

  useEffect(() => {
    void pobierzPartnera().then(setPartner);
  }, []);

  if (!partner) return null;

  const odepnij = async () => {
    const ok = await potwierdz(
      `Odpiąć konto od ${partner.nazwa}? Zostaniesz bezpośrednim klientem Verris — konto, usługi, dane i płatności zostają bez zmian. Partner przestanie widzieć Twoje usługi i dostanie o tym informację.`,
      { akcja: "Odepnij", niebezpieczne: true, tytul: "Odpięcie od partnera" },
    );
    if (!ok) return;
    setZajety(true);
    const r = await odepnijOdPartnera();
    setZajety(false);
    if (r.ok) {
      setPartner(null);
      showToast("Konto jest teraz samodzielne.", "success");
      window.dispatchEvent(new Event("wallet:refresh"));
    } else showToast(r.error, "error");
  };

  return (
    <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line bg-card px-5 py-4">
      <div className="flex min-w-0 items-center gap-3">
        {partner.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo z API (inny host)
          <img src={partner.logoUrl} alt="" className="h-9 max-w-[6rem] object-contain" />
        ) : null}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Twoje konto prowadzi {partner.nazwa}</p>
          <p className="text-xs text-muted-foreground">
            Partner widzi Twoje usługi i ich stan (bez plików, poczty, faktur i salda), może wstrzymać lub wznowić usługę
            i wysłać Ci link do hasła. Kontakt: <a className="underline" href={`mailto:${partner.kontakt}`}>{partner.kontakt}</a>
          </p>
        </div>
      </div>
      {!isSubaccount ? (
        <button
          type="button"
          onClick={() => void odepnij()}
          disabled={zajety}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-foreground hover:bg-raised disabled:opacity-50"
        >
          {zajety ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />} Odepnij od partnera
        </button>
      ) : null}
    </section>
  );
}
