'use client';

import { useState, useTransition } from 'react';
import { ponowZamowienie, potwierdzZamowienie, type PanelDrzew, type ZamowienieSadzenia } from './actions';
import { procent } from './drzewa-wyliczenia';

const STATUS: Record<ZamowienieSadzenia['status'], string> = {
  OCZEKUJE: 'Czeka',
  WYSYLANE: 'W wysyłce',
  NIEPEWNE: 'Niepewne – sprawdź u partnera',
  ZLOZONE: 'Złożone, bez certyfikatu',
  POSADZONE: 'Posadzone',
};
const POLE = 'w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-xs text-white';

/** Stan puli i ostatnie zamówienia; NIEPEWNE/ZŁOŻONE admin rozstrzyga po sprawdzeniu w panelu partnera. */
export function ZamowieniaSadzenia({ panel }: { panel: PanelDrzew }) {
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, { orderId: string; url: string }>>({});

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-black/30 p-6">
      <h2 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Pula i zamówienia</h2>
      <ul className="grid gap-2 text-sm text-neutral-300 sm:grid-cols-2">
        <li>Pula (nieprzydzielone): {procent(panel.pulaCzesci)} drzewa</li>
        <li>Wkłady łącznie – z usług: {procent(panel.wkladyCzesci.USLUGA ?? 0)}, z punktów: {procent(panel.wkladyCzesci.PUNKTY ?? 0)}</li>
        <li>Posadzone (produkcja, z certyfikatem): {panel.posadzoneProdukcja}</li>
        <li>Posadzone w API testowym (nie liczą się): {panel.posadzoneTest}</li>
      </ul>
      {blad ? <p className="text-sm text-rose-300">{blad}</p> : null}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-neutral-300">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-2 pr-3">Utworzone</th>
              <th className="pr-3">Rodzaj</th>
              <th className="pr-3">Drzewa</th>
              <th className="pr-3">Status</th>
              <th className="pr-3">API</th>
              <th className="pr-3">orderId / certyfikat</th>
              <th>Akcja</th>
            </tr>
          </thead>
          <tbody>
            {panel.zamowienia.map((z) => {
              const f = form[z.id] ?? { orderId: z.orderId ? String(z.orderId) : '', url: '' };
              return (
                <tr key={z.id} className="border-t border-white/5 align-top">
                  <td className="py-2 pr-3">{new Date(z.createdAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}</td>
                  <td className="pr-3">{z.rodzaj === 'PULA' ? 'Zbiorcze' : `Własne (${z.klient ?? '–'})`}</td>
                  <td className="pr-3">{z.liczbaDrzew}</td>
                  <td className="pr-3">
                    {STATUS[z.status]}
                    {z.ostatniBlad ? <div className="text-amber-300/80">{z.ostatniBlad}</div> : null}
                    {z.proby ? <div className="text-neutral-500">prób: {z.proby}</div> : null}
                  </td>
                  <td className="pr-3">{z.srodowisko}</td>
                  <td className="pr-3">
                    {z.orderId ?? '–'}
                    {z.certificateUrl ? (
                      <div>
                        <a href={z.certificateUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-400 underline">
                          certyfikat
                        </a>
                      </div>
                    ) : null}
                  </td>
                  <td className="min-w-[220px] space-y-1">
                    {z.status === 'NIEPEWNE' && z.orderId === null ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="rounded border border-white/15 px-2 py-1 hover:bg-white/5"
                        onClick={() =>
                          start(async () => {
                            const r = await ponowZamowienie(z.id);
                            setBlad(r.ok ? null : r.error);
                          })
                        }
                      >
                        Nie ma u partnera – ponów
                      </button>
                    ) : null}
                    {z.status === 'NIEPEWNE' || z.status === 'ZLOZONE' ? (
                      <div className="space-y-1">
                        <input
                          aria-label="orderId"
                          placeholder="orderId"
                          className={POLE}
                          value={f.orderId}
                          onChange={(e) => setForm((x) => ({ ...x, [z.id]: { ...f, orderId: e.target.value } }))}
                        />
                        <input
                          aria-label="Adres certyfikatu"
                          placeholder="https://… certyfikat"
                          className={POLE}
                          value={f.url}
                          onChange={(e) => setForm((x) => ({ ...x, [z.id]: { ...f, url: e.target.value } }))}
                        />
                        <button
                          type="button"
                          disabled={pending || !/^\d+$/.test(f.orderId) || !f.url.startsWith('https://')}
                          className="rounded border border-white/15 px-2 py-1 hover:bg-white/5 disabled:opacity-50"
                          onClick={() =>
                            start(async () => {
                              const r = await potwierdzZamowienie(z.id, { orderId: Number(f.orderId), certificateUrl: f.url });
                              setBlad(r.ok ? null : r.error);
                            })
                          }
                        >
                          Jest u partnera – zapisz
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {panel.zamowienia.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-4 text-neutral-500">Brak zamówień sadzenia.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
