'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { AlertTriangle, Loader2, Sparkles, Undo2, X } from 'lucide-react';
import {
  applyAssistantFix,
  fetchAssistantHints,
  undoAssistantFix,
  type AssistantHint as Hint,
} from '@/app/dashboard/services/[id]/assistant-actions';

const dismissKey = (serviceId: string, key: string) => `verris-hint:${serviceId}:${key}`;
const isDismissed = (serviceId: string, key: string) => {
  try {
    return localStorage.getItem(dismissKey(serviceId, key)) === '1';
  } catch {
    return false;
  }
};

/**
 * PB-17 — jeden dymek asystenta na ekran usługi. Reguły liczy API (bez AI).
 * „Napraw” najpierw pokazuje, co dokładnie się zmieni, a po zmianie zostaje
 * „Cofnij”. „Nie pokazuj więcej” pamiętane w tej przeglądarce.
 */
export function AssistantHint({ serviceId, onNavigate }: { serviceId: string; onNavigate: (tab: string) => void }) {
  const [hints, setHints] = useState<Hint[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fixed, setFixed] = useState<{ key: string; undoId: string } | null>(null);

  const load = () =>
    void fetchAssistantHints(serviceId).then((h) => setHints((h ?? []).filter((x) => !isDismissed(serviceId, x.key))));
  useEffect(load, [serviceId]);

  const hint = hints[0];
  if (!hint && !fixed) return null;

  const dismiss = (key: string) => {
    try {
      localStorage.setItem(dismissKey(serviceId, key), '1');
    } catch {
      /* bez pamięci przeglądarki — ukrywamy do odświeżenia */
    }
    setPreviewing(false);
    setHints((h) => h.filter((x) => x.key !== key));
  };

  const apply = async () => {
    if (!hint) return;
    setBusy(true);
    const res = await applyAssistantFix(serviceId, hint.key);
    setBusy(false);
    setPreviewing(false);
    if (!res.ok) {
      toast.error('Nie udało się wprowadzić poprawki', { description: res.error });
      return;
    }
    setFixed({ key: hint.key, undoId: res.undoId });
    setHints((h) => h.filter((x) => x.key !== hint.key));
    toast.success('Gotowe — rekord zapisany w DNS', { description: 'Serwery na świecie zobaczą zmianę w ciągu kilku minut.' });
  };

  const undo = async () => {
    if (!fixed) return;
    setBusy(true);
    const res = await undoAssistantFix(serviceId, fixed.undoId);
    setBusy(false);
    if (!res.ok) {
      toast.error('Nie udało się cofnąć', { description: res.error });
      return;
    }
    toast.success('Cofnięto — DNS wrócił do poprzedniego stanu');
    setFixed(null);
    load();
  };

  if (fixed) {
    return (
      <div role="status" className="flex flex-wrap items-center gap-3 rounded-[10px] border border-line bg-card px-4 py-3 text-sm">
        <Sparkles className="h-4 w-4 flex-none text-data-hi" aria-hidden />
        <span className="min-w-0 flex-1 text-foreground">Poprawka zapisana. Jeśli coś przestało działać, możesz ją cofnąć.</span>
        <button type="button" onClick={() => void undo()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-1.5 text-xs text-foreground hover:bg-raised disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />} Cofnij
        </button>
        <button type="button" onClick={() => setFixed(null)} aria-label="Zamknij" className="rounded p-1 text-muted-foreground hover:bg-raised hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const a = hint.action;
  return (
    <aside aria-label="Podpowiedź asystenta" className={`rounded-[10px] border bg-card px-4 py-3 ${hint.severity === 'crit' ? 'border-warn' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        {hint.severity === 'crit' ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-warn" aria-label="pilne" />
        ) : (
          <Sparkles className="mt-0.5 h-4 w-4 flex-none text-data-hi" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{hint.title}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{hint.detail}</p>

          {previewing && a?.kind === 'fix' ? (
            <div className="mt-3 rounded-lg border border-line bg-raised/40 p-3 text-[13px]">
              <p className="text-foreground">{a.preview.replaces ? 'Zamienimy rekord w strefie DNS domeny:' : 'Dodamy rekord do strefy DNS domeny:'}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-muted-foreground">Typ</dt>
                <dd className="font-mono text-foreground">{a.preview.type}</dd>
                <dt className="text-muted-foreground">Host</dt>
                <dd className="break-all font-mono text-foreground">{a.preview.host}</dd>
                {a.preview.replaces ? (
                  <>
                    <dt className="text-muted-foreground">Było</dt>
                    <dd className="break-all font-mono text-muted-foreground line-through">{a.preview.replaces.value}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Będzie</dt>
                <dd className="break-all font-mono text-foreground">{a.preview.value}</dd>
              </dl>
              <p className="mt-2 text-xs text-muted-foreground">Zmianę możesz cofnąć jednym kliknięciem przez 7 dni.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void apply()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz zmianę
                </button>
                <button type="button" onClick={() => setPreviewing(false)} className="rounded-lg border border-line-strong px-3 py-2 text-sm text-foreground hover:bg-raised">
                  Anuluj
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
              {a?.kind === 'fix' ? (
                <button type="button" onClick={() => setPreviewing(true)} className="rounded-lg bg-primary px-3 py-1.5 font-semibold text-primary-foreground hover:opacity-90">
                  {a.label}
                </button>
              ) : a?.kind === 'tab' ? (
                <button type="button" onClick={() => onNavigate(a.tab)} className="text-primary hover:underline">
                  {a.label}
                </button>
              ) : a?.kind === 'href' ? (
                <Link href={a.href} className="text-primary hover:underline">
                  {a.label}
                </Link>
              ) : null}
              <button type="button" onClick={() => dismiss(hint.key)} className="text-muted-foreground hover:text-foreground">
                Nie pokazuj więcej
              </button>
              {hints.length > 1 ? <span className="text-muted-foreground">+{hints.length - 1} kolejne po tej</span> : null}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
