// Spends the calculation rate limit of one address in route tests: each post is the largest
// regular regime operation the API accepts, which charges its 20 items against the 60 a minute.

import { MAX_ITEMS } from "@/features/calculations/calculation.request.ts";
import { requestApi } from "./api.request.ts";

interface LargestCalculationPosts {
  clientAddress: string;
  postCount: number;
}

const CALCULATIONS_PATH = "/api/calculations";
const POST = "POST";

const LARGEST_OPERATION = {
  taxEventDate: "2026-03-10T10:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 55,
  items: Array.from({ length: MAX_ITEMS }, (_entry, position) => ({
    itemNumber: position + 1,
    ncmCode: "10063021",
    cstCode: "200",
    cClassTrib: "200003",
    baseAmount: "100.00",
  })),
};

async function postLargestCalculations(input: LargestCalculationPosts) {
  const { clientAddress, postCount } = input;
  const statuses: number[] = [];

  for (let postNumber = 0; postNumber < postCount; postNumber += 1) {
    const reply = await requestApi(CALCULATIONS_PATH, {
      method: POST,
      body: LARGEST_OPERATION,
      clientAddress,
    });
    statuses.push(reply.status);
  }

  return statuses;
}

export { LARGEST_OPERATION, postLargestCalculations };
