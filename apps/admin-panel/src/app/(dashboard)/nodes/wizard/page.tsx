import { Suspense } from "react";
import { NodeWizard } from "./node-wizard";

export const dynamic = "force-dynamic";

export default function NodeWizardPage() {
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie wizarda…</div>}
    >
      <NodeWizard />
    </Suspense>
  );
}
