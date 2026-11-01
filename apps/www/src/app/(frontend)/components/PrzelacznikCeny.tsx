'use client';

import { useState } from 'react';
import { opisCeny, rabatRocznyProcent, type CenaPakietu } from '@/lib/ceny';

/**
 * Cena pakietu z przełącznikami miesięcznie/rocznie i brutto/netto (makieta 1.11, cennik na stronie głównej).
 * Kwoty przychodzą z API (lib/ceny-api.ts) — komponent tylko przelicza netto i rabat roczny.
 * Bez JavaScriptu widać wariant domyślny (render na serwerze).
 */
export function PrzelacznikCeny({
  cena,
  nazwa,
  domyslnieRocznie = true,
}: {
  cena: CenaPakietu;
  /** Nazwa pakietu nad ceną, np. „Hosting Verris z autoskalowaniem”. */
  nazwa?: string;
  domyslnieRocznie?: boolean;
}) {
  const [rocznie, setRocznie] = useState(domyslnieRocznie);
  const [nettoWidok, setNetto] = useState(false);
  const rabat = rabatRocznyProcent(cena);
  const o = opisCeny(cena, rocznie, nettoWidok);
  return (
    <div className="pcena">
      <div className="pcena-prz">
        <div className="seg" role="group" aria-label="Okres rozliczenia">
          <button type="button" aria-pressed={!rocznie} onClick={() => setRocznie(false)}>
            Miesięcznie
          </button>
          <button type="button" aria-pressed={rocznie} onClick={() => setRocznie(true)}>
            Rocznie{rabat > 0 ? ` −${rabat}%` : ''}
          </button>
        </div>
        <div className="seg" role="group" aria-label="Ceny brutto lub netto">
          <button type="button" aria-pressed={!nettoWidok} onClick={() => setNetto(false)}>
            brutto
          </button>
          <button type="button" aria-pressed={nettoWidok} onClick={() => setNetto(true)}>
            netto
          </button>
        </div>
      </div>
      <div className="pcena-kwota" aria-live="polite">
        {nazwa && <span className="pcena-nazwa">{nazwa}</span>}
        <p className="pcena-cena">
          <strong>{o.cena}</strong> <span>{o.okres}</span>
        </p>
        <p className="pcena-podpis">{o.podpis}</p>
      </div>
    </div>
  );
}
