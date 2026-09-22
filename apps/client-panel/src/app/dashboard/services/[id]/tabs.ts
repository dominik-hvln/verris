import {
  Activity,
  Archive,
  Box,
  Clock,
  Database,
  FolderKanban,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Mail,
  Receipt,
  Rocket,
  Shield,
  Terminal,
  Wrench,
} from 'lucide-react';

/** Zakładki usługi — wspólne dla strony usługi i sekcji usługi w menu bocznym. */
export const TABS = [
  { id: 'overview', label: 'Przegląd', icon: LayoutDashboard },
  { id: 'subscription', label: 'Subskrypcja i płatności', icon: Receipt },
  { id: 'domains', label: 'Domeny i DNS', icon: Globe },
  { id: 'databases', label: 'Bazy danych', icon: Database },
  { id: 'mail', label: 'Poczta', icon: Mail },
  { id: 'files', label: 'Menedżer plików', icon: FolderOpen },
  { id: 'php', label: 'PHP i serwer', icon: Terminal },
  { id: 'ssl', label: 'Certyfikaty SSL', icon: Shield },
  { id: 'apps', label: 'Aplikacje 1-click', icon: Globe },
  // Kreator stron tymczasowo ukryty (komponent zostaje — wystarczy przywrócić wpis).
  { id: 'webtools', label: 'Narzędzia WWW', icon: Wrench },
  { id: 'ftp', label: 'Konta FTP', icon: FolderKanban },
  { id: 'cron', label: 'Zadania cron', icon: Clock },
  { id: 'backups', label: 'Kopie zapasowe', icon: Archive },
  { id: 'waf', label: 'Bezpieczeństwo (WAF)', icon: Shield },
  { id: 'monitoring', label: 'Monitoring', icon: Activity },
  { id: 'staging', label: 'Staging', icon: Box },
  { id: 'deploy', label: 'Deploy (Git)', icon: Rocket },
  { id: 'usage', label: 'Zużycie zasobów', icon: Activity },
] as const;

export type TabId = (typeof TABS)[number]['id'];

/** Grupy sekcji (wzorzec: docs/design/wzorzec-panelu.html). */
export const NAV_GROUPS: { label: string; ids: TabId[] }[] = [
  { label: 'Usługa', ids: ['overview'] },
  { label: 'Poczta i domeny', ids: ['mail', 'domains', 'ssl'] },
  { label: 'Pliki i dane', ids: ['files', 'databases', 'ftp', 'backups'] },
  { label: 'Narzędzia', ids: ['php', 'webtools', 'apps', 'cron', 'staging', 'deploy', 'waf', 'monitoring', 'usage'] },
  { label: 'Rozliczenie', ids: ['subscription'] },
];

/** Poczta ma krótki zestaw; tryb prosty chowa narzędzia dla zaawansowanych (GUIDE-4). */
export const EMAIL_TAB_IDS: TabId[] = ['overview', 'subscription', 'domains', 'mail', 'backups'];
export const ADVANCED_TAB_IDS: TabId[] = ['php', 'ftp', 'cron', 'waf', 'staging', 'deploy', 'usage'];

export function isTabId(v: string | null): v is TabId {
  return !!v && TABS.some((t) => t.id === v);
}

export function visibleTabIds(opts: { email: boolean; kindResolved: boolean; simple: boolean }): TabId[] {
  const base = opts.email || !opts.kindResolved ? EMAIL_TAB_IDS : TABS.map((t) => t.id);
  return base.filter((id) => !(opts.simple && !opts.email && ADVANCED_TAB_IDS.includes(id)));
}

export const SIMPLE_MODE_KEY = 'verris-simple-mode';
