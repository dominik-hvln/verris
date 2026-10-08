'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PanelCard } from '@/components/panel';
import { potwierdz } from '@/components/panel/potwierdz';
import { bezpiecznaAkcja } from '@/lib/akcja';
import { databases, mailboxes } from '@/lib/pl';
import { odrzucZgodeMigracjiAction, przyjmijZgodeMigracjiAction } from '../actions';
import type { ProsbaOZgode } from '../types';
import { TrescUpowaznienia } from '../upowaznienie';

const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const STAN: Record<Exclude<ProsbaOZgode['stan'], 'oczekuje'>, string> = {
  zaakceptowana: 'Zatwierdzono tę migrację — jest w kolejce albo już trwa. Postęp widzisz w zakładce Migracje.',
  odrzucona: 'Odrzucono tę migrację. Nic nie zostało przeniesione, a podane dane dostępowe usunęliśmy.',
  wygasla: 'Prośba wygasła bez decyzji. Migracja nie wystartowała, a podane dane dostępowe usunęliśmy. Jeśli chcesz przenieść stronę, poproś obsługę o przygotowanie migracji ponownie albo uruchom ją sam(a) w zakładce Migracje.',
  anulowana: 'Ta migracja została anulowana — nic nie zostało przeniesione.',
};

export function ZgodaMigracji({ serviceId, prosba, token }: { serviceId: string; prosba: ProsbaOZgode; token?: string }) {
  const [stan, setStan] = useState<ProsbaOZgode['stan']>(prosba.stan);
  const [busy, setBusy] = useState<'tak' | 'nie' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const z = prosba.zrodlo;
  const linkMigracji = `/dashboard/migrations?serviceId=${encodeURIComponent(serviceId)}`;

  async function zgoda() {
    setBusy('tak');
    setMsg(null);
    const res = await bezpiecznaAkcja(() => przyjmijZgodeMigracjiAction({ serviceId, migrationId: prosba.id, token }));
    setBusy(null);
    if ('error' in res) {
      setMsg(res.error);
      return;
    }
    setStan('zaakceptowana');
  }

  async function odmowa() {
    if (!(await potwierdz('Odrzucić migrację przygotowaną przez obsługę? Usuniemy podane dane dostępowe, a migracja nie wystartuje.', { akcja: 'Nie zgadzam się', niebezpieczne: true }))) {
      return;
    }
    setBusy('nie');
    setMsg(null);
    const res = await bezpiecznaAkcja(() => odrzucZgodeMigracjiAction({ serviceId, migrationId: prosba.id, token }));
    setBusy(null);
    if ('error' in res) {
      setMsg(res.error);
      return;
    }
    setStan('odrzucona');
  }

  return (
    <PanelCard className="space-y-4">
      <div>
        <h2 className="font-semibold text-white">
          Przeniesienie {prosba.targetDomain ?? 'strony'} <span className="text-neutral-500">#{prosba.id.slice(0, 8)}</span>
        </h2>
        <p className="text-xs text-neutral-500">Przygotowane przez nasz zespół {data(prosba.createdAt)}</p>
      </div>

      {z ? (
        <ul className="space-y-1.5 text-sm text-neutral-200">
          {z.ftp ? (
            <li>
              <span className="text-neutral-400">Pliki strony:</span> {z.ftp.protocol.toUpperCase()} {z.ftp.host}:{z.ftp.port}, użytkownik {z.ftp.username}, katalog {z.ftp.remotePath}
            </li>
          ) : null}
          {z.mysql.length > 0 ? (
            <li>
              <span className="text-neutral-400">{databases(z.mysql.length)}:</span>{' '}
              {z.mysql.map((m) => `${m.database} (${m.host})`).join(', ')}
            </li>
          ) : null}
          {z.imap.length > 0 ? (
            <li>
              <span className="text-neutral-400">{mailboxes(z.imap.length)}:</span>{' '}
              {z.imap.map((m) => m.email).join(', ')}
              {z.utworzBrakujaceSkrzynki ? ' — brakujące założymy u nas z tym samym hasłem' : ''}
            </li>
          ) : null}
          <li>
            <span className="text-neutral-400">Domena docelowa:</span> {prosba.targetDomain ?? 'domena konta (domyślna)'}
          </li>
          {z.notes ? (
            <li>
              <span className="text-neutral-400">Uwagi zespołu:</span> {z.notes}
            </li>
          ) : null}
        </ul>
      ) : null}

      {stan === 'oczekuje' ? (
        <>
          <p className="rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-3 py-2 text-xs text-cyan-100/90">
            Migracja nie wystartuje bez Twojej zgody. Hasła są zaszyfrowane, używamy ich tylko na czas transferu i kasujemy po
            zakończeniu. Twoja obecna strona działa bez przerwy aż do przełączenia DNS — ten krok wykonasz sam(a) na końcu.
            Prośba jest ważna do {data(prosba.wygasa)} — potem anulujemy ją i usuniemy dane dostępowe.
          </p>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-neutral-300">
            <TrescUpowaznienia />
          </div>
          {msg ? <p className="text-xs text-rose-300">{msg}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={zgoda}
              disabled={busy !== null}
              className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {busy === 'tak' ? 'Uruchamiam…' : 'Zgadzam się — uruchom migrację'}
            </button>
            <button
              type="button"
              onClick={odmowa}
              disabled={busy !== null}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm text-neutral-300 hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
            >
              {busy === 'nie' ? 'Odrzucam…' : 'Nie zgadzam się'}
            </button>
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-neutral-200">{STAN[stan]}</p>
      )}

      <Link href={linkMigracji} className="inline-block text-sm text-cyan-300 underline">
        Przejdź do Migracji
      </Link>
    </PanelCard>
  );
}
