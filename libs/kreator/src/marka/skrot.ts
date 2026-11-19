/** Krótki skrót tekstu (FNV-1a 32-bit, hex) – do unikalnych identyfikatorów w SVG osadzanych razem w jednym dokumencie. */
export function skrot(tekst: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < tekst.length; i++) {
    h ^= tekst.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
