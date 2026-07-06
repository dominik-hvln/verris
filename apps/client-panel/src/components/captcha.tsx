"use client";

/**
 * CYBER-2 — widget anty-bot z pluggable dostawcą (bez vendor lock-in).
 *
 * Renderuje test antybotowy zgodny z `NEXT_PUBLIC_CAPTCHA_PROVIDER` i wstawia do
 * otaczającego <form> ukryte pole odpowiedzi, które server action odczytuje i
 * przekazuje do API jako `captchaToken`. Obsługiwani dostawcy:
 *   - recaptcha / recaptcha-v3 → Google reCAPTCHA (pole g-recaptcha-response)
 *   - hcaptcha                 → hCaptcha (pole h-captcha-response)
 *   - turnstile                → Cloudflare Turnstile (pole cf-turnstile-response)
 *
 * Server action czyta pierwsze obecne z tych pól, więc backend jest niezależny
 * od dostawcy. Gdy brak site key (dev) — komponent nic nie renderuje.
 */
import { useEffect, useRef } from "react";

type Provider = "recaptcha" | "recaptcha-v3" | "hcaptcha" | "turnstile";

interface RenderApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove?: (id: string) => void;
  reset?: (id?: string) => void;
}

declare global {
  interface Window {
    grecaptcha?: RenderApi & { ready?: (cb: () => void) => void };
    hcaptcha?: RenderApi;
    turnstile?: RenderApi;
  }
}

const PROVIDER: Provider =
  (process.env.NEXT_PUBLIC_CAPTCHA_PROVIDER as Provider) || "recaptcha";

const SCRIPTS: Record<Provider, string> = {
  recaptcha: "https://www.google.com/recaptcha/api.js?render=explicit",
  "recaptcha-v3": "https://www.google.com/recaptcha/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.defer = true;
    s.addEventListener(
      "load",
      () => {
        s.dataset.loaded = "1";
        resolve();
      },
      { once: true },
    );
    document.head.appendChild(s);
  });
}

function api(): RenderApi | undefined {
  if (PROVIDER === "hcaptcha") return window.hcaptcha;
  if (PROVIDER === "turnstile") return window.turnstile;
  return window.grecaptcha;
}

export function Captcha({ action = "auth" }: { action?: string }) {
  const siteKey = process.env.NEXT_PUBLIC_CAPTCHA_SITE_KEY;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;

    loadScript(SCRIPTS[PROVIDER]).then(() => {
      if (cancelled || !containerRef.current || widgetIdRef.current) return;
      const sdk = api();
      if (!sdk) return;

      const doRender = () => {
        if (cancelled || !containerRef.current || widgetIdRef.current) return;
        const opts: Record<string, unknown> = { sitekey: siteKey, theme: "auto" };
        // reCAPTCHA v3 działa w trybie niewidocznym ze score:
        if (PROVIDER === "recaptcha-v3") {
          opts.size = "invisible";
          opts.badge = "bottomright";
        }
        if (PROVIDER === "turnstile") {
          opts.action = action;
          opts["response-field-name"] = "cf-turnstile-response";
        }
        try {
          widgetIdRef.current = sdk.render(containerRef.current!, opts);
        } catch {
          /* podwójny render / SDK niegotowe — pomiń */
        }
      };

      // reCAPTCHA wymaga grecaptcha.ready:
      if ((PROVIDER === "recaptcha" || PROVIDER === "recaptcha-v3") && window.grecaptcha?.ready) {
        window.grecaptcha.ready(doRender);
      } else {
        doRender();
      }
    });

    return () => {
      cancelled = true;
      const sdk = api();
      if (widgetIdRef.current && sdk?.remove) {
        try {
          sdk.remove(widgetIdRef.current);
        } catch {
          /* widget mógł już zniknąć */
        }
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, action]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="mt-1 min-h-[65px]" />;
}
