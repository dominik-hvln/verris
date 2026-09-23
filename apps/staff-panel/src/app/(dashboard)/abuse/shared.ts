export const STATUS_LABEL: Record<string, string> = {
  NEW: 'Nowe', IN_REVIEW: 'W trakcie', ACTION_TAKEN: 'Podjęto działania', REJECTED: 'Odrzucone',
};
export const STATUS_STYLE: Record<string, string> = {
  NEW: 'border-amber-500/40 bg-amber-500/10 text-amber-100',
  IN_REVIEW: 'border-sky-500/40 bg-sky-500/10 text-sky-100',
  ACTION_TAKEN: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100',
  REJECTED: 'border-white/15 bg-white/5 text-neutral-300',
};
export const KATEGORIA: Record<string, string> = {
  SPAM: 'Spam', PHISHING: 'Phishing', MALWARE: 'Malware', ILLEGAL_CONTENT: 'Treść nielegalna',
  COPYRIGHT: 'Prawa autorskie', PERSONAL_DATA: 'Dane osobowe', OTHER: 'Inne',
};
export const BRAK_UPRAWNIENIA =
  'Twoje konto nie ma uprawnienia „Nadużycia” (ABUSE_MANAGE). Nada je administrator: panel admina → Role i uprawnienia.';
