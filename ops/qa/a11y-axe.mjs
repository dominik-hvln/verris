#!/usr/bin/env node
// P-12 — automatyczny przegląd dostępności (WCAG 2.1 A/AA, EAA) silnikiem axe-core na stronach bez logowania.
// Tylko localhost: Chromium startuje z blokadą DNS poza localhost, nic nie wychodzi do sieci.
//
// Uruchomienie (z korzenia repo; wymaga działających lokalnie aplikacji):
//   pnpm --filter @verris/www dev            # http://localhost:3005  (działa bez bazy: strony statyczne)
//   pnpm --filter @verris/client-panel dev   # http://localhost:3001  (strony auth: logowanie, rejestracja, reset hasła)
//   node ops/qa/a11y-axe.mjs                 # oba cele, widok desktop i mobile
//   node ops/qa/a11y-axe.mjs --www=http://localhost:3005 --panel=            # tylko www (puste = pomiń cel)
//   node ops/qa/a11y-axe.mjs --json=wynik.json --impact=moderate             # próg: minor|moderate|serious (domyślnie serious)
//
// Reguły: WCAG 2.0/2.1 A+AA oraz best-practice axe (landmarki, nagłówki). Kontrast, którego axe nie rozstrzyga, drukuje jako RĘCZNIE.
// Kod wyjścia: 1 gdy jest naruszenie serious/critical (lub wyższy próg z --impact), 2 gdy strona nie wstała, 0 gdy czysto.
// Zależności: axe-core (już w node_modules/.pnpm jako zależność eslint-plugin-jsx-a11y) + Chromium z
// PLAYWRIGHT_BROWSERS_PATH (domyślnie /opt/pw-browsers) albo CHROME_BIN. Node >= 22 (globalny WebSocket). Nic nie instaluje.
// Ogranicznik: axe łapie ok. 30-40% problemów WCAG — kolejność czytania, sens alt, komunikaty błędów i zachowanie
// czytnika ekranu (VoiceOver) trzeba sprawdzić ręcznie.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;

const WWW = arg('www', 'http://localhost:3005');
const PANEL = arg('panel', 'http://localhost:3001');
const JSON_OUT = arg('json', '');
const IMPACTS = ['minor', 'moderate', 'serious', 'critical'];
const PROG = IMPACTS.indexOf(arg('impact', 'serious'));
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];
const VIEWS = { desktop: [1280, 900], mobile: [390, 844] };

// /pomoc to redirect na zewnętrzną bazę wiedzy (pomoc.verris.pl) — poza zakresem; /vps i ostatnia trasa to 404.
const WWW_ROUTES = [
  '/', '/hosting', '/hosting/wordpress', '/hosting/sklep', '/vps', '/domeny', '/cennik', '/kontakt',
  '/funkcje', '/specyfikacja', '/email-marketing', '/reseller', '/o-nas', '/poczta',
  '/zglos-naduzycie', '/przenies-strone', '/blog', '/nie-ma-takiej-strony',
];
const PANEL_ROUTES = ['/login', '/register', '/forgot-password', '/reset-password', '/resend-verification'];
const CELE = [
  ...(WWW ? WWW_ROUTES.map((r) => [WWW, r]) : []),
  ...(PANEL ? PANEL_ROUTES.map((r) => [PANEL, r]) : []),
];

function znajdz() {
  const axeDir = join(ROOT, 'node_modules/.pnpm');
  const axe = readdirSync(axeDir).find((d) => d.startsWith('axe-core@'));
  if (!axe) throw new Error('Brak axe-core w node_modules/.pnpm (pnpm install).');
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  const chrome =
    process.env.CHROME_BIN ||
    (existsSync(pw) &&
      readdirSync(pw)
        .filter((d) => /^chromium-\d+$/.test(d))
        .map((d) => join(pw, d, 'chrome-linux/chrome'))
        .find(existsSync));
  if (!chrome) throw new Error('Brak Chromium: ustaw CHROME_BIN albo PLAYWRIGHT_BROWSERS_PATH.');
  return { axeSrc: readFileSync(join(axeDir, axe, 'node_modules/axe-core/axe.min.js'), 'utf8'), chrome };
}

