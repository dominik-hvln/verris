'use client';

import { useEffect, useState, useTransition } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import {
  deletePasskey,
  getPasskeyRegisterOptions,
  getPasskeysAvailable,
  listPasskeys,
  verifyPasskeyRegistration,
  type PasskeyDto,
} from './passkeys-actions';

/**
 * C2 — zarządzanie passkeys (WebAuthn) w panelu klienta. Logowanie passkey
 * dodaje się na ekranie logowania; tutaj klient dodaje/usuwa klucze.
 */
export function PasskeysSection({
  showToast,
}: {
  showToast: (msg: string, type: 'success' | 'error') => void;
}) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [passkeys, setPasskeys] = useState<PasskeyDto[]>([]);
  const [deviceName, setDeviceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const browserSupported =
    typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';

  useEffect(() => {
    void (async () => {
      const [avail, list] = await Promise.all([getPasskeysAvailable(), listPasskeys()]);
      setAvailable(avail);
      setPasskeys(list);
    })();
  }, []);

  const refresh = async () => setPasskeys(await listPasskeys());

  const onAdd = () => {
    setError(null);
    startTransition(async () => {
      const opt = await getPasskeyRegisterOptions();
      if (!opt.ok) {
        setError(opt.error);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const attResp = await startRegistration({ optionsJSON: opt.options as any });
        const verify = await verifyPasskeyRegistration(attResp, deviceName || undefined);
        if (!verify.ok) {
          setError(verify.error);
          return;
        }
        setDeviceName('');
        await refresh();
        showToast?.('Passkey dodany.', 'success');
      } catch (err) {
        setError(
          err instanceof Error && err.name === 'NotAllowedError'
            ? 'Anulowano lub przekroczono czas. Spróbuj ponownie.'
            : err instanceof Error
              ? err.message
              : 'Nie udało się dodać passkey.',
        );
      }
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      const res = await deletePasskey(id);
      if (res.ok) {
        await refresh();
        showToast?.('Passkey usunięty.', 'success');
      } else {
        setError(res.error);
      }
    });
  };

  if (available === false) return null; // RP nie skonfigurowane — ukryj sekcję

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white">Passkeys (klucze dostępu)</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Loguj się odciskiem palca, Face ID lub kluczem sprzętowym — bez hasła. Passkey jest
          odporny na phishing i wyciek hasła. Możesz dodać kilka (telefon, laptop, klucz USB).
        </p>
      </div>

      {!browserSupported && (
        <p className="text-sm text-amber-300">
          Ta przeglądarka nie obsługuje passkeys. Użyj nowszej wersji Chrome / Safari / Edge.
        </p>
      )}

      {passkeys.length > 0 && (
        <ul className="divide-y divide-white/5 rounded-lg border border-white/10">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">
                  {pk.name || 'Passkey'}{' '}
                  <span className="text-xs text-muted-foreground">
                    ({pk.deviceType === 'multiDevice' ? 'synchronizowany' : 'urządzenie'})
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Dodano {new Date(pk.createdAt).toLocaleDateString('pl-PL')}
                  {pk.lastUsedAt
                    ? ` · ostatnio ${new Date(pk.lastUsedAt).toLocaleDateString('pl-PL')}`
                    : ' · nieużywany'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(pk.id)}
                disabled={isPending}
                className="text-xs px-2.5 py-1.5 rounded border border-rose-500/30 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
              >
                Usuń
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="Nazwa (np. iPhone, Laptop)"
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={isPending || !browserSupported}
          className="rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 px-4 py-2 text-sm font-medium text-white"
        >
          {isPending ? 'Dodawanie…' : 'Dodaj passkey'}
        </button>
      </div>

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}
