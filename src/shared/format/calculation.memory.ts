// The calculation memory of one item as the screen shows it: each tax with its steps, the full text
// of the legal ground, and the official sources behind the numbers. Built by each regime's view
// (calculation.view.ts, simples.view.ts) and drawn by CalculationMemory.tsx.

import { type OfficialSourceId, readOfficialSource } from "@/shared/content/official.sources.ts";
import type { StepView } from "./formula.present.ts";
import type { TaxStory } from "./memory.story.ts";

// why: the IBS parts get lighter steps of the IBS colour; "ibs" is the IBS as a whole (the Simples);
// "selective" is the Imposto Seletivo's teal.
type TaxTone = "cbs" | "ibs" | "ibsUf" | "ibsMun" | "selective";

// `outcome` says what the regime did with the calculated value when the table shows something
// else (the Simples sends it to pending, or to nothing).
interface TaxMemoryView {
  taxName: string;
  tone: TaxTone;
  steps: StepView[];
  story: TaxStory;
  outcome: string | null;
}

interface SourceLinkView {
  label: string;
  url: string;
}

// `formulaOrigin` names where the raw expression comes from: the open data, or the port's rule.
interface CalculationMemoryView {
  taxes: TaxMemoryView[];
  formulaOrigin: string;
  legalText: string | null;
  sourceLinks: SourceLinkView[];
}

function toSourceLink(sourceId: OfficialSourceId, label?: string) {
  const source = readOfficialSource(sourceId);
  const link: SourceLinkView = { label: label ?? source.label, url: source.url };
  return link;
}

export type { CalculationMemoryView, SourceLinkView, TaxMemoryView, TaxTone };
export { toSourceLink };
