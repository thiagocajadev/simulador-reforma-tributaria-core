import { Hono } from "hono";
import { findUfCode } from "@/shared/data/location.lookup.ts";
import { parseSearchQuery } from "@/shared/data/search.match.ts";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import {
  combineFields,
  parseLimit,
  parseOptionalUf,
  parseReferenceDate,
} from "@/shared/http/query.params.ts";
import type { MunicipalitySearchResult } from "./municipalities.dto.ts";
import { searchMunicipalities } from "./municipalities.repository.ts";

const MUNICIPALITY_SEARCH_ACTION = "municipalities.search";

const municipalitiesRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const parameters = context.req.query();
  const fields = combineFields({
    uf: parseOptionalUf(parameters.uf),
    query: parseSearchQuery(parameters.q),
    date: parseReferenceDate(parameters.date, new Date()),
    limit: parseLimit(parameters.limit),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: MUNICIPALITY_SEARCH_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const database = context.env.OPEN_DATA;
  const { uf } = fields.values;
  const ufCode = uf === null ? null : await findUfCode(database, uf);

  if (uf !== null && ufCode === null) {
    const unknownUf = respondInvalidInput(context, {
      action: MUNICIPALITY_SEARCH_ACTION,
      issues: [{ field: "uf", message: `Unknown state code "${uf}".` }],
    });
    return unknownUf;
  }

  const { page } = await searchMunicipalities(database, { ...fields.values, ufCode });
  const result: MunicipalitySearchResult = page;
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({
    action: MUNICIPALITY_SEARCH_ACTION,
    traceId,
    data: result,
  });
  const response = context.json(envelope);
  return response;
});

export { municipalitiesRoute };
