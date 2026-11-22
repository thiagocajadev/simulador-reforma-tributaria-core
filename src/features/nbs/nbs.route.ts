import { Hono } from "hono";
import { parseSearchQuery } from "@/shared/data/search.match.ts";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import { combineFields, parseLimit, parseReferenceDate } from "@/shared/http/query.params.ts";
import type { NbsSearchResult } from "./nbs.dto.ts";
import { searchNbs } from "./nbs.repository.ts";

const NBS_SEARCH_ACTION = "nbs.search";

const nbsRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const parameters = context.req.query();
  const fields = combineFields({
    query: parseSearchQuery(parameters.q),
    date: parseReferenceDate(parameters.date, new Date()),
    limit: parseLimit(parameters.limit),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: NBS_SEARCH_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const { page } = await searchNbs(context.env.OPEN_DATA, fields.values);
  const result: NbsSearchResult = page;
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({ action: NBS_SEARCH_ACTION, traceId, data: result });
  const response = context.json(envelope);
  return response;
});

export { nbsRoute };
