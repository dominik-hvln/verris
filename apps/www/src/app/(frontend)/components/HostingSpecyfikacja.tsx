'use client';

import { useState } from 'react';
import { AZakladki } from './AZakladki';
import type { SekcjaSpecyfikacji } from '@/lib/specyfikacja';

/**
 * /hosting — specyfikacja pakietu w zakładkach (makieta 1.11.2026). Te same dane co /specyfikacja
 * (lib/specyfikacja.ts); przełącznik brutto/netto zmienia stawki autoskalowania. Obie wersje sekcji liczy
 * serwer, komponent tylko wybiera — bez JavaScriptu widać brutto i pierwszą grupę.
 */
export function HostingSpecyfikacja({ brutto, netto }: { brutto: SekcjaSpecyfikacji[]; netto: SekcjaSpecyfikacji[] }) {
  const [nettoWidok, setNetto] = useState(false);
  const sekcje = nettoWidok ? netto : brutto;
  return (
    <div className="hspec">
      <div className="hspec-prz">
        <div className="seg" role="group" aria-label="Stawki brutto lub netto">
          <button type="button" aria-pressed={!nettoWidok} onClick={() => setNetto(false)}>
            brutto
          </button>
          <button type="button" aria-pressed={nettoWidok} onClick={() => setNetto(true)}>
            netto
          </button>
        </div>
      </div>
      <AZakladki
        label="Grupy parametrów"
        items={sekcje.map((s) => ({
          id: `hspec-${s.id}`,
          label: s.tytul,
          panel: (
            <div className="hspec-tab">
              <table className="c-spec">
                <tbody>
                  {s.wiersze.map(([p, w]) => (
                    <tr key={p}>
                      <th scope="row">{p}</th>
                      <td>{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ),
        }))}
      />
    </div>
  );
}
