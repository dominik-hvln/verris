'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { potwierdz } from '@/components/panel';
import { zapiszLogo, zapiszMarke, type ResellerOverview } from './actions';

const MAX = 100 * 1024;
const btn =
  'inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-foreground hover:bg-raised disabled:opacity-50';

/**
 * O-09 — marka resellera: nazwa i logo, które jego klienci widzą w panelu i w mailach
 * (z dopiskiem „na infrastrukturze Verris”). Plik sprawdza też API — po sygnaturze, nie po nazwie.
 */
export function MarkaResellera({ ov, onZmiana }: { ov: ResellerOverview; onZmiana: (o: ResellerOverview) => void }) {
  const [nazwa, setNazwa] = useState(ov.brandName ?? '');
  const [zajety, setZajety] = useState<'nazwa' | 'logo' | null>(null);
  const plik = useRef<HTMLInputElement>(null);

  const zapiszNazwe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nazwa.trim()) {
      toast.error('Podaj nazwę marki.');
      return;
    }
    setZajety('nazwa');
    const r = await zapiszMarke(nazwa.trim());
    setZajety(null);
    if (r.ok) {
      onZmiana(r.data);
      toast.success('Nazwa marki zapisana — Twoi klienci zobaczą ją w panelu i w mailach.');
    } else toast.error(r.error);
  };

  const wybierz = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX) {
      toast.error('Logo może mieć najwyżej 100 KB.');
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) {
      toast.error('Logo musi być plikiem PNG, JPEG albo WebP.');
      return;
    }
    const base64 = await new Promise<string>((ok, err) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ''));
      r.onerror = () => err(r.error);
      r.readAsDataURL(f);
    });
    setZajety('logo');
    const r = await zapiszLogo(base64);
    setZajety(null);
    if (plik.current) plik.current.value = '';
    if (r.ok) {
      onZmiana(r.data);
      toast.success('Logo zapisane.');
    } else toast.error(r.error);
  };

  const usun = async () => {
    if (!(await potwierdz('Usunąć logo? Klienci zobaczą samą nazwę marki.', { akcja: 'Usuń', niebezpieczne: true }))) return;
    setZajety('logo');
    const r = await zapiszLogo(null);
    setZajety(null);
    if (r.ok) onZmiana(r.data);
    else toast.error(r.error);
  };

  return (
    <section className="rounded-[10px] border border-line bg-card p-4">
      <h3 className="m-0 font-display text-[15px] font-bold text-foreground">Twoja marka u klientów</h3>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted-foreground">
        Nazwa i logo pojawiają się w panelu Twoich klientów i w mailach od nas, z małym dopiskiem „na infrastrukturze Verris”.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-4">
        <form onSubmit={(e) => void zapiszNazwe(e)} className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium text-foreground">
            Nazwa marki
            <input
              value={nazwa}
              onChange={(e) => setNazwa(e.target.value)}
              maxLength={80}
              placeholder="np. Studio WWW Kowalski"
              className="mt-1 block w-64 max-w-full rounded-lg border border-line-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
          </label>
          <button type="submit" className={btn} disabled={zajety !== null || nazwa.trim() === (ov.brandName ?? '')}>
            {zajety === 'nazwa' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz nazwę
          </button>
        </form>

        <div className="flex items-center gap-3">
          <div className="flex h-12 w-32 items-center justify-center rounded-lg border border-dashed border-line-strong bg-background">
            {ov.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- logo z API (inny host), bez optymalizacji Next
              <img src={ov.logoUrl} alt={`Logo ${ov.brandName ?? ''}`} className="max-h-10 max-w-[7.5rem] object-contain" />
            ) : (
              <span className="text-[11px] text-muted-foreground">bez logo</span>
            )}
          </div>
          <input
            ref={plik}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            id="reseller-logo"
            onChange={(e) => void wybierz(e.target.files?.[0])}
          />
          <label htmlFor="reseller-logo" className={`${btn} cursor-pointer`} aria-disabled={zajety !== null}>
            {zajety === 'logo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageUp className="h-3.5 w-3.5" />} {ov.logoUrl ? 'Zmień logo' : 'Wgraj logo'}
          </label>
          {ov.logoUrl ? (
            <button type="button" className={btn} disabled={zajety !== null} onClick={() => void usun()}>
              <Trash2 className="h-3.5 w-3.5" /> Usuń
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-[11.5px] text-muted-foreground">PNG, JPEG albo WebP, najwyżej 100 KB. Najlepiej poziome, na przezroczystym tle.</p>
    </section>
  );
}
