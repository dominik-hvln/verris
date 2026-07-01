'use client';

import { useState, useTransition } from 'react';
import {
  Megaphone,
  Users,
  Send,
  Plus,
  Trash2,
  Upload,
  Loader2,
  Mail,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import {
  type EmmOverview,
  type EmmList,
  type EmmContact,
  type EmmCampaign,
  fetchLists,
  fetchContacts,
  fetchCampaigns,
  createList,
  deleteList,
  addContact,
  importContacts,
  deleteContact,
  createCampaign,
  sendCampaign,
  deleteCampaign,
} from '../actions';

type Tab = 'lists' | 'campaigns';

export function EmailMarketingClient({
  subscriptionId,
  initialOverview,
  initialLists,
  initialCampaigns,
}: {
  subscriptionId: string;
  initialOverview: EmmOverview;
  initialLists: EmmList[];
  initialCampaigns: EmmCampaign[];
}) {
  const [tab, setTab] = useState<Tab>('lists');
  const [overview, setOverview] = useState(initialOverview);
  const [lists, setLists] = useState(initialLists);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setNotice({ kind, text });
    setTimeout(() => setNotice(null), 4000);
  };
  const refreshLists = async () => {
    const r = await fetchLists(subscriptionId);
    if (r.ok) setLists(r.data);
  };
  const refreshCampaigns = async () => {
    const r = await fetchCampaigns(subscriptionId);
    if (r.ok) setCampaigns(r.data);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <Link href="/dashboard/email-marketing" className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> Wszystkie usługi email-marketingu
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold text-white">
          <Megaphone className="h-6 w-6 text-fuchsia-300" /> Email marketing
        </h1>
      </div>

      <StatsRow overview={overview} />

      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
            notice.kind === 'ok'
              ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200'
              : 'border-rose-400/30 bg-rose-400/10 text-rose-200'
          }`}
        >
          {notice.kind === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {notice.text}
        </div>
      )}

      <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.02] p-1 w-fit">
        {(['lists', 'campaigns'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              tab === t ? 'bg-fuchsia-600 text-white' : 'text-neutral-400 hover:text-white'
            }`}
          >
            {t === 'lists' ? 'Listy i kontakty' : 'Kampanie'}
          </button>
        ))}
      </div>

      {tab === 'lists' ? (
        <ListsTab
          subscriptionId={subscriptionId}
          lists={lists}
          onChange={async () => {
            await refreshLists();
          }}
          flash={flash}
        />
      ) : (
        <CampaignsTab
          subscriptionId={subscriptionId}
          lists={lists}
          campaigns={campaigns}
          onChange={async () => {
            await refreshCampaigns();
          }}
          flash={flash}
        />
      )}
    </div>
  );
}

