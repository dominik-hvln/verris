'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const KEY = 'verris-theme';

/** Przełącznik motywu treści panelu (menu boczne zostaje ciemne). Stan: <html data-vtheme>, zapis w localStorage. */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- odczyt stanu ustawionego skryptem przed hydratacją
    setLight(document.documentElement.dataset.vtheme === 'light');
  }, []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.dataset.vtheme = 'light';
    else delete document.documentElement.dataset.vtheme;
    try {
      localStorage.setItem(KEY, next ? 'light' : 'dark');
    } catch {
      /* tylko na tę wizytę */
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Włącz motyw ciemny' : 'Włącz motyw jasny'}
      data-tip={light ? 'Motyw ciemny' : 'Motyw jasny'}
      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border border-line-strong bg-card text-muted-foreground hover:border-primary hover:text-foreground"
    >
      {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
