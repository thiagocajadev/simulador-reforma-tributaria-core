import { type Result, requestApi } from "@/shared/http/api.client.ts";
import type { CalculationResult, Operation } from "./calculation.dto.ts";
import { type CalculationView, toCalculationView } from "./calculation.view.ts";

interface CalculationOutcome {
  operation: Operation;
  result: CalculationResult;
  view: CalculationView;
}

const CALCULATIONS_PATH = "/api/calculations";

// why: the outcome keeps its operation, so a later form edit never reaches the NFS-e.
async function submitCalculation(operation: Operation) {
  const response = await requestApi<CalculationResult>(CALCULATIONS_PATH, {
    method: "POST",
    body: operation,
  });

  if (!response.isSuccess) {
    return response;
  }

  const outcome: Result<CalculationOutcome> = {
    isSuccess: true,
    value: { operation, result: response.value, view: toCalculationView(response.value) },
  };
  return outcome;
}

export type { CalculationOutcome };
export { submitCalculation };
