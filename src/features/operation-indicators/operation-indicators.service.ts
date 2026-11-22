import { type Result, requestApi } from "@/shared/http/api.client.ts";
import type { OperationIndicatorsResult, ServiceItem } from "./operation-indicators.dto.ts";

const OPERATION_INDICATORS_PATH = "/api/operation-indicators";

interface OperationIndicatorsQuery {
  nbsCode: string;
  cClassTrib: string;
  date: string;
}

async function fetchServiceItems(query: OperationIndicatorsQuery) {
  const parameters = new URLSearchParams({ ...query }).toString();
  const result = await requestApi<OperationIndicatorsResult>(
    `${OPERATION_INDICATORS_PATH}?${parameters}`,
  );

  if (!result.isSuccess) {
    return result;
  }

  const serviceItems: Result<ServiceItem[]> = {
    isSuccess: true,
    value: result.value.serviceItems,
  };
  return serviceItems;
}

export { fetchServiceItems };
