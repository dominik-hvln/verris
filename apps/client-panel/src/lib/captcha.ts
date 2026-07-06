/**
 * CYBER-2 — odczyt tokenu captchy z formularza, niezależnie od dostawcy.
 * Widgety renderują różne pola odpowiedzi; backend oczekuje `captchaToken`.
 */
export function captchaTokenFromForm(formData: FormData): string | undefined {
  const token =
    formData.get("g-recaptcha-response")?.toString() ||
    formData.get("h-captcha-response")?.toString() ||
    formData.get("cf-turnstile-response")?.toString();
  return token && token.length > 0 ? token : undefined;
}
