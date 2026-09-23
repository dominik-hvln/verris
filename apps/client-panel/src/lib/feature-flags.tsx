'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { FlagaModulu } from '@verris/contracts';
import { czyModul } from './feature-flags-core';
import { pobierzFlagiAction } from './feature-flags-action';

type Mapa = Record<string, boolean>;
const Ctx = createContext<Mapa>({});

/** N-12 — flagi operatora (Admin → Operacje produktowe) dla zalogowanego klienta. */
export function FeatureFlagsProvider({ children }: { children: ReactNode }) {
  const [flagi, setFlagi] = useState<Mapa>({});
  useEffect(() => {
    let aktywny = true;
    void pobierzFlagiAction().then((m) => {
      if (aktywny) setFlagi(m);
    });
    return () => {
      aktywny = false;
    };
  }, []);
  return <Ctx.Provider value={flagi}>{children}</Ctx.Provider>;
}

export function useFlagi(): Mapa {
  return useContext(Ctx);
}

export function useModul(modul: FlagaModulu): boolean {
  return czyModul(useContext(Ctx), modul);
}
