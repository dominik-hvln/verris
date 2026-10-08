"use client";

import { useEffect, useState } from "react";
import { Checkbox } from "@/components/checkbox";
import { mozeOznaczacKontoWewnetrzne } from "./konto-wewnetrzne-actions";
import { WyslijWniosek } from "@/components/wniosek-operacji";

interface Props {
  /** PB-48 — klient, którego dotyczy wniosek (bez uprawnienia zamiast podpowiedzi jest „Wyślij wniosek”). */
  userId?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}

/**
 * PB-47 — przełącznik „konto wewnętrzne”. Konto wewnętrzne wypada z MRR i churnu, więc zmienić je może
 * ADMIN albo operator z uprawnieniem „Oznaczanie konta jako wewnętrzne” (L4). Pozostali widzą stan
 * i „Wyślij wniosek” o zmianę na przeciwną (PB-48) — akceptuje kierownik zmiany albo administrator.
 */
export function PrzelacznikKontaWewnetrznego(props: Props) {
  // null = jeszcze sprawdzamy uprawnienie (przełącznik nieaktywny do czasu odpowiedzi).
  const [dozwolone, setDozwolone] = useState<boolean | null>(null);
  useEffect(() => {
    let aktywne = true;
    mozeOznaczacKontoWewnetrzne()
      .then((v) => aktywne && setDozwolone(v))
      .catch(() => aktywne && setDozwolone(false));
    return () => {
      aktywne = false;
    };
  }, []);
  return <PoleKontaWewnetrznego {...props} dozwolone={dozwolone} />;
}

export function PoleKontaWewnetrznego({ userId, checked, disabled, onChange, dozwolone }: Props & { dozwolone: boolean | null }) {
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 cursor-pointer" data-konto-wewnetrzne={dozwolone === false ? "brak-uprawnien" : undefined}>
        <Checkbox
          checked={checked}
          disabled={disabled || dozwolone !== true}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 rounded border-white/20"
        />
        <span className="text-sm text-white">
          Konto wewnętrzne (testowe)
          <span className="block text-xs text-muted-foreground">
            Poza metrykami biznesowymi (MRR, churn, saldo portfeli); w kolejce „czeka na fakturę” oznaczone — prawdziwa wpłata nadal wymaga faktury VAT.
          </span>
          {dozwolone === false ? (
            <span className="mt-1 block text-xs text-amber-200">
              Zmiana wymaga uprawnienia „Oznaczanie konta jako wewnętrzne” (kierownik zmiany).
              {userId ? " Wyślij wniosek — zdecyduje osoba z uprawnieniem." : " Poproś przełożonego o zmianę."}
            </span>
          ) : null}
        </span>
      </label>
      {dozwolone === false && userId ? (
        <div className="pl-7">
          <WyslijWniosek typ="CUSTOMER_INTERNAL_FLAG" userId={userId} payload={{ isInternal: !checked }} />
        </div>
      ) : null}
    </div>
  );
}
