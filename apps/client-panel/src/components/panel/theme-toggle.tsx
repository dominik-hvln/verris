'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { savePanelPreferences } from '@/app/dashboard/sidebar-actions';

export const THEME_KEY = 'verris-theme';

/** Ustawia motyw treści panelu (stan: <html data-vtheme>, kopia w localStorage). */
export function applyTheme(light: boolean) {
  if (light) document.documentElement.dataset.vtheme = 'light';
  else delete document.documentElement.dataset.vtheme;
  try {
    localStorage.setItem(THEME_KEY, light ? 'light' : 'dark');
  } catch {
    /* tylko na tę wizytę */
  }
}

/** Przełącznik motywu treści panelu (menu boczne zostaje ciemne). Wybór zapisujemy też na koncie (PB-16). */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    // Motyw może zmienić też zapis z konta po wczytaniu profilu — śledzimy atrybut, nie tylko klik.
    const el = document.documentElement;
    const sync = () => setLight(el.dataset.vtheme === 'light');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-vtheme'] });
    return () => obs.disconnect();
  }, []);
  const toggle = () => {
    const next = !light;
    applyTheme(next);
    void savePanelPreferences({ panelTheme: next ? 'light' : 'dark' });
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