function StatsRow({ overview }: { overview: EmmOverview }) {
  const contactsCap = overview.limits.maxContacts;
  const sendsCap = overview.limits.monthlySends;
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Stat label="Kontakty" value={`${overview.usage.contacts}${contactsCap !== null ? ` / ${contactsCap}` : ''}`} icon={<Users className="h-4 w-4" />} />
      <Stat label="Wysłane (ten miesiąc)" value={`${overview.usage.sentThisMonth}${sendsCap !== null ? ` / ${sendsCap}` : ''}`} icon={<Send className="h-4 w-4" />} />
      <Stat label="Listy" value={String(overview.lists)} icon={<Mail className="h-4 w-4" />} />
      <Stat label="Kampanie" value={String(overview.campaigns)} icon={<Megaphone className="h-4 w-4" />} />
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span className="text-fuchsia-300">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-xl font-bold text-white">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lists + contacts
// ---------------------------------------------------------------------------

function ListsTab({
  subscriptionId,
  lists,
  onChange,
  flash,
}: {
  subscriptionId: string;
  lists: EmmList[];
  onChange: () => Promise<void>;
  flash: (k: 'ok' | 'err', t: string) => void;
}) {
  const [name, setName] = useState('');
  const [doubleOptIn, setDoubleOptIn] = useState(true);
  const [fromName, setFromName] = useState('');
  const [replyTo, setReplyTo] = useState('');
  const [pending, start] = useTransition();
  const [openList, setOpenList] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      const r = await createList(subscriptionId, {
        name,
        doubleOptIn,
        fromName: fromName || undefined,
        replyTo: replyTo || undefined,
      });
      if (r.ok) {
        setName(''); setFromName(''); setReplyTo('');
        flash('ok', 'Lista utworzona.');
        await onChange();
      } else flash('err', r.error);
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Nowa lista</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa listy (np. Newsletter)" className="emm-inp" />
          <input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Nazwa nadawcy (opcjonalnie)" className="emm-inp" />
          <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Reply-to e-mail (opcjonalnie)" className="emm-inp" />
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input type="checkbox" checked={doubleOptIn} onChange={(e) => setDoubleOptIn(e.target.checked)} className="h-4 w-4 accent-fuchsia-500" />
            Double opt-in (zalecane, RODO)
          </label>
        </div>
        <button onClick={submit} disabled={pending} className="emm-btn mt-3">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Utwórz listę
        </button>
      </section>

      {lists.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-neutral-400">Brak list. Utwórz pierwszą powyżej.</p>
      ) : (
        <div className="space-y-3">
          {lists.map((l) => (
            <ListCard
              key={l.id}
              subscriptionId={subscriptionId}
              list={l}
              open={openList === l.id}
              onToggle={() => setOpenList(openList === l.id ? null : l.id)}
              onChange={onChange}
              flash={flash}
            />
          ))}
        </div>
      )}
      <style jsx>{`
        :global(.emm-inp){width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);padding:.5rem .7rem;font-size:.875rem;color:#fff;outline:none}
        :global(.emm-btn){display:inline-flex;align-items:center;gap:.5rem;border-radius:.7rem;background:#c026d3;padding:.5rem .9rem;font-size:.85rem;font-weight:600;color:#fff}
        :global(.emm-btn:disabled){opacity:.5}
      `}</style>
    </div>
  );
}

