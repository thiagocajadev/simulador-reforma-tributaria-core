// Whether a calculation can become a simulated NF-e: a sale of goods (document type 55) with every
// item calculated, since a real note cannot leave one out. Otherwise, why not, in Portuguese.

import type {
  CalculatedItem,
  CalculationResult,
  ItemResult,
  Operation,
} from "@/features/calculations/calculation.dto.ts";

type NfeEligibility =
  | { isEligible: true; calculatedItems: CalculatedItem[] }
  | { isEligible: false; reason: string | null };

const NFE_DOCUMENT_TYPE = 55;

const REASONS = {
  someNotCalculated:
    "Nem todos os itens foram calculados, e uma NF-e não pode deixar item de fora. Corrija ou retire os itens com problema para gerar a nota.",
};

function checkNfeEligibility(operation: Operation, result: CalculationResult) {
  const hasItems = operation.items.length > 0 && result.items.length === operation.items.length;

  if (operation.documentType !== NFE_DOCUMENT_TYPE || !hasItems) {
    const notNfe: NfeEligibility = { isEligible: false, reason: null };
    return notNfe;
  }

  const calculatedItems = result.items.filter(isCalculated);

  if (calculatedItems.length !== result.items.length) {
    const notCalculated: NfeEligibility = {
      isEligible: false,
      reason: REASONS.someNotCalculated,
    };
    return notCalculated;
  }

  const eligible: NfeEligibility = { isEligible: true, calculatedItems };
  return eligible;
}

function isCalculated(itemResult: ItemResult): itemResult is CalculatedItem {
  const isCalculatedItem = itemResult.status === "calculated" || itemResult.status === "simulated";
  return isCalculatedItem;
}

export type { NfeEligibility };
export { checkNfeEligibility };
