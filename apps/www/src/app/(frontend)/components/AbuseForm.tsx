'use client';

import { useState } from 'react';
import { submitAbuse } from '@/lib/submit-abuse';

const KATEGORIE: [string, string][] = [
  ['PHISHING', 'Phishing / podszywanie się'],
  ['MALWARE', 'Złośliwe oprogramowanie'],
  ['SPAM', 'Spam wysyłany z naszego serwera'],
  ['ILLEGAL_CONTENT', 'Treść nielegalna'],
  ['COPYRIGHT', 'Naruszenie praw autorskich'],
  ['PERSONAL_DATA', 'Publikacja danych osobowych'],
  ['OTHER', 'Inne'],
];

/** N-13 — formularz zgłoszenia (DSA art. 16 ust. 2). */
export function AbuseForm() {
  const [id, setId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => fd.get(k)?.toString().trim() ?? '';
    setBusy(true);
    setError(null);
    const res = await submitAbuse({
      category: v('category'),
      url: v('url'),
      description: v('description'),
      reporterName: v('name') || undefined,
      reporterEmail: v('email'),
      goodFaith: fd.get('goodFaith') === 'on',
      website: v('website') || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error && res.error.length < 200 ? res.error : 'Nie udało się wysłać — spróbuj ponownie albo napisz na kontakt@verris.pl.');
      return;
    }
    setId(res.id ?? null);
  };

  if (id !== undefined) {
    return (
      <div className="form-ok" role="status">
        Dziękujemy — zgłoszenie przyjęte{id ? ` (numer ${id.slice(0, 8)})` : ''}. Potwierdzenie wysłaliśmy na podany adres,
        a o decyzji poinformujemy Cię mailem. Decyzję podejmuje człowiek, nie automat.
      </div>
    );
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="category">Czego dotyczy zgłoszenie</label>
        <select id="category" name="category" required defaultValue="PHISHING">
          {KATEGORIE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="url">Dokładny adres (URL) treści</label>
        <input id="url" name="url" type="text" required placeholder="https://przyklad.pl/podstrona" />
      </div>
      <div className="field">
        <label htmlFor="description">Co jest nie tak i dlaczego</label>
        <textarea id="description" name="description" required minLength={20} placeholder="Opisz naruszenie i podaj podstawę (np. który przepis lub czyje prawa narusza)." />
      </div>
      <div className="field">
        <label htmlFor="name">Imię i nazwisko (opcjonalnie)</label>
        <input id="name" name="name" type="text" autoComplete="name" />
      </div>
      <div className="field">
        <label htmlFor="email">E-mail do kontaktu</label>
        <input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="field" style={{ position: 'absolute', left: '-10000px' }} aria-hidden="true">
        <label htmlFor="website">Strona WWW</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <label className="form-note" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input type="checkbox" name="goodFaith" required />
        <span>Oświadczam, że działam w dobrej wierze, a informacje w zgłoszeniu są według mojej wiedzy prawdziwe i kompletne.</span>
      </label>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? 'Wysyłam…' : 'Wyślij zgłoszenie'}
      </button>
      {error && <p className="form-error" role="alert" style={{ color: '#ff9b9b' }}>{error}</p>}
      <p className="form-note">
        Dane zgłaszającego przetwarzamy, żeby rozpatrzyć zgłoszenie i poinformować o decyzji — zgodnie z{' '}
        <a href="https://panel.verris.pl/legal/privacy">polityką prywatności</a>.
      </p>
    </form>
  );
}
