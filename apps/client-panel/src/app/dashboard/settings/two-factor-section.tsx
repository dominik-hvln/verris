'use client';

import { useEffect, useState, useTransition } from 'react';
import { Shield, ShieldCheck, Loader2, Copy, AlertCircle, Check } from 'lucide-react';
import {
  confirmTwoFactorAction,
  disableTwoFactorAction,
  enrollTwoFactorAction,
  getTwoFactorStatus,
  type TwoFactorStatus,
} from './two-factor-actions';

type Stage = 'idle' | 'enrolling' | 'confirming' | 'enabled' | 'disabling';

interface Props {
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function TwoFactorSection({ showToast }: Props) {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [stage, setStage] = useState<Stage>('idle');
  const [secret, setSecret] = useState<string | null>(null);
  const [otpauthUri, setOtpauthUri] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getTwoFactorStatus().then((s) => {
      if (cancelled) return;
      setStatus(s);
      if (s?.enabled) setStage('enabled');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    const s = await getTwoFactorStatus();
    setStatus(s);
  };

  const startEnroll = () => {
    startTransition(async () => {
      const res = await enrollTwoFactorAction();
      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }
      setSecret(res.secret);
      setOtpauthUri(res.otpauthUri);
      setStage('confirming');
    });
  };

  const confirmEnroll = () => {
    if (code.replace(/\D/g, '').length !== 6) {
      showToast('Wprowadź 6-cyfrowy kod z aplikacji TOTP', 'error');
      return;
    }
    startTransition(async () => {
      const res = await confirmTwoFactorAction(code);
      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }
      setRecoveryCodes(res.recoveryCodes);
      setStage('enabled');
      setSecret(null);
      setOtpauthUri(null);
      setCode('');
      showToast('2FA włączone. Zapisz kody zapasowe!', 'success');
      await reload();
    });
  };

  const startDisable = () => {
    setStage('disabling');
    setDisablePassword('');
    setDisableCode('');
  };

  const confirmDisable = () => {
    if (!disablePassword.trim() && !disableCode.trim()) {
      showToast('Podaj hasło lub kod TOTP, aby wyłączyć 2FA', 'error');
      return;
    }
    startTransition(async () => {
      const res = await disableTwoFactorAction({
        password: disablePassword,
        code: disableCode,
      });
      if (!res.ok) {
        showToast(res.error, 'error');
        return;
      }
      setStage('idle');
      setStatus({
        enabled: false,
        enrolledAt: null,
        pendingEnrollment: false,
        recoveryCodesRemaining: 0,
      });
      setRecoveryCodes(null);
      showToast('2FA zostało wyłączone.', 'success');
      await reload();
    });
  };

  // ----------------------------- UI -----------------------------

  if (!status) {
    return (
      <SectionShell>
        <div className="flex items-center gap-3 text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Ładowanie statusu 2FA…
        </div>
      </SectionShell>
    );
  }

  if (stage === 'enabled' && status.enabled) {
    return (
      <SectionShell>
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 shrink-0">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white mb-1">
              Uwierzytelnianie dwuetapowe jest aktywne
            </p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Włączone od{' '}
              {status.enrolledAt
                ? new Date(status.enrolledAt).toLocaleString('pl-PL')
                : '—'}
              . Pozostało <strong>{status.recoveryCodesRemaining}</strong> kodów
              zapasowych.
            </p>
          </div>
          <button
            onClick={startDisable}
            disabled={pending}
            className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-400/20 disabled:opacity-50"
          >
            Wyłącz
          </button>
        </div>

        {recoveryCodes && (
          <RecoveryCodesPanel codes={recoveryCodes} onDismiss={() => setRecoveryCodes(null)} />
        )}
      </SectionShell>
    );
  }

  if (stage === 'disabling') {
    return (
      <SectionShell>
        <div className="flex items-start gap-4 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-400/30 text-rose-300 shrink-0">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-white mb-1">Wyłączanie 2FA</p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Aby wyłączyć dwuetapowe uwierzytelnianie podaj <strong>hasło</strong> lub
              aktualny <strong>6-cyfrowy kod</strong> z aplikacji TOTP.
            </p>
          </div>
        </div>

        <div className="space-y-4 max-w-md">
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Hasło
            </span>
            <input
              type="password"
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="Hasło konta"
              className={inputClass}
              autoComplete="current-password"
            />
          </label>
          <div className="text-xs text-neutral-500 text-center">— lub —</div>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Kod TOTP
            </span>
            <input
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="6 cyfr"
              maxLength={6}
              inputMode="numeric"
              className={`${inputClass} font-mono`}
            />
          </label>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={confirmDisable}
            disabled={pending}
            className="rounded-xl border border-rose-400/40 bg-rose-400/10 px-5 py-2.5 text-sm font-bold text-rose-100 hover:bg-rose-400/20 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Wyłącz 2FA'}
          </button>
          <button
            onClick={() => setStage('enabled')}
            disabled={pending}
            className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
          >
            Anuluj
          </button>
        </div>
      </SectionShell>
    );
  }

