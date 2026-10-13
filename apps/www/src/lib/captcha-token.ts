/**
 * Token captchy z formularza, niezależnie od dostawcy (jak apps/client-panel/src/lib/captcha.ts).
 * Widgety renderują różne pola odpowiedzi; API oczekuje `captchaToken`.
 */
export function captchaTokenFromForm(formData: FormData): string | undefined {
  const token =
    formData.get('g-recaptcha-response')?.toString() ||
    formData.get('h-captcha-response')?.toString() ||
    formData.get('cf-turnstile-response')?.toString();
  return token && token.length > 0 ? token : undefined;
}
