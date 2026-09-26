"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

const KLUCZ = "verris-admin-theme";

/** PB-34 — motyw treści panelu admina (menu boczne zostaje ciemne, domyślnie wszystko ciemne). */
export function ThemeToggle() {
  const jasny = useSyncExternalStore(
    (zmiana) => {
      const obs = new MutationObserver(zmiana);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-vtheme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.vtheme === "light",
    () => false,
  );
  const przelacz = () => {
    const nastepny = !jasny;
    if (nastepny) document.documentElement.dataset.vtheme = "light";
    else delete document.documentElement.dataset.vtheme;
    try {
      localStorage.setItem(KLUCZ, nastepny ? "light" : "dark");
    } catch {
      /* tylko na tę wizytę */
    }
  };
  return (
    <button
      type="button"
      onClick={przelacz}
      aria-label={jasny ? "Włącz motyw ciemny" : "Włącz motyw jasny"}
      className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[9px] border border-line-strong bg-transparent text-foreground hover:border-primary"
    >
      {jasny ? <Moon className="h-[17px] w-[17px]" /> : <Sun className="h-[17px] w-[17px]" />}
    </button>
  );
}