// Minimalny klient CDP (bez playwright/puppeteer — nie ma ich w repo).
async function startChrome(chrome) {
  const dir = mkdtempSync(join(tmpdir(), 'a11y-axe-'));
  const proc = spawn(
    chrome,
    [
      '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${dir}`,
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', 'about:blank',
    ],
    { stdio: 'ignore' },
  );
  const portFile = join(dir, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await new Promise((r) => setTimeout(r, 100));
  if (!existsSync(portFile)) throw new Error('Chromium nie wystartował.');
  const [port] = readFileSync(portFile, 'utf8').split('\n');
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(webSocketDebuggerUrl);
  await new Promise((ok, err) => ((ws.onopen = ok), (ws.onerror = err)));
  let id = 0;
  const wait = new Map();
  const nasluch = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && wait.has(d.id)) {
      const [ok, err] = wait.get(d.id);
      wait.delete(d.id);
      d.error ? err(new Error(d.error.message)) : ok(d.result);
    } else nasluch.forEach((f) => f(d));
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((ok, err) => {
      const i = ++id;
      wait.set(i, [ok, err]);
      ws.send(JSON.stringify({ id: i, method, params, sessionId }));
    });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (method, params) => send(method, params, sessionId);
  await s('Page.enable');
  const zamknij = () => {
    ws.close();
    proc.kill();
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  };
  return { s, nasluch, sessionId, zamknij };
}

async function przejdz(c, url, [w, h]) {
  await c.s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
  let zaladowana;
  const gotowa = new Promise((ok) => (zaladowana = ok));
  const f = (d) => d.sessionId === c.sessionId && d.method === 'Page.loadEventFired' && zaladowana();
  c.nasluch.push(f);
  const nav = await c.s('Page.navigate', { url });
  if (nav.errorText) throw new Error(nav.errorText);
  await Promise.race([gotowa, new Promise((_, e) => setTimeout(() => e(new Error('timeout 120 s')), 120000))]);
  c.nasluch.splice(c.nasluch.indexOf(f), 1);
  await new Promise((r) => setTimeout(r, 1500)); // hydratacja + animacje wejścia
}

async function axe(c, axeSrc) {
  await c.s('Runtime.evaluate', { expression: axeSrc });
  const r = await c.s('Runtime.evaluate', {
    expression: `(()=>{const m=v=>({id:v.id,impact:v.impact,help:v.help,nodes:v.nodes.map(n=>({target:n.target.join(' '),summary:(n.any[0]||n.all[0]||n.none[0]||{}).message}))});return axe.run(document,{runOnly:{type:'tag',values:${JSON.stringify(TAGS)}},resultTypes:['violations','incomplete']}).then(r=>({title:document.title,violations:r.violations.map(m),incomplete:r.incomplete.filter(v=>v.id==='color-contrast').map(m)}))})()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'axe: wyjątek');
  return r.result.value;
}

const { axeSrc, chrome } = znajdz();
const c = await startChrome(chrome);
const wynik = [];
let nieWstalo = 0;
try {
  for (const [baza, trasa] of CELE) {
    for (const [widok, rozmiar] of Object.entries(VIEWS)) {
      const url = baza + trasa;
      try {
        await przejdz(c, url, rozmiar);
        wynik.push({ url, widok, ...(await axe(c, axeSrc)) });
      } catch (e) {
        nieWstalo++;
        console.error(`BŁĄD ${url} [${widok}]: ${e.message}`);
      }
    }
  }
} finally {
  c.zamknij();
}

let zle = 0;
// WCAG 2.4.2: tytuły stron jednego serwisu mają się różnić (axe sprawdza tylko, że tytuł jest). Strony 404 mogą dzielić tytuł.
const tytuly = {};
for (const { url, widok, title } of wynik) if (widok === 'desktop' && !/^Nie ma takiej strony/.test(title)) (tytuly[title] ??= []).push(url);
for (const [t, u] of Object.entries(tytuly)) if (u.length > 1) {
  zle += u.length;
  console.log(`FAIL document-title-unique (serious) "${t}" x${u.length}\n     ${u.join(' ')}`);
}
const podsum = {};
for (const { url, widok, violations, incomplete } of wynik) {
  for (const v of incomplete) console.log(`RĘCZNIE ${url} [${widok}] ${v.id} x${v.nodes.length} — axe nie rozstrzygnął (tło/obraz/nakładka), sprawdź okiem`);
  for (const v of violations) {
    const blokuje = IMPACTS.indexOf(v.impact) >= PROG;
    if (blokuje) zle += v.nodes.length;
    const k = `${v.id} (${v.impact})`;
    podsum[k] = (podsum[k] ?? 0) + v.nodes.length;
    console.log(`${blokuje ? 'FAIL' : 'warn'} ${url} [${widok}] ${k} x${v.nodes.length} — ${v.help}`);
    v.nodes.slice(0, 3).forEach((n) => console.log(`     ${n.target}  ${n.summary ?? ''}`.slice(0, 220)));
  }
}
console.log(`\nStron: ${wynik.length} (url x widok), naruszenia wg reguły:`, podsum);
console.log(zle ? `WYNIK: ${zle} elementów z naruszeniem >= ${IMPACTS[PROG]}` : `WYNIK: czysto (>= ${IMPACTS[PROG]})`);
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(wynik, null, 1));
process.exit(nieWstalo ? 2 : zle ? 1 : 0);
