/**
 * PB-31 (17.10): pola „Host DA” i „Login admina” były puste, a lista kontrolna Onboard LIVE kazała wpisać IP.
 * Certyfikat panelu DA jest na nazwę hosta (faza TLS bootstrapu) — API weryfikuje certyfikat, więc Host = IP
 * kończył się błędem połączenia. Domyślnie: nazwa hosta węzła i „admin” (login z instalatora DA).
 */
export function poczatkowaKonfiguracjaDa(s: {
  daHost?: string | null;
  hostname?: string | null;
  daPort?: number | null;
  daUsername?: string | null;
  daUseTls: boolean;
  daAllowInvalidCert?: boolean | null;
  daPasswordSet: boolean;
}) {
  return {
    daHost: s.daHost || s.hostname || "",
    daPort: s.daPort ?? 2222,
    daUsername: s.daUsername || "admin",
    daUseTls: s.daUseTls,
    daAllowInvalidCert: s.daAllowInvalidCert ?? false,
    daPasswordSet: s.daPasswordSet,
  };
}
