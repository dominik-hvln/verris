import { bramkaStrony } from "@/lib/bramka-strony";
import { Suspense } from "react";
import { NodeWizard } from "./node-wizard";

export const dynamic = "force-dynamic";

export default async function NodeWizardPage() {
  const bramka = await bramkaStrony("/nodes/wizard");
  if (bramka) return bramka;
  return (
    <Suspense
      fallback={<div className="p-8 text-sm text-muted-foreground">Ładowanie wizarda…</div>}
    >
      <NodeWizard />
    </Suspense>
  );
}