function ListCard({
  subscriptionId,
  list,
  open,
  onToggle,
  onChange,
  flash,
}: {
  subscriptionId: string;
  list: EmmList;
  open: boolean;
  onToggle: () => void;
  onChange: () => Promise<void>;
  flash: (k: 'ok' | 'err', t: string) => void;
}) {
  const [contacts, setContacts] = useState<EmmContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [csv, setCsv] = useState('');
  const [consent, setConsent] = useState(false);
  const [pending, start] = useTransition();

  const load = async () => {
    setLoading(true);
    const r = await fetchContacts(subscriptionId, list.id);
    if (r.ok) setContacts(r.data);
    setLoading(false);
  };
  const toggle = () => {
    if (!open && contacts === null) void load();
    onToggle();
  };

  const add = () => {
    if (!email.trim()) return;
    start(async () => {
      const r = await addContact(subscriptionId, list.id, { email, firstName: firstName || undefined });
      if (r.ok) { setEmail(''); setFirstName(''); flash('ok', list.doubleOptIn ? 'Dodano — wysłaliśmy mail z potwierdzeniem.' : 'Kontakt dodany.'); await load(); await onChange(); }
      else flash('err', r.error);
    });
  };

  const doImport = () => {
    const rows = csv
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [e, fn, ln] = line.split(/[,;\t]/).map((s) => s?.trim());
        return { email: e, firstName: fn || undefined, lastName: ln || undefined };
      })
      .filter((r) => r.email && r.email.includes('@'));
    if (rows.length === 0) { flash('err', 'Brak prawidłowych adresów w danych.'); return; }
    if (!consent) { flash('err', 'Potwierdź podstawę prawną (zgodę) kontaktów.'); return; }
    start(async () => {
      const r = await importContacts(subscriptionId, list.id, rows, consent);
      if (r.ok) { setCsv(''); setConsent(false); flash('ok', `Zaimportowano ${r.data.added}, pominięto ${r.data.skipped}.`); await load(); await onChange(); }
      else flash('err', r.error);
    });
  };

  const remove = (id: string) => {
    start(async () => {
      const r = await deleteContact(subscriptionId, list.id, id);
      if (r.ok) { await load(); await onChange(); } else flash('err', r.error);
    });
  };
  const removeList = () => {
    start(async () => {
      const r = await deleteList(subscriptionId, list.id);
      if (r.ok) { flash('ok', 'Lista usunięta.'); await onChange(); } else flash('err', r.error);
    });
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
      <div className="flex items-center justify-between gap-3 p-4">
        <button onClick={toggle} className="flex-1 text-left">
          <p className="text-sm font-semibold text-white">{list.name}</p>
          <p className="mt-0.5 text-xs text-neutral-400">
            {list.subscribed} potwierdzonych · {list.pending} oczekujących · {list.unsubscribed} wypisanych
            {list.doubleOptIn ? ' · double opt-in' : ''}
          </p>
        </button>
        <button onClick={removeList} disabled={pending} className="rounded-lg border border-rose-400/30 p-2 text-rose-300 hover:bg-rose-400/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <div className="space-y-4 border-t border-white/10 p-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="adres@email.pl" className="emm-inp2" />
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Imię (opcjonalnie)" className="emm-inp2" />
            <button onClick={add} disabled={pending} className="emm-btn2">
              <Plus className="h-4 w-4" /> Dodaj
            </button>
          </div>

          <details className="rounded-xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer text-xs font-medium text-neutral-300">Import masowy (CSV: email,imię,nazwisko — jeden na linię)</summary>
            <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder={'jan@firma.pl,Jan,Kowalski\nanna@firma.pl,Anna'} className="emm-inp2 mt-2 font-mono text-xs" />
            <label className="mt-2 flex items-start gap-2 text-[11px] text-neutral-400">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 accent-fuchsia-500" />
              Oświadczam, że posiadam zgodę marketingową tych kontaktów (podstawa prawna RODO).
            </label>
            <button onClick={doImport} disabled={pending} className="emm-btn2 mt-2">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Importuj
            </button>
          </details>

          {loading ? (
            <p className="text-xs text-neutral-400">Ładowanie kontaktów…</p>
          ) : contacts && contacts.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-white/10">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-2 border-b border-white/5 px-3 py-2 text-sm last:border-0">
                  <div className="min-w-0">
                    <p className="truncate text-white">{c.email}</p>
                    <p className="text-[11px] text-neutral-500">
                      {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'} · <ContactStatus status={c.status} />
                    </p>
                  </div>
                  <button onClick={() => remove(c.id)} className="text-neutral-500 hover:text-rose-300">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-neutral-500">Brak kontaktów na tej liście.</p>
          )}
        </div>
      )}
      <style jsx>{`
        :global(.emm-inp2){width:100%;border-radius:.55rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.35);padding:.45rem .6rem;font-size:.8rem;color:#fff;outline:none}
        :global(.emm-btn2){display:inline-flex;align-items:center;justify-content:center;gap:.4rem;border-radius:.6rem;background:rgba(192,38,211,.85);padding:.45rem .8rem;font-size:.8rem;font-weight:600;color:#fff;white-space:nowrap}
        :global(.emm-btn2:disabled){opacity:.5}
      `}</style>
    </div>
  );
}

