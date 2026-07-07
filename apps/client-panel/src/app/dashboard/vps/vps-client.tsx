'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Copy,
  Cpu,
  HardDrive,
  KeyRound,
  Loader2,
  MemoryStick,
  Play,
  Plus,
  Power,
  RotateCw,
  Server,
  Trash2,
} from 'lucide-react';
import { PanelEmptyState } from '@/components/panel';
import { formatCredits } from '@/lib/credits';
import {
  addSshKeyAction,
  deleteSshKeyAction,
  deleteVpsAction,
  orderVpsAction,
  vpsPowerAction,
  type SshKeyDto,
  type VpsInstanceDto,
  type VpsPlanDto,
} from './vps-actions';

const STATUS_LABEL: Record<VpsInstanceDto['status'], string> = {
  PROVISIONING: 'Tworzenie…',
  RUNNING: 'Działa',
  STOPPED: 'Zatrzymany',
  REBOOTING: 'Restart…',
  ERROR: 'Błąd',
  DELETING: 'Usuwanie…',
  DELETED: 'Usunięty',
};

const STATUS_DOT: Record<VpsInstanceDto['status'], string> = {
  PROVISIONING: 'bg-amber-400',
  RUNNING: 'bg-emerald-400',
  STOPPED: 'bg-neutral-500',
  REBOOTING: 'bg-amber-400',
  ERROR: 'bg-rose-400',
  DELETING: 'bg-rose-400',
  DELETED: 'bg-neutral-600',
};

