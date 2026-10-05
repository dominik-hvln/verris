'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Camera, Loader2, RotateCcw, Trash2, Wrench } from 'lucide-react';
import { potwierdz } from '@/components/panel/potwierdz';
import { Select } from '@/components/panel/select';
import { plForm } from '@/lib/pl';
import {
  createVpsSnapshotAction,
  deleteVpsSnapshotAction,
  fetchVpsOsImages,
  fetchVpsSnapshots,
  rebuildVpsAction,
  restoreVpsSnapshotAction,
  vpsActionStatus,
  type VpsOsImageDto,
  type VpsSnapshotsDto,
} from './vps-actions';

const OPROS_MS = 4000;

const data = (iso: string) =>
  new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const kwota = (v: string) => `${Number(v).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} K`;

/**
 * Q-08 — snapshoty, przywracanie i reinstalacja systemu jednego VPS-a. Operacje u dostawcy są asynchroniczne:
 * tworzony snapshot ma stan „creating” (odpytujemy listę), przywrócenie/reinstalacja zwraca akcję (odpytujemy jej stan).
 */
export function VpsSnapshoty({
  vpsId,
  vpsName,
  onRootPassword,
}: {
  vpsId: string;
  vpsName: string;
  onRootPassword: (pw: string) => void;
}) {
  const router = useRouter();
  const [stan, setStan] = useState<VpsSnapshotsDto | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [opis, setOpis] = useState('');
  const [zajety, setZajety] = useState(false);
  const [operacja, setOperacja] = useState<{ actionId: string; etykieta: string; progress: number } | null>(null);
  const [systemy, setSystemy] = useState<VpsOsImageDto[] | null>(null);
  const [system, setSystem] = useState('');

  const ustaw = useCallback((r: Awaited<ReturnType<typeof fetchVpsSnapshots>>) => {
    if (r.ok) {
      setStan(r.data ?? null);
      setBlad(null);
    } else setBlad(r.error);
  }, []);
  const wczytaj = useCallback(async () => ustaw(await fetchVpsSnapshots(vpsId)), [vpsId, ustaw]);

  useEffect(() => {
    void fetchVpsSnapshots(vpsId).then(ustaw);
  }, [vpsId, ustaw]);

  // Snapshot w trakcie tworzenia → odświeżaj listę, aż będzie gotowy.
  const tworzone = stan?.snapshots.some((s) => s.status === 'creating') ?? false;
  useEffect(() => {
    if (!tworzone) return;
    const t = setInterval(() => void wczytaj(), OPROS_MS);
    return () => clearInterval(t);
  }, [tworzone, wczytaj]);

  // Przywracanie / reinstalacja w toku → odpytuj stan akcji.
  useEffect(() => {
    if (!operacja) return;
    const t = setInterval(async () => {
      const r = await vpsActionStatus(vpsId, operacja.actionId);
      if (!r.ok || !r.data) return;
      if (r.data.status === 'running') {
        setOperacja((o) => (o ? { ...o, progress: r.data!.progress } : o));
        return;
      }
      if (r.data.status === 'success') toast.success(`${operacja.etykieta} — zakończono`);
      else toast.error(`${operacja.etykieta} — nie powiodło się`, { description: 'Spróbuj ponownie albo napisz do nas.' });
      setOperacja(null);
      router.refresh();
    }, OPROS_MS);
    return () => clearInterval(t);
  }, [operacja, vpsId, router]);

  const utworz = async () => {
    setZajety(true);
    const r = await createVpsSnapshotAction(vpsId, opis.trim());
    setZajety(false);
    if (!r.ok) {
      toast.error('Nie udało się utworzyć snapshotu', { description: r.error });
      return;
    }
    toast.success('Tworzymy snapshot — to może potrwać kilka minut');
    setOpis('');
    await wczytaj();
  };

  const przywroc = async (s: VpsSnapshotsDto['snapshots'][number]) => {
    const ok = await potwierdz(
      `Przywrócić serwer „${vpsName}” ze snapshotu „${s.description}” (${data(s.createdAt)})? Obecna zawartość dysku zostanie nadpisana — wszystkie dane zapisane po utworzeniu snapshotu zostaną bezpowrotnie utracone. Serwer zostanie na czas operacji wyłączony.`,
      { akcja: 'Przywróć i nadpisz dysk', niebezpieczne: true, tytul: 'Przywrócenie ze snapshotu' },
    );
    if (!ok) return;
    setZajety(true);
    const r = await restoreVpsSnapshotAction(vpsId, s.id);
    setZajety(false);
    if (!r.ok || !r.data) {
      toast.error('Nie udało się rozpocząć przywracania', { description: r.ok ? undefined : r.error });
      return;
    }
    setOperacja({ actionId: r.data.actionId, etykieta: 'Przywracanie ze snapshotu', progress: 0 });
  };

  const usun = async (s: VpsSnapshotsDto['snapshots'][number]) => {
    const ok = await potwierdz(
      `Usunąć snapshot „${s.description}” (${data(s.createdAt)})? Tej operacji nie można cofnąć — nie będzie już można przywrócić z niego serwera.`,
      { akcja: 'Usuń snapshot', niebezpieczne: true },
    );
    if (!ok) return;
    setZajety(true);
    const r = await deleteVpsSnapshotAction(vpsId, s.id);
    setZajety(false);
    if (!r.ok) {
      toast.error('Nie udało się usunąć snapshotu', { description: r.error });
      return;
    }
    toast.success('Snapshot usunięty');
    await wczytaj();
  };

  const pokazSystemy = async () => {
    const r = await fetchVpsOsImages(vpsId);
    if (!r.ok) {
      toast.error('Nie udało się pobrać listy systemów', { description: r.error });
      return;
    }
    setSystemy(r.data ?? []);
    setSystem(r.data?.[0]?.name ?? '');
  };

  const reinstaluj = async () => {
    const nazwa = systemy?.find((o) => o.name === system)?.description ?? system;
    const ok = await potwierdz(
      `Zainstalować system ${nazwa} od nowa na serwerze „${vpsName}”? Cały dysk zostanie wyczyszczony — pliki, bazy danych i konfiguracja zostaną bezpowrotnie utracone. Jeśli chcesz zachować dane, najpierw utwórz snapshot.`,
      { akcja: 'Wyczyść dysk i zainstaluj', niebezpieczne: true, tytul: 'Reinstalacja systemu' },
    );
    if (!ok) return;
    setZajety(true);
    const r = await rebuildVpsAction(vpsId, system);
    setZajety(false);
    if (!r.ok || !r.data) {
      toast.error('Nie udało się rozpocząć reinstalacji', { description: r.ok ? undefined : r.error });
      return;
    }
    if (r.data.rootPassword) onRootPassword(r.data.rootPassword);
    setSystemy(null);
    setOperacja({ actionId: r.data.actionId, etykieta: 'Reinstalacja systemu', progress: 0 });
  };

  if (blad) return <p className="text-xs text-rose-300">{blad}</p>;
  if (!stan) {
    return (
      <p className="flex items-center gap-2 text-xs text-neutral-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wczytywanie…
      </p>
    );
  }

  const n = stan.snapshots.length;
  const pokazSnapshoty = stan.enabled || n > 0;
  const zablokowane = zajety || operacja != null;

  return (
    <div className="space-y-4">
      {operacja ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {operacja.etykieta} w toku… {operacja.progress}%
        </p>
      ) : null}

      {pokazSnapshoty ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-white">
              <Camera className="h-4 w-4 text-violet-300" /> Snapshoty
            </p>
            <span className="text-[11px] text-neutral-400">
              {n} {plForm(n, 'snapshot', 'snapshoty', 'snapshotów')} · limit {stan.limit}
            </span>
          </div>
          {stan.enabled && stan.pricePerGbMonthly ? (
            <p className="text-[11px] text-neutral-500">
              {kwota(stan.pricePerGbMonthly)} za GB miesięcznie, doliczane z dołu do odnowienia VPS-a — za każdy snapshot
              przechowywany w minionym miesiącu (także usunięty przed jego końcem). Dla spójnych danych zatrzymaj serwer przed
              utworzeniem snapshotu.
            </p>
          ) : null}
          {stan.enabled ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={opis}
                onChange={(e) => setOpis(e.target.value)}
                maxLength={100}
                placeholder="Opis (opcjonalnie), np. przed aktualizacją"
                aria-label="Opis snapshotu"
                className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
              <button
                type="button"
                onClick={() => void utworz()}
                disabled={zablokowane || n >= stan.limit}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
              >
                {zajety ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} Utwórz snapshot
              </button>
            </div>
          ) : null}
          {n >= stan.limit && stan.enabled ? (
            <p className="text-[11px] text-amber-200">Osiągnięto limit — usuń starszy snapshot, aby utworzyć nowy.</p>
          ) : null}
          {n === 0 ? <p className="text-xs text-neutral-500">Brak snapshotów.</p> : null}
          <ul className="space-y-1.5">
            {stan.snapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <div className="min-w-0">
                  <p className="break-words text-sm text-white">{s.description}</p>
                  <p className="text-[11px] text-neutral-500">
                    {data(s.createdAt)} ·{' '}
                    {s.status === 'creating'
                      ? 'tworzenie…'
                      : s.status === 'unavailable'
                        ? 'niedostępny'
                        : s.sizeGb != null
                          ? `${Number(s.sizeGb).toLocaleString('pl-PL')} GB`
                          : 'rozmiar w trakcie liczenia'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void przywroc(s)}
                    disabled={zablokowane || s.status !== 'available'}
                    title="Przywróć serwer z tego snapshotu"
                    className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1.5 text-xs text-neutral-200 hover:bg-white/5 disabled:opacity-40"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Przywróć
                  </button>
                  <button
                    type="button"
                    onClick={() => void usun(s)}
                    disabled={zablokowane || s.status === 'creating'}
                    title="Usuń snapshot"
                    aria-label={`Usuń snapshot ${s.description}`}
                    className="rounded-lg border border-white/10 p-1.5 hover:border-rose-500/40 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-white">
          <Wrench className="h-4 w-4 text-neutral-300" /> Reinstalacja systemu
        </p>
        {systemy == null ? (
          <button
            type="button"
            onClick={() => void pokazSystemy()}
            disabled={zablokowane}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white hover:bg-white/5 disabled:opacity-50"
          >
            Wybierz system do instalacji
          </button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select
              value={system}
              onChange={setSystem}
              options={systemy.map((o) => ({ value: o.name, label: o.description }))}
              aria-label="System operacyjny"
              className="sm:w-72"
            />
            <button
              type="button"
              onClick={() => void reinstaluj()}
              disabled={zablokowane || !system}
              className="rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-black hover:bg-rose-600 disabled:opacity-50"
            >
              Reinstaluj
            </button>
            <button type="button" onClick={() => setSystemy(null)} className="text-xs text-neutral-400 hover:text-white">
              Anuluj
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
