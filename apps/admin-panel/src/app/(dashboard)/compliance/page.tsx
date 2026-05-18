import { Suspense } from "react";
import { FileText, ClipboardCheck, FileDown, ShieldOff } from "lucide-react";
import {
  fetchCurrentLegalDocs,
  fetchConsents,
  fetchDataExports,
  fetchDeletionRequests,
  type CurrentDocsMap,
} from "./data";
import { PublishDocForm } from "./publish-doc-form";
import { DocumentsTable } from "./documents-table";
import { ConsentsTable } from "./consents-table";
import { DataExportsTable } from "./data-exports-table";
import { DeletionRequestsTable } from "./deletion-requests-table";

export const dynamic = "force-dynamic";

interface SearchParams {
  tab?: string;
}

export default async function CompliancePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const tab = (sp.tab ?? "documents") as
    | "documents"
    | "consents"
    | "exports"
    | "deletions";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Compliance / RODO
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Centralny widok dokumentów prawnych, zgód klientów, eksportów danych
          (RODO art. 20) oraz wniosków o usunięcie konta (RODO art. 17). Każda
          akcja na tej stronie zapisuje się do{" "}
          <code className="text-xs">AuditLog</code> z kategorią RODO.
        </p>
      </header>

      <div className="flex gap-2 border-b border-white/10 overflow-x-auto">
        <TabLink id="documents" label="Dokumenty prawne" icon={FileText} active={tab === "documents"} />
        <TabLink id="consents" label="Zgody klientów" icon={ClipboardCheck} active={tab === "consents"} />
        <TabLink id="exports" label="Eksporty danych" icon={FileDown} active={tab === "exports"} />
        <TabLink id="deletions" label="Wnioski o usunięcie" icon={ShieldOff} active={tab === "deletions"} />
      </div>

      <Suspense fallback={<div className="text-sm text-muted-foreground">Ładowanie...</div>}>
        {tab === "documents" && <DocumentsTabContent />}
        {tab === "consents" && <ConsentsTabContent />}
        {tab === "exports" && <ExportsTabContent />}
        {tab === "deletions" && <DeletionsTabContent />}
      </Suspense>
    </div>
  );
}

function TabLink({
  id,
  label,
  icon: Icon,
  active,
}: {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <a
      href={`/compliance?tab=${id}`}
      className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors -mb-px border-b-2 ${
        active
          ? "border-indigo-400 text-white"
          : "border-transparent text-muted-foreground hover:text-white hover:border-white/30"
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </a>
  );
}

async function DocumentsTabContent() {
  let docs: CurrentDocsMap = {
    TERMS: null,
    PRIVACY: null,
    COOKIES: null,
    DPA: null,
  };
  let error: string | null = null;
  try {
    docs = await fetchCurrentLegalDocs();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd.";
  }

  return (
    <div className="space-y-6">
      <DocumentsTable docs={docs} error={error} />
      <PublishDocForm />
    </div>
  );
}

async function ConsentsTabContent() {
  const result = await fetchConsents({ limit: 100 });
  return <ConsentsTable rows={result.rows} total={result.total} />;
}

async function ExportsTabContent() {
  const rows = await fetchDataExports();
  return <DataExportsTable rows={rows} />;
}

async function DeletionsTabContent() {
  const rows = await fetchDeletionRequests();
  return <DeletionRequestsTable rows={rows} />;
}
