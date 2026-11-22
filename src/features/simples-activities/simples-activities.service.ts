import { type Result, requestApi } from "@/shared/http/api.client.ts";
import type { SimplesActivity, SimplesActivityListResult } from "./simples-activities.dto.ts";

const SIMPLES_ACTIVITIES_PATH = "/api/simples-nacional-activities";

async function fetchSimplesActivities(query: { date: string; documentType: number }) {
  const parameters = new URLSearchParams({
    date: query.date,
    documentType: String(query.documentType),
  }).toString();
  const result = await requestApi<SimplesActivityListResult>(
    `${SIMPLES_ACTIVITIES_PATH}?${parameters}`,
  );

  if (!result.isSuccess) {
    return result;
  }

  const activities: Result<SimplesActivity[]> = { isSuccess: true, value: result.value.items };
  return activities;
}

export { fetchSimplesActivities };
