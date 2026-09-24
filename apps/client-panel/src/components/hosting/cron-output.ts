/**
 * L-06 — zapis wyniku ostatniego uruchomienia zadania cron. Panel opakowuje polecenie tak, by
 * wynik (stdout + stderr) trafiał do ~/.verris-cron/<klucz>.log; API czyta ten plik.
 */
const WRAP_RE = /^mkdir -p \$HOME\/\.verris-cron; \( (.*) \) > \$HOME\/\.verris-cron\/([a-z0-9]{6,32})\.log 2>&1$/;

export function wrapCron(command: string, key: string): string {
  return `mkdir -p $HOME/.verris-cron; ( ${command.trim()} ) > $HOME/.verris-cron/${key}.log 2>&1`;
}

export function unwrapCron(command: string): { command: string; key: string } | null {
  const m = WRAP_RE.exec(command.trim());
  return m ? { command: m[1], key: m[2] } : null;
}

export function newCronKey(): string {
  const a = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const b = new Uint8Array(10);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => a[x % a.length]).join('');
}
