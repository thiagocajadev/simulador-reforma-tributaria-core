// Whether a calculation can become a simulated NFS-e: an NFS-e operation (document type 91) with
// its one service calculated and carrying IBS/CBS values. Otherwise, why not, in Portuguese.

import type {
  CalculatedItem,
  CalculationResult,
  Operation,
} from "@/features/calculations/calculation.dto.ts";

type NfseEligibility =
  | { isEligible: true; calculatedItem: CalculatedItem; nbsCode: string }
  | { isEligible: false; reason: string | null };

const NFSE_DOCUMENT_TYPE = 91;

const REASONS = {
  notCalculated: "O serviço não foi calculado, então não há NFS-e para gerar.",
  noTaxGroup:
    "O CST escolhido não tem o grupo IBS/CBS, e a NFS-e simulada precisa desses valores para ser gerada.",
};

function checkNfseEligibility(operation: Operation, result: CalculationResult) {
  const [operationItem] = operation.items;
  const [itemResult] = result.items;

  if (operation.documentType !== NFSE_DOCUMENT_TYPE || !operationItem?.nbsCode || !itemResult) {
    const notNfse: NfseEligibility = { isEligible: false, reason: null };
    return notNfse;
  }

  if (itemResult.status !== "calculated" && itemResult.status !== "simulated") {
    const notCalculated: NfseEligibility = { isEligible: false, reason: REASONS.notCalculated };
    return notCalculated;
  }

  if (!itemResult.taxes) {
    const noTaxGroup: NfseEligibility = { isEligible: false, reason: REASONS.noTaxGroup };
    return noTaxGroup;
  }

  const eligible: NfseEligibility = {
    isEligible: true,
    calculatedItem: itemResult,
    nbsCode: operationItem.nbsCode,
  };
  return eligible;
}

export type { NfseEligibility };
export { checkNfseEligibility };