  if (stage === 'confirming' && otpauthUri && secret) {
    return (
      <SectionShell>
        <div className="flex items-start gap-4 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-white shrink-0">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-white mb-1">Krok 1: Zeskanuj kod QR</p>
            <p className="text-sm text-neutral-400 leading-relaxed">
              Otwórz aplikację autoryzującą (Google Authenticator, 1Password, Authy, …)
              i zeskanuj kod poniżej. Następnie wpisz wygenerowany 6-cyfrowy kod, by
              potwierdzić.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-center">
          <div className="rounded-2xl border border-white/10 bg-white p-3 self-start">
            <img
              alt="QR code do TOTP"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                otpauthUri,
              )}`}
              width={180}
              height={180}
            />
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1">
                Sekret (manualne wprowadzenie)
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm font-mono text-white break-all">
                  {secret}
                </code>
                <CopyButton value={secret} />
              </div>
            </div>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-1 block">
                Krok 2: Kod z aplikacji
              </span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\s/g, ''))}
                placeholder="123 456"
                maxLength={6}
                inputMode="numeric"
                className={`${inputClass} font-mono text-lg tracking-widest`}
              />
            </label>

            <div className="flex gap-3">
              <button
                onClick={confirmEnroll}
                disabled={pending}
                className="rounded-xl bg-white text-black hover:bg-neutral-200 px-5 py-2.5 text-sm font-bold disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Potwierdź i włącz 2FA
              </button>
              <button
                onClick={() => {
                  setStage('idle');
                  setSecret(null);
                  setOtpauthUri(null);
                  setCode('');
                }}
                disabled={pending}
                className="rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-50"
              >
                Anuluj
              </button>
            </div>
          </div>
        </div>
      </SectionShell>
    );
  }

  // Default state: 2FA disabled, show CTA
  return (
    <SectionShell>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-neutral-300 shrink-0">
          <Shield className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-white mb-1">
            Uwierzytelnianie dwuetapowe (2FA)
          </p>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Drugi czynnik logowania w postaci kodu z aplikacji TOTP. Zalecane dla
            kont z dostępem administracyjnym oraz finansowym.
          </p>
        </div>
        <button
          onClick={startEnroll}
          disabled={pending}
          className="rounded-xl bg-white text-black hover:bg-neutral-200 px-5 py-2.5 text-sm font-bold disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Włącz 2FA'}
        </button>
      </div>
    </SectionShell>
  );
}

function RecoveryCodesPanel({
  codes,
  onDismiss,
}: {
  codes: string[];
  onDismiss: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5">
      <p className="font-semibold text-amber-200 mb-2">
        Zachowaj swoje kody zapasowe!
      </p>
      <p className="text-xs text-amber-200/80 mb-4">
        Każdy kod może być użyty <strong>tylko raz</strong>, gdy zgubisz dostęp do
        aplikacji TOTP. Wydrukuj je albo zapisz w menedżerze haseł — po opuszczeniu
        tej strony już ich nie zobaczysz.
      </p>
      <div className="grid grid-cols-2 gap-2 mb-4 font-mono text-sm">
        {codes.map((code) => (
          <code
            key={code}
            className="rounded-md border border-amber-400/20 bg-black/60 px-3 py-2 text-amber-100"
          >
            {code}
          </code>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <CopyButton value={codes.join('\n')} label="Skopiuj wszystkie" />
        <button
          onClick={onDismiss}
          className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
        >
          Zapisałem, ukryj
        </button>
      </div>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // ignore
        }
      }}
      className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white hover:bg-white/10"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      {copied ? 'Skopiowano' : (label ?? 'Kopiuj')}
    </button>
  );
}

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/20 bg-white/5 p-6">{children}</div>
  );
}

const inputClass =
  'mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2.5 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600';
