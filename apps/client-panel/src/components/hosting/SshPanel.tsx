'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceConnectionInfoDto } from '@verris/contracts';
import { Switch } from '@/components/panel/v2';
import { potwierdz } from '@/components/panel/potwierdz';
import { fetchConnectionInfoAction } from '@/app/dashboard/services/[id]/hosting-connection-actions';
import { fetchSsh, setSsh, setSshKeys, type SshStatus } from '@/app/dashboard/services/[id]/hosting-ssh-actions';

/**
 * C-21/C-22 — SSH konta w klatce (CloudLinux CageFS: widać tylko własne pliki) i klucze SSH.
 * Zmianę wykonuje serwer w ciągu ~1 minuty; stan „włączony” czytamy z konfiguracji konta.
 */
export function SshPanel({ serviceId }: { serviceId: string }) {
  const [stan, setStan] = useState<SshStatus | null>(null);
  const [polaczenie, setPolaczenie] = useState<ServiceConnectionInfoDto | null>(null);
  const [klucze, setKlucze] = useState('');
  const [pending, start] = useTransition();
  // Pole kluczy wypełniamy raz po wczytaniu — potem należy do klienta.
  const wypelnione = useRef(false);

  const odswiez = useCallback(
    () =>
      Promise.all([fetchSsh(serviceId), fetchConnectionInfoAction(serviceId).catch(() => null)]).then(([r, c]) => {
        if (r.ok) {
          setStan(r.status);
          if (!wypelnione.current) {
            wypelnione.current = true;
            setKlucze(r.status.klucze.join('\n'));
          }
        } else toast.error(r.error);
        setPolaczenie(c);
      }),
    [serviceId],
  );

  useEffect(() => {
    void odswiez();
  }, [odswiez]);
  useEffect(() => {
    if (!stan?.wToku) return;
    const t = setInterval(() => void odswiez(), 8_000);
    return () => clearInterval(t);
  }, [stan?.wToku, odswiez]);

  const wlaczony = Boolean(polaczenie?.sshEnabled);

  const przelacz = async (wlacz: boolean) => {
    if (!wlacz && !(await potwierdz('Wyłączyć dostęp SSH do konta? Otwarte sesje zostaną przerwane przy następnym logowaniu.', { akcja: 'Wyłącz', niebezpieczne: true }))) return;
    start(async () => {
      const r = await setSsh(serviceId, wlacz);
      if (r.ok) {
        setStan(r.status);
        toast.success(wlacz ? 'Włączanie SSH zlecone — gotowe w ciągu minuty.' : 'Wyłączanie SSH zlecone.');
      } else toast.error(r.error);
    });
  };

  const zapiszKlucze = () =>
    start(async () => {
      const lista = klucze.split('\n').map((k) => k.trim()).filter(Boolean);
      const r = await setSshKeys(serviceId, lista);
      if (r.ok) {
        setStan(r.status);
        toast.success('Klucze zapisane — zaczną działać w ciągu minuty.');
      } else toast.error(r.error);
    });

  return (
    <section className="rounded-[10px] border border-line bg-card">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="m-0 text-[15px] font-bold text-foreground">Dostęp SSH</h3>
          <p className="m-0 mt-0.5 text-[12.5px] text-muted-foreground">
            Powłoka w odizolowanym środowisku — widzisz tylko pliki swojego konta. Przydaje się do WP-CLI, Composera i Gita.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stan?.wToku ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          <Switch checked={wlaczony} onChange={(v) => void przelacz(v)} label="Dostęp SSH" disabled={pending || !stan || stan.wToku || polaczenie === null} />
        </div>
      </header>

      <div className="space-y-2 px-4 py-3 text-[13px]">
        {wlaczony && polaczenie?.sshHost ? (
          <p className="m-0 text-muted-foreground">
            Połączenie: <span className="font-mono text-foreground">ssh login@{polaczenie.sshHost}</span> — login hostingowy (jak do FTP) i hasło albo klucz poniżej.
          </p>
        ) : (
          <p className="m-0 text-muted-foreground">SSH jest wyłączony.</p>
        )}
        {stan?.ostatnie?.blad ? <p className="m-0 text-crit">{stan.ostatnie.blad}</p> : null}
      </div>

      <div className="border-t border-line px-4 py-3">
        <label htmlFor="ssh-klucze" className="mb-1 block text-[13px] font-medium text-foreground">
          Klucze publiczne (jeden na linię)
        </label>
        <textarea
          id="ssh-klucze"
          value={klucze}
          onChange={(e) => setKlucze(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="ssh-ed25519 AAAA… jan@laptop"
          className="w-full resize-y rounded-[7px] border border-line bg-raised px-3 py-2 font-mono text-[12.5px] text-foreground"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[12px] text-muted-foreground">Klucze dodane ręcznie w ~/.ssh/authorized_keys zostają nietknięte.</p>
          <button type="button" onClick={zapiszKlucze} disabled={pending || !stan || stan.wToku} className="inline-flex items-center gap-2 whitespace-nowrap rounded-[7px] border border-primary bg-primary px-[13px] py-2 text-sm font-semibold text-primary-foreground hover:bg-data-hi disabled:opacity-50">
            Zapisz klucze
          </button>
        </div>
      </div>
    </section>
  );
}
