'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Copy, Check, Users2, Wallet, TrendingUp, Link2, Lock } from 'lucide-react';
import {
  fetchResellerOverview,
  fetchResellerClients,
  applyReseller,
  createResellerClient,
  setResellerMarkup,
  type ResellerOverview,
  type ResellerClient as Client,
} from './actions';
import { liczba } from '@/lib/liczba';
import { days } from '@/lib/pl';
import { KlientResellera } from './reseller-klient';
import { MarkaResellera } from './reseller-marka';
import { clientFeatures } from '@/lib/client-features';
import { fetchPartnerOverview, requestWalletPayoutAction, type PartnerOverview } from '../referral/actions';

const pln = (n: number) => `${liczba(n, 2)} K`;
/**
 * Narzut widoczny dopiero po włączeniu flagi (razem z FEATURE_RESELLER_MARKUP w API) — od tego momentu
 * klienci resellera płacą cenę z narzutem, a narzut wraca do resellera jako prowizja (O-07).
 */
const narzutWlaczony = clientFeatures.resellerMarkup;

export function ResellerClient() {
  const [ov, setOv] = useState<ResellerOverview | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [state, setState] = useState<'loading' | 'reseller' | 'not'>('loading');
  const [copied, setCopied] = useState(false);
  const [marka, setMarka] = useState('');
  const [wysylam, setWysylam] = useState(false);

  const [nowy, setNowy] = useState({ email: '', firstName: '', lastName: '' });
  const [zakladam, setZakladam] = useState(false);
  const zaloz = async (e: React.FormEvent) => {
    e.preventDefault();
    setZakladam(true);
    const r = await createResellerClient(nowy);
    setZakladam(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success(
      r.data.mailWyslany ? `Konto założone — ${r.data.email} dostał link do ustawienia hasła.` : 'Konto założone, ale mail nie wyszedł — napisz do nas.',
      { description: `Dziś możesz założyć jeszcze ${r.data.pozostaloDzis}.` },
    );
    setNowy({ email: '', firstName: '', lastName: '' });
    fetchResellerClients().then(setClients);
  };

  const [narzut, setNarzut] = useState<string | null>(null);
  const zapiszNarzut = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number.parseInt(narzut ?? '', 10);
    if (!Number.isInteger(v) || v < 0 || v > 300) {
      toast.error('Narzut: liczba całkowita od 0 do 300%.');
      return;
    }
    const r = await setResellerMarkup(v);
    if (r.ok) {
      setOv(r.data);
      setNarzut(null);
      toast.success(`Narzut ustawiony: ${r.data.markupPct}%. Obowiązuje przy nowych zamówieniach i zmianach planu klientów.`);
    } else toast.error(r.error);
  };

  const zloz = async () => {
    setWysylam(true);
    const r = await applyReseller(marka);
    setWysylam(false);
    if (r.ok) {
      setOv(r.data);
      setState('reseller');
    } else toast.error(r.error);
  };

  useEffect(() => {
    fetchResellerOverview().then((r) => {
      if (r.ok) {
        setOv(r.data);
        setState('reseller');
        fetchResellerClients().then(setClients);
      } else {
        setState('not');
      }
    });
  }, []);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
  };

  if (state === 'loading') {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div>;
  }

  if (state === 'not' || !ov) {
    return (
      <section className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center space-y-3">
        <Lock className="mx-auto h-9 w-9 text-neutral-500" />
        <h2 className="text-lg font-semibold text-white">Konto resellera nie jest aktywne</h2>
        <p className="mx-auto max-w-md text-sm text-neutral-400">
          {narzutWlaczony
            ? 'Program white-label pozwala odsprzedawać hosting pod własną marką z własnym narzutem.'
            : 'Program white-label pozwala obsługiwać klientów pod własną marką — wszystkich z jednego panelu.'}
          {' '}Złóż wniosek — sprawdzimy konto i włączymy program, zwykle w ciągu jednego dnia roboczego.
          {narzutWlaczony ? ' Startowy narzut to 20%.' : null}
        </p>
        <label className="mx-auto block max-w-sm text-left text-sm font-medium text-white">
          Nazwa Twojej marki (opcjonalnie)
          <input value={marka} onChange={(e) => setMarka(e.target.value)} maxLength={80} placeholder="np. Studio WWW Kowalski" className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
        </label>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => void zloz()} disabled={wysylam} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            {wysylam ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Złóż wniosek
          </button>
          <Link href="/dashboard/support" className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/5">Mam pytania</Link>
        </div>
      </section>
    );
  }

  const suspended = ov.status === 'SUSPENDED';
  const pending = ov.status === 'PENDING';

  return (
    <div className="space-y-6">
      {pending ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Wniosek przyjęty — sprawdzamy konto. Link zaproszenia zacznie przypisywać klientów dopiero po włączeniu programu — status zmieni się tutaj.
        </p>
      ) : null}
      {suspended ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Twoje konto resellera jest tymczasowo zawieszone. Skontaktuj się z nami w razie pytań.
        </p>
      ) : null}

      {narzutWlaczony ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat icon={<Users2 className="h-4 w-4" />} label="Klienci" value={String(ov.clientsCount)} />
          <Stat icon={<TrendingUp className="h-4 w-4" />} label="Twój narzut" value={`+${ov.markupPct}%`} accent />
          <Stat icon={<Wallet className="h-4 w-4" />} label="Przychód detaliczny / mies." value={pln(ov.monthlyRetail)} accent />
          <Stat icon={<Wallet className="h-4 w-4" />} label="Koszt hurtowy / mies." value={pln(ov.monthlyWholesale)} />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Stat icon={<Users2 className="h-4 w-4" />} label="Klienci" value={String(ov.clientsCount)} />
          <Stat icon={<Wallet className="h-4 w-4" />} label="Abonamenty klientów / mies." value={pln(ov.monthlyWholesale)} />
        </div>
      )}

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2"><Link2 className="h-4 w-4 text-emerald-400" /> Link zapraszający klientów</h3>
        <p className="text-sm text-neutral-400">Klient, który zarejestruje się z tego linku, zostanie przypisany do Ciebie:</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 break-all rounded-lg bg-black/50 border border-white/10 px-3 py-2 text-sm text-emerald-300 font-mono">{ov.inviteLink}</code>
          <button onClick={() => copy(ov.inviteLink)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-500">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Skopiowano' : 'Kopiuj'}</button>
        </div>
        {ov.brandName ? <p className="text-xs text-neutral-500">Marka: <span className="text-neutral-300">{ov.brandName}</span></p> : null}
      </section>

      {ov.status === 'ACTIVE' ? <MarkaResellera ov={ov} onZmiana={setOv} /> : null}

      {narzutWlaczony && ov.status === 'ACTIVE' ? (
        <form onSubmit={(e) => void zapiszNarzut(e)} className="flex flex-wrap items-end gap-2 rounded-2xl border border-white/10 bg-black/30 p-5">
          <label className="text-sm font-medium text-white">
            Twój narzut do ceny hurtowej (%, 0–300)
            {/* Bez min/max: zakres sprawdza zapiszNarzut i mówi o nim w panelu, a nie systemowym dymkiem przeglądarki. */}
            <input
              inputMode="numeric"
              value={narzut ?? String(ov.markupPct)}
              onChange={(e) => setNarzut(e.target.value)}
              className="mt-1 block w-32 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <button type="submit" disabled={narzut === null || narzut === String(ov.markupPct)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
            Zapisz narzut
          </button>
          <p className="w-full text-xs text-neutral-500">Cena dla Twoich klientów = cena hurtowa × (1 + narzut). Nowy narzut obowiązuje przy kolejnych zamówieniach i zmianach planu — opłacone usługi odnawiają się dotychczasową ceną.</p>
        </form>
      ) : null}

      {narzutWlaczony && ov.status === 'ACTIVE' ? <ProwizjeZNarzutu /> : null}

      {ov.status === 'ACTIVE' ? (
        <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-white">Załóż konto klientowi</h3>
          <p className="text-sm text-neutral-400">
            Klient dostanie od Verris e-mail z informacją, że konto założyła {ov.brandName ? <b className="text-neutral-200">{ov.brandName}</b> : 'Twoja firma'}, i link do ustawienia hasła (ważny 72 h). Do 10 nowych kont na dobę.
          </p>
          <form onSubmit={(e) => void zaloz(e)} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
            <input type="email" required value={nowy.email} onChange={(e) => setNowy({ ...nowy, email: e.target.value })} placeholder="e-mail klienta" aria-label="E-mail klienta" maxLength={254} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
            <input required value={nowy.firstName} onChange={(e) => setNowy({ ...nowy, firstName: e.target.value })} placeholder="imię" aria-label="Imię" maxLength={80} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
            <input required value={nowy.lastName} onChange={(e) => setNowy({ ...nowy, lastName: e.target.value })} placeholder="nazwisko" aria-label="Nazwisko" maxLength={80} className="rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500" />
            <button type="submit" disabled={zakladam} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              {zakladam ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Załóż konto
            </button>
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-white/10 bg-black/30 p-5">
        <h3 className="mb-3 text-sm font-semibold text-white">Twoi klienci</h3>
        {clients.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">Nie masz jeszcze klientów. Udostępnij link zapraszający, aby ich pozyskać.</p>
        ) : (
          <div className="space-y-2">
            {clients.map((c) => (
              <KlientResellera
                key={c.id}
                klient={c}
                aktywny={ov.status === 'ACTIVE'}
                onOdpiety={() => {
                  setClients((l) => l.filter((x) => x.id !== c.id));
                  fetchResellerOverview().then((r) => r.ok && setOv(r.data));
                }}
              />
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-neutral-500">
        {narzutWlaczony
          ? 'Klienci płacą w swoim panelu cenę z Twoim narzutem (z portfela). Część opłaty odpowiadającą narzutowi naliczamy Ci jako prowizję. Klient odpięty od Ciebie wraca do cen z cennika. Twoja marka na fakturach — w kolejnym etapie.'
          : 'Klienci płacą za usługi bezpośrednio w swoim panelu, po cenach z cennika Verris. Własny narzut, rozliczenia między Tobą a klientami i Twoja marka na fakturach — w kolejnym etapie.'}
      </p>
    </div>
  );
}

/** O-07 — prowizje z narzutu (część opłat klientów) i wypłata do portfela przez endpointy programu partnerskiego. */
function ProwizjeZNarzutu() {
  const [p, setP] = useState<PartnerOverview | null>(null);
  const [wyplacam, setWyplacam] = useState(false);
  const odswiez = () => fetchPartnerOverview().then(setP).catch(() => setP(null));
  useEffect(() => {
    void odswiez();
  }, []);
  if (!p) return null;
  const wyplac = async () => {
    setWyplacam(true);
    const r = await requestWalletPayoutAction();
    setWyplacam(false);
    if (r.ok) {
      toast.success(`Wypłaciliśmy ${pln(r.amount ?? 0)} do Twojego portfela.`);
      void odswiez();
    } else toast.error(r.error ?? 'Nie udało się wypłacić prowizji.');
  };
  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5 space-y-3">
      <h3 className="text-sm font-semibold text-white">Twoje prowizje z narzutu</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat icon={<Wallet className="h-4 w-4" />} label="Do wypłaty" value={pln(p.resellerMarkup.available)} accent />
        <Stat icon={<Wallet className="h-4 w-4" />} label={`W karencji (${days(p.config.holdDays)})`} value={pln(p.resellerMarkup.pending)} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void wyplac()} disabled={wyplacam || !p.payout.canRequestWallet} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {wyplacam ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Wypłać do portfela
        </button>
        <p className="text-xs text-neutral-500">Narzut z każdej opłaty klienta naliczamy co godzinę; po karencji trafia do wypłaty. Wypłata obejmuje wszystkie dostępne prowizje.</p>
      </div>
    </section>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-black/30'}`}>
      <div className="flex items-center gap-1.5 text-xs text-neutral-400">{icon} {label}</div>
      <p className={`mt-1.5 text-xl font-bold ${accent ? 'text-emerald-300' : 'text-white'}`}>{value}</p>
    </div>
  );
}