function ContactStatus({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    SUBSCRIBED: { t: 'potwierdzony', c: 'text-emerald-300' },
    PENDING: { t: 'oczekuje', c: 'text-amber-300' },
    UNSUBSCRIBED: { t: 'wypisany', c: 'text-neutral-400' },
    BOUNCED: { t: 'odbity', c: 'text-rose-300' },
    COMPLAINED: { t: 'spam', c: 'text-rose-300' },
  };
  const v = map[status] ?? { t: status, c: 'text-neutral-400' };
  return <span className={v.c}>{v.t}</span>;
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function CampaignsTab({
  subscriptionId,
  lists,
  campaigns,
  onChange,
  flash,
}: {
  subscriptionId: string;
  lists: EmmList[];
  campaigns: EmmCampaign[];
  onChange: () => Promise<void>;
  flash: (k: 'ok' | 'err', t: string) => void;
}) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [listId, setListId] = useState(lists[0]?.id ?? '');
  const [pending, start] = useTransition();

  const create = () => {
    if (!name.trim() || !subject.trim() || !body.trim() || !listId) {
      flash('err', 'Uzupełnij nazwę, temat, treść i listę.');
      return;
    }
    start(async () => {
      const r = await createCampaign(subscriptionId, { name, subject, bodyMarkdown: body, listId });
      if (r.ok) { setName(''); setSubject(''); setBody(''); flash('ok', 'Kampania zapisana jako robocza.'); await onChange(); }
      else flash('err', r.error);
    });
  };
  const send = (id: string) => {
    start(async () => {
      const r = await sendCampaign(subscriptionId, id);
      if (r.ok) { flash('ok', 'Wysyłka rozpoczęta — kampania jest wysyłana w tle.'); await onChange(); }
      else flash('err', r.error);
    });
  };
  const remove = (id: string) => {
    start(async () => {
      const r = await deleteCampaign(subscriptionId, id);
      if (r.ok) { await onChange(); } else flash('err', r.error);
    });
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-3 text-sm font-semibold text-white">Nowa kampania</h2>
        {lists.length === 0 ? (
          <p className="text-sm text-amber-200">Najpierw utwórz listę z kontaktami w zakładce „Listy i kontakty".</p>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa kampanii (wewnętrzna)" className="emm-inp" />
              <select value={listId} onChange={(e) => setListId(e.target.value)} className="emm-inp">
                {lists.map((l) => (
                  <option key={l.id} value={l.id} className="bg-neutral-900">
                    {l.name} ({l.subscribed} odb.)
                  </option>
                ))}
              </select>
            </div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Temat wiadomości" className="emm-inp" />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder={'Treść (Markdown: # nagłówek, **pogrubienie**, [link](url)).'} className="emm-inp font-mono text-xs" />
            <button onClick={create} disabled={pending} className="emm-btn">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Zapisz roboczą
            </button>
          </div>
        )}
      </section>

      {campaigns.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-black/20 p-6 text-center text-sm text-neutral-400">Brak kampanii.</p>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <div key={c.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{c.name}</p>
                  <p className="mt-0.5 truncate text-xs text-neutral-400">„{c.subject}" → {c.listName ?? 'lista'}</p>
                </div>
                <CampaignStatus status={c.status} />
              </div>
              {(c.status === 'SENDING' || c.status === 'SENT') && (
                <p className="mt-2 text-[11px] text-neutral-400">
                  Wysłano {c.sentCount} / {c.recipientCount}
                  {c.suppressedCount ? ` · pominięto ${c.suppressedCount}` : ''}
                  {c.failedCount ? ` · błędy ${c.failedCount}` : ''}
                </p>
              )}
              {c.status === 'DRAFT' && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => send(c.id)} disabled={pending} className="emm-btn">
                    {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Wyślij teraz
                  </button>
                  <button onClick={() => remove(c.id)} disabled={pending} className="rounded-lg border border-rose-400/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-400/10">
                    Usuń
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <style jsx>{`
        :global(.emm-inp){width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.3);padding:.5rem .7rem;font-size:.875rem;color:#fff;outline:none}
        :global(.emm-btn){display:inline-flex;align-items:center;gap:.5rem;border-radius:.7rem;background:#c026d3;padding:.5rem .9rem;font-size:.85rem;font-weight:600;color:#fff}
        :global(.emm-btn:disabled){opacity:.5}
      `}</style>
    </div>
  );
}

function CampaignStatus({ status }: { status: string }) {
  const map: Record<string, { t: string; c: string }> = {
    DRAFT: { t: 'Robocza', c: 'border-white/20 bg-white/5 text-neutral-300' },
    SENDING: { t: 'Wysyłanie', c: 'border-sky-400/40 bg-sky-400/10 text-sky-200' },
    SENT: { t: 'Wysłana', c: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200' },
    CANCELED: { t: 'Anulowana', c: 'border-white/20 bg-white/5 text-neutral-300' },
    FAILED: { t: 'Błąd', c: 'border-rose-400/40 bg-rose-400/10 text-rose-200' },
  };
  const v = map[status] ?? { t: status, c: 'border-white/20 bg-white/5 text-neutral-300' };
  return <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${v.c}`}>{v.t}</span>;
}
