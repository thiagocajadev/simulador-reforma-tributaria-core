import { Hono } from "hono";
import { parseSearchQuery } from "@/shared/data/search.match.ts";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import { combineFields, parseLimit, parseReferenceDate } from "@/shared/http/query.params.ts";
import type { NcmSearchResult } from "./ncm.dto.ts";
import { searchNcm } from "./ncm.repository.ts";

const NCM_SEARCH_ACTION = "ncm.search";

const ncmRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const parameters = context.req.query();
  const fields = combineFields({
    query: parseSearchQuery(parameters.q),
    date: parseReferenceDate(parameters.date, new Date()),
    limit: parseLimit(parameters.limit),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: NCM_SEARCH_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const { page } = await searchNcm(context.env.OPEN_DATA, fields.values);
  const result: NcmSearchResult = page;
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({ action: NCM_SEARCH_ACTION, traceId, data: result });
  const response = context.json(envelope);
  return response;
});

export { ncmRoute };