export function VpsClient({
  available,
  plans,
  instances,
  sshKeys,
}: {
  available: boolean;
  plans: VpsPlanDto[];
  instances: VpsInstanceDto[];
  sshKeys: SshKeyDto[];
}) {
  const router = useRouter();
  const [ordering, setOrdering] = useState(false);
  const [planId, setPlanId] = useState(plans[0]?.id ?? '');
  const [name, setName] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [rootPw, setRootPw] = useState<{ name: string; pw: string } | null>(null);
  // Oświadczenie konsumenckie: natychmiastowe rozpoczęcie świadczenia (upk).
  const [immediateConsent, setImmediateConsent] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedPlan = plans.find((p) => p.id === planId);
  const toggleKey = (id: string) =>
    setSelectedKeys((cur) => (cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id]));

  if (!available) {
    return (
      <PanelEmptyState
        icon={Server}
        title="VPS chwilowo niedostępne"
        description="Sprzedaż serwerów VPS jest teraz wyłączona. Zajrzyj później."
      />
    );
  }

  const onOrder = () => {
    if (!planId) return;
    startTransition(async () => {
      const res = await orderVpsAction({
        planId,
        name: name.trim() || undefined,
        sshKeyIds: selectedKeys.length ? selectedKeys : undefined,
        immediatePerformanceConsent: immediateConsent,
      });
      if (!res.ok) {
        toast.error('Nie udało się zamówić VPS', { description: res.error });
        return;
      }
      toast.success('VPS uruchomiony');
      setOrdering(false);
      setName('');
      setSelectedKeys([]);
      if (res.data?.rootPassword) setRootPw({ name: res.data.name, pw: res.data.rootPassword });
      router.refresh();
    });
  };

  const power = (id: string, action: 'on' | 'off' | 'reboot') =>
    startTransition(async () => {
      const res = await vpsPowerAction(id, action);
      if (!res.ok) toast.error('Operacja nie powiodła się', { description: res.error });
      else {
        toast.success(action === 'on' ? 'Uruchamianie…' : action === 'off' ? 'Zatrzymywanie…' : 'Restart…');
        router.refresh();
      }
    });

  const remove = (id: string) =>
    startTransition(async () => {
      const res = await deleteVpsAction(id);
      if (!res.ok) toast.error('Nie udało się usunąć', { description: res.error });
      else {
        toast.success('VPS usunięty');
        router.refresh();
      }
    });

  return (
    <div className="space-y-6">
      {rootPw ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2">
          <p className="text-sm font-semibold text-amber-100">
            Hasło root dla <span className="font-mono">{rootPw.name}</span> — zapisz teraz, pokazujemy je tylko raz:
          </p>
          <div className="flex items-center gap-2">
            <code className="rounded bg-black/40 px-3 py-1.5 font-mono text-white">{rootPw.pw}</code>
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(rootPw.pw)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs text-amber-100 hover:bg-white/5"
            >
              <Copy className="h-3.5 w-3.5" /> Kopiuj
            </button>
            <button
              type="button"
              onClick={() => setRootPw(null)}
              className="ml-auto text-xs text-neutral-300 hover:text-white"
            >
              Zapisałem, ukryj
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{instances.length} serwer(ów)</p>
        {!ordering ? (
          <button
            type="button"
            onClick={() => setOrdering(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-neutral-200"
          >
            <Plus className="h-4 w-4" /> Zamów VPS
          </button>
        ) : null}
      </div>

      {ordering ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-4">
          <h3 className="font-semibold text-white">Nowy VPS</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {plans.map((p) => {
              const active = p.id === planId;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPlanId(p.id)}
                  className={`rounded-2xl border p-4 text-left transition-all ${
                    active ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.02] hover:border-white/30'
                  }`}
                >
                  <p className="font-bold text-white">{p.name}</p>
                  <div className="mt-2 space-y-1 text-xs text-neutral-300">
                    <span className="flex items-center gap-1.5"><Cpu className="h-3.5 w-3.5 text-neutral-400" /> {p.vcpu} vCPU</span>
                    <span className="flex items-center gap-1.5"><MemoryStick className="h-3.5 w-3.5 text-neutral-400" /> {p.ramGb} GB RAM</span>
                    <span className="flex items-center gap-1.5"><HardDrive className="h-3.5 w-3.5 text-neutral-400" /> {p.diskGb} GB SSD</span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">{formatCredits(p.priceMonthly)}<span className="text-xs font-normal text-neutral-400"> /mies.</span></p>
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-neutral-300">Dostęp do serwera</p>
            {sshKeys.length === 0 ? (
              <p className="text-xs text-neutral-500">
                Brak kluczy SSH — serwer dostanie jednorazowe hasło root. Dodaj klucz poniżej, aby
                logować się bez hasła (bezpieczniej).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sshKeys.map((k) => {
                  const on = selectedKeys.includes(k.id);
                  return (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKey(k.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
                        on ? 'border-emerald-400/60 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-neutral-300 hover:border-white/30'
                      }`}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> {k.name}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-[11px] text-neutral-500">
              {selectedKeys.length > 0
                ? 'Logowanie kluczem SSH — bez hasła root.'
                : 'Bez wybranego klucza pokażemy jednorazowe hasło root.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <label className="flex-1 space-y-1">
              <span className="text-xs text-neutral-400">Nazwa (opcjonalnie)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="np. produkcja-1"
                className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-white/40"
              />
            </label>
            <button
              type="button"
              onClick={onOrder}
              disabled={pending || !selectedPlan || !immediateConsent}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-5 py-2 text-sm font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Zamów i opłać {selectedPlan ? `(${formatCredits(selectedPlan.priceMonthly)})` : ''}
            </button>
            <button type="button" onClick={() => setOrdering(false)} className="text-xs text-neutral-400 hover:text-white">
              Anuluj
            </button>
          </div>
          {/* Zbiorczy checkbox akceptacji (z żądaniem natychmiastowego
              rozpoczęcia świadczenia — art. 15 ust. 3 / 21 ust. 2 upk). */}
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <input
              type="checkbox"
              checked={immediateConsent}
              onChange={(e) => setImmediateConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 accent-emerald-400"
            />
            <span className="text-[11px] leading-relaxed text-neutral-300">
              Zamawiając, akceptuję:{' '}
              <a href="/legal/terms" target="_blank" className="underline hover:text-white">
                Regulamin świadczenia usług Verris
              </a>{' '}
              (wraz z SLA),{' '}
              <a href="/legal/privacy" target="_blank" className="underline hover:text-white">
                Politykę prywatności
              </a>{' '}
              oraz{' '}
              <a href="/legal/dpa" target="_blank" className="underline hover:text-white">
                DPA
              </a>
              , a także <strong className="text-white">żądam rozpoczęcia świadczenia usługi
              przed upływem 14-dniowego terminu odstąpienia</strong> (w razie odstąpienia
              zapłacę za świadczenia spełnione do tej chwili — Regulamin §4 ust. 4 i §21).
            </span>
          </label>
          <p className="text-[11px] text-neutral-500">
            Opłata za pierwszy miesiąc zostanie pobrana z portfela. Kolejne miesiące rozliczamy automatycznie.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        {instances.length === 0 && !ordering ? (
          <PanelEmptyState icon={Server} title="Brak serwerów VPS" description="Zamów pierwszy VPS powyżej." />
        ) : null}
        {instances.map((v) => (
          <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-2 w-2 rounded-full ${STATUS_DOT[v.status]}`} />
                  <p className="font-semibold text-white truncate">{v.name}</p>
                  <span className="text-[11px] text-neutral-400">{STATUS_LABEL[v.status]}</span>
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {v.plan.vcpu} vCPU · {v.plan.ramGb} GB RAM · {v.plan.diskGb} GB
                  {v.ipv4 ? <> · <span className="font-mono text-neutral-300">{v.ipv4}</span></> : null}
                  {v.location ? ` · ${v.location}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <IconBtn title="Start" onClick={() => power(v.id, 'on')} disabled={pending || v.status === 'RUNNING'}>
                  <Play className="h-3.5 w-3.5 text-emerald-300" />
                </IconBtn>
                <IconBtn title="Stop" onClick={() => power(v.id, 'off')} disabled={pending || v.status === 'STOPPED'}>
                  <Power className="h-3.5 w-3.5 text-neutral-300" />
                </IconBtn>
                <IconBtn title="Restart" onClick={() => power(v.id, 'reboot')} disabled={pending}>
                  <RotateCw className="h-3.5 w-3.5 text-neutral-300" />
                </IconBtn>
                <IconBtn title="Usuń" onClick={() => remove(v.id)} disabled={pending} danger>
                  <Trash2 className="h-3.5 w-3.5 text-rose-300" />
                </IconBtn>
              </div>
            </div>
            {v.status === 'ERROR' ? (
              <p className="mt-2 text-xs text-rose-300">Provisioning nie powiódł się — środki zwrócono do portfela.</p>
            ) : null}
          </div>
        ))}
      </div>

      <SshKeysSection keys={sshKeys} />
    </div>
  );
}

function SshKeysSection({ keys }: { keys: SshKeyDto[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [pending, startTransition] = useTransition();

  const add = () =>
    startTransition(async () => {
      const res = await addSshKeyAction({ name: name.trim(), publicKey: publicKey.trim() });
      if (!res.ok) {
        toast.error('Nie udało się dodać klucza', { description: res.error });
        return;
      }
      toast.success('Klucz SSH dodany');
      setName('');
      setPublicKey('');
      setAdding(false);
      router.refresh();
    });

  const del = (id: string) =>
    startTransition(async () => {
      const res = await deleteSshKeyAction(id);
      if (!res.ok) toast.error('Nie udało się usunąć klucza', { description: res.error });
      else {
        toast.success('Klucz SSH usunięty');
        router.refresh();
      }
    });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-emerald-300" /> Klucze SSH
        </p>
        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" /> Dodaj klucz
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa (np. laptop)"
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400/60"
          />
          <textarea
            value={publicKey}
            onChange={(e) => setPublicKey(e.target.value)}
            placeholder="ssh-ed25519 AAAA... user@host"
            rows={3}
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-xs font-mono text-white outline-none focus:border-emerald-400/60"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={add}
              disabled={pending || !name.trim() || !publicKey.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-emerald-600 disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Zapisz klucz
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-xs text-neutral-400 hover:text-white">
              Anuluj
            </button>
          </div>
        </div>
      ) : null}

      {keys.length === 0 && !adding ? (
        <p className="text-xs text-neutral-500">Brak kluczy SSH.</p>
      ) : (
        <div className="space-y-1.5">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{k.name}</p>
                <p className="text-[11px] font-mono text-neutral-500 truncate">{k.fingerprint}</p>
              </div>
              <button
                type="button"
                onClick={() => del(k.id)}
                disabled={pending}
                className="p-1.5 rounded-lg border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-50"
                title="Usuń klucz"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-300" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  disabled,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-2 rounded-lg border border-white/10 disabled:opacity-40 ${
        danger ? 'hover:bg-rose-500/10 hover:border-rose-500/40' : 'hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  );
}
