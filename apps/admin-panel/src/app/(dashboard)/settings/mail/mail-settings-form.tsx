'use client';

import { useActionState, useState } from 'react';
import { Loader2, Save, Send } from 'lucide-react';
import {
  testMailSettingsAction,
  updateMailSettingsAction,
  type MailSettingsForm,
} from './actions';

export function MailSettingsForm({ initial }: { initial: MailSettingsForm }) {
  const [state, action, pending] = useActionState(updateMailSettingsAction, {});
  const [transport, setTransport] = useState<'local' | 'external'>(initial.transport);
  const [testState, setTestState] = useState<{ ok?: boolean; error?: string; to?: string }>({});
  const [testing, setTesting] = useState(false);

  async function onTest() {
    setTesting(true);
    setTestState({});
    const result = await testMailSettingsAction();
    setTestState(result);
    setTesting(false);
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <form action={action} className="space-y-8">
        <fieldset className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
          <legend className="text-sm font-bold text-amber-400 uppercase tracking-widest px-1">
            Nadawca
          </legend>
          <TextField name="fromAddress" label="Adres From" defaultValue={initial.fromAddress} />
          <TextField name="fromName" label="Nazwa nadawcy" defaultValue={initial.fromName} />
          <p className="text-xs text-muted-foreground">
            Domyślnie maile idą przez Postfix na serwerze panelu (localhost:25). Ustaw SPF/DKIM dla
            tej domeny nadawczej.
          </p>
        </fieldset>

        <fieldset className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
          <legend className="text-sm font-bold text-sky-400 uppercase tracking-widest px-1">
            Transport SMTP
          </legend>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="transport"
              value="local"
              checked={transport === 'local'}
              onChange={() => setTransport('local')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-white">Lokalny serwer (Postfix)</span>
              <span className="text-xs text-muted-foreground">
                API przekazuje wiadomości na localhost:25 — zalecane na start LIVE.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="radio"
              name="transport"
              value="external"
              checked={transport === 'external'}
              onChange={() => setTransport('external')}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-white">Zewnętrzny relay SMTP</span>
              <span className="text-xs text-muted-foreground">
                Osobny serwer pocztowy — opcjonalnie, gdy będzie osobny MTA.
              </span>
            </span>
          </label>

          {transport === 'external' ? (
            <div className="space-y-4 pt-2 border-t border-white/5">
              <TextField name="smtpHost" label="Host SMTP" defaultValue={initial.smtpHost} />
              <NumberField name="smtpPort" label="Port" defaultValue={initial.smtpPort} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-white">Szyfrowanie</span>
                <select
                  name="smtpSecure"
                  defaultValue={initial.smtpSecure}
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-white"
                >
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="tls">TLS (465)</option>
                  <option value="none">Brak (tylko zaufana sieć)</option>
                </select>
              </label>
              <TextField name="smtpUser" label="Użytkownik SMTP" defaultValue={initial.smtpUser} />
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-white">Hasło SMTP</span>
                <input
                  type="password"
                  name="smtpPassword"
                  autoComplete="new-password"
                  placeholder={
                    initial.smtpPasswordConfigured ? '•••••••• (zostaw puste, aby nie zmieniać)' : ''
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-white"
                />
              </label>
            </div>
          ) : null}
        </fieldset>

        {state.error ? (
          <p className="text-sm text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2">
            {state.error}
          </p>
        ) : null}
        {state.ok ? (
          <p className="text-sm text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-2">
            Zapisano ustawienia poczty.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz
          </button>
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing || pending}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3 text-sm font-bold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Wyślij test na mój e-mail
          </button>
        </div>
      </form>

      {testState.error ? (
        <p className="text-sm text-rose-300 border border-rose-500/30 bg-rose-500/10 rounded-xl px-4 py-2">
          {testState.error}
        </p>
      ) : null}
      {testState.ok ? (
        <p className="text-sm text-emerald-200 border border-emerald-500/30 bg-emerald-500/10 rounded-xl px-4 py-2">
          Wysłano test{testState.to ? ` na ${testState.to}` : ''}. Sprawdź skrzynkę (i spam).
        </p>
      ) : null}
    </div>
  );
}

function TextField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        required
        className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-white focus:border-emerald-500/40 focus:outline-none"
      />
    </label>
  );
}

function NumberField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-white">{label}</span>
      <input
        type="number"
        name={name}
        defaultValue={defaultValue}
        min={1}
        max={65535}
        required
        className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-2.5 text-white focus:border-emerald-500/40 focus:outline-none"
      />
    </label>
  );
}
