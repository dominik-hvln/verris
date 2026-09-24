'use client';

import { useEffect, useRef, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { cx } from './cx';

const rozmiar = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;

/**
 * Wybór załączników w stylu panelu zamiast systemowego „Choose files / No file chosen”.
 * Prawdziwe pole plików (input typu file z `name`) zostaje w formularzu (FormData i server action bez zmian) —
 * ten komponent tylko go obsługuje: przycisk, przeciągnij-i-upuść, lista z rozmiarem i usuwaniem.
 * Limity sprawdzane od razu, żeby klient nie dowiadywał się o nich dopiero po wysłaniu.
 */
export function PoleZalacznikow({
  id,
  name = 'files',
  maxPlikow = 5,
  maxBajtow = 8 * 1024 * 1024,
  className,
}: {
  id?: string;
  name?: string;
  maxPlikow?: number;
  maxBajtow?: number;
  className?: string;
}) {
  const wejscie = useRef<HTMLInputElement>(null);
  const [pliki, setPliki] = useState<File[]>([]);
  const [blad, setBlad] = useState<string | null>(null);
  const [nadStrefa, setNadStrefa] = useState(false);

  // Po wysłaniu formularz zwykle robi reset() — lista musi zniknąć razem z plikami w polu.
  useEffect(() => {
    const form = wejscie.current?.form;
    if (!form) return;
    const wyczysc = () => {
      setPliki([]);
      setBlad(null);
    };
    form.addEventListener('reset', wyczysc);
    return () => form.removeEventListener('reset', wyczysc);
  }, []);

  const ustaw = (lista: File[]) => {
    const niepuste = lista.filter((f) => f.size > 0);
    const zaDuze = niepuste.filter((f) => f.size > maxBajtow).map((f) => f.name);
    let wynik = niepuste.filter((f) => f.size <= maxBajtow);
    const komunikaty: string[] = [];
    if (zaDuze.length) komunikaty.push(`Pominięto (ponad ${rozmiar(maxBajtow)}): ${zaDuze.join(', ')}.`);
    if (wynik.length > maxPlikow) {
      komunikaty.push(`Można dołączyć najwyżej ${maxPlikow} plików — zostawiliśmy pierwsze ${maxPlikow}.`);
      wynik = wynik.slice(0, maxPlikow);
    }
    setBlad(komunikaty.join(' ') || null);
    setPliki(wynik);
    // Formularz wysyła to, co jest w input.files — przepisujemy listę po filtrowaniu i usuwaniu.
    const dt = new DataTransfer();
    wynik.forEach((f) => dt.items.add(f));
    if (wejscie.current) wejscie.current.files = dt.files;
  };

  return (
    <div className={className}>
      <input
        ref={wejscie}
        name={name}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => ustaw([...pliki, ...Array.from(e.target.files ?? [])])}
      />
      <button
        id={id}
        type="button"
        onClick={() => wejscie.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setNadStrefa(true);
        }}
        onDragLeave={() => setNadStrefa(false)}
        onDrop={(e) => {
          e.preventDefault();
          setNadStrefa(false);
          ustaw([...pliki, ...Array.from(e.dataTransfer.files)]);
        }}
        className={cx(
          'flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-3 text-sm transition-colors',
          nadStrefa ? 'border-primary bg-primary/5 text-foreground' : 'border-line-strong text-muted-foreground hover:border-primary hover:text-foreground',
        )}
      >
        <Paperclip className="h-4 w-4" aria-hidden />
        {pliki.length ? 'Dodaj kolejne pliki' : 'Wybierz pliki lub upuść je tutaj'}
      </button>
      {pliki.length ? (
        <ul className="mt-2 space-y-1" aria-label="Wybrane załączniki">
          {pliki.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1 break-all">{f.name}</span>
              <span className="whitespace-nowrap text-xs text-muted-foreground">{rozmiar(f.size)}</span>
              <button
                type="button"
                aria-label={`Usuń ${f.name}`}
                onClick={() => ustaw(pliki.filter((_, j) => j !== i))}
                className="rounded p-1 text-muted-foreground hover:text-crit"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {blad ? (
        <p className="mt-2 text-xs text-warn" role="status">
          {blad}
        </p>
      ) : null}
    </div>
  );
}
