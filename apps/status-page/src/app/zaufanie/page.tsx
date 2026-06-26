import {
  Activity,
  Wallet,
  ShieldCheck,
  DatabaseBackup,
  Leaf,
  LifeBuoy,
  ArrowRight,
  Check,
} from 'lucide-react';

export const metadata = {
  title: 'Verris — Zaufanie i gwarancje',
  description:
    'Dlaczego możesz zaufać Verris: realny uptime i SLA, uczciwe ceny bez pułapki przy odnowieniu, nowoczesne bezpieczeństwo, kopie zapasowe i realne EKO.',
};

export const revalidate = 3600;

type Pillar = {
  icon: React.ReactNode;
  title: string;
  points: string[];
};

const PILLARS: Pillar[] = [
  {
    icon: <Activity className="h-5 w-5" />,
    title: 'Niezawodność i SLA',
    points: [
      'Publiczny status na żywo — realny uptime z ostatnich 30 dni.',
      'Deklarowany SLA widoczny obok faktycznego wyniku.',
      'Kredyty SLA za przestój infrastruktury — automatycznie do portfela.',
    ],
  },
  {
    icon: <Wallet className="h-5 w-5" />,
    title: 'Uczciwe ceny',
    points: [
      'Brak skoku ceny przy odnowieniu — płacisz za realne zużycie.',
      'Portfel prepaid: 1 zł = 1 kredyt, rozliczanie godzinowe.',
      'Bezpiecznik kosztów — sam ustawiasz limit, ile maksymalnie wydasz.',
    ],
  },
  {
    icon: <ShieldCheck className="h-5 w-5" />,
    title: 'Bezpieczeństwo',
    points: [
      'Logowanie bez hasła (passkeys) i 2FA.',
      'WAF (ModSecurity / OWASP CRS) chroni Twoje strony.',
      'RODO: eksport i usunięcie danych, aktywne sesje i dziennik aktywności.',
    ],
  },
  {
    icon: <DatabaseBackup className="h-5 w-5" />,
    title: 'Twoje dane pod kontrolą',
    points: [
      'Codzienne kopie zapasowe + dodatkowe kopie poza serwerem (off-site).',
      'Przywracanie jednym kliknięciem (pliki i bazy danych).',
      'Kopia bezpieczeństwa wykonywana przed każdym przywracaniem.',
    ],
  },
  {
    icon: <Leaf className="h-5 w-5" />,
    title: 'Realne EKO',
    points: [
      'Liczymy zużycie energii (kWh) i emisję CO₂ per konto — z prawdziwych metryk.',
      'Raport EKO w panelu, nie marketingowa obietnica.',
      'Argument ESG/CSR dla Twojej firmy.',
    ],
  },
  {
    icon: <LifeBuoy className="h-5 w-5" />,
    title: 'Opieka w każdym widoku',
    points: [
      'Panel prowadzi za rękę i podpowiada następny krok.',
      'Diagnostyka usługi i naprawa typowych problemów jednym kliknięciem.',
      'Baza wiedzy i wsparcie — bez zostawiania Cię z problemem samego.',
    ],
  },
];

const GUARANTEES = [
  'Brak pułapki cenowej przy odnowieniu',
  'Kredyty SLA za przestój',
  'Darmowa migracja od konkurencji',
  'Dane pod kontrolą (RODO + kopie off-site)',
];

export default function TrustPage() {
  return (
    <main className="min-h-screen px-6 py-12 md:px-10">
      <div className="mx-auto max-w-5xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/10 text-emerald-400">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">Zaufanie i gwarancje</h1>
              <p className="text-sm text-neutral-400">Na czym opiera się Twoje bezpieczeństwo w Verris</p>
            </div>
          </div>
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-white/[0.08]"
          >
            <Activity className="h-4 w-4" /> Status na żywo <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </header>

        {/* Gwarancje — pasek */}
        <section className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {GUARANTEES.map((g) => (
            <div
              key={g}
              className="flex items-start gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-100"
            >
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <span>{g}</span>
            </div>
          ))}
        </section>

        {/* Filary */}
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {PILLARS.map((p) => (
            <article
              key={p.title}
              className="rounded-3xl border border-white/5 bg-white/[0.02] p-6 transition hover:border-emerald-400/20"
            >
              <div className="mb-4 flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                  {p.icon}
                </span>
                <h2 className="text-lg font-bold">{p.title}</h2>
              </div>
              <ul className="space-y-2">
                {p.points.map((pt) => (
                  <li key={pt} className="flex items-start gap-2 text-sm text-neutral-300">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/80" />
                    <span>{pt}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>

        {/* Wydajność — uczciwa metodologia, bez zmyślonych liczb */}
        <section className="mt-10 rounded-3xl border border-white/5 bg-white/[0.02] p-6">
          <h2 className="text-lg font-bold">Wydajność</h2>
          <p className="mt-2 max-w-3xl text-sm text-neutral-300">
            Stawiamy na LiteSpeed + CloudLinux i nowoczesny stos. Publiczne, powtarzalne benchmarki
            wydajności (czas odpowiedzi, TTFB, obciążenie) udostępnimy wraz z metodologią po
            komercyjnym starcie — z realnych pomiarów, nie z deklaracji.
          </p>
        </section>

        <footer className="mt-16 border-t border-white/5 pt-6 text-sm text-neutral-500">
          <p>
            Chcesz zobaczyć, jak działamy w praktyce?{' '}
            <a href="/" className="font-semibold text-emerald-300 hover:underline">
              Sprawdź status systemu na żywo
            </a>
            .
          </p>
        </footer>
      </div>
    </main>
  );
}
