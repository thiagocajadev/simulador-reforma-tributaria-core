import { type Result, requestApi } from "@/shared/http/api.client.ts";
import type { SimplesSubmission } from "./simples.draft.ts";
import type { SimplesCalculationResult } from "./simples.dto.ts";
import { type SimplesView, toSimplesView } from "./simples.view.ts";

interface SimplesOutcome {
  operation: SimplesSubmission;
  result: SimplesCalculationResult;
  view: SimplesView;
}

const SIMPLES_CALCULATIONS_PATH = "/api/simples-nacional-calculations";

async function submitSimplesCalculation(operation: SimplesSubmission) {
  const response = await requestApi<SimplesCalculationResult>(SIMPLES_CALCULATIONS_PATH, {
    method: "POST",
    body: operation,
  });

  if (!response.isSuccess) {
    return response;
  }

  const outcome: Result<SimplesOutcome> = {
    isSuccess: true,
    value: { operation, result: response.value, view: toSimplesView(response.value) },
  };
  return outcome;
}

export type { SimplesOutcome };
export { submitSimplesCalculation };
