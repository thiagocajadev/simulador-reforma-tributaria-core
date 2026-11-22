import { type Result, requestApi } from "@/shared/http/api.client.ts";
import type { HealthReport } from "./health.dto.ts";

const HEALTH_PATH = "/api/health";

interface HealthView {
  version: string;
}

async function fetchHealthView() {
  const result = await requestApi<HealthReport>(HEALTH_PATH);

  if (!result.isSuccess) {
    return result;
  }

  const view: Result<HealthView> = { isSuccess: true, value: { version: result.value.version } };
  return view;
}

export type { HealthView };
export { fetchHealthView };
