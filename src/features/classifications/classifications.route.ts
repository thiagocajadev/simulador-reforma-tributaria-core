import { type Context, Hono } from "hono";
import { parseSearchQuery, type SearchQuery } from "@/shared/data/search.match.ts";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import {
  combineFields,
  type FieldResult,
  parseLimit,
  parseOptionalCode,
  parseReferenceDate,
} from "@/shared/http/query.params.ts";
import type {
  ClassificationSearchResult,
  SelectiveTaxClassificationList,
} from "./classifications.dto.ts";
import { searchClassifications } from "./classifications.repository.ts";
import { listSelectiveTaxClassifications } from "./selective.classifications.repository.ts";

const CLASSIFICATION_SEARCH_ACTION = "classifications.search";
const SELECTIVE_TAX_LIST_ACTION = "classifications.selectiveTax.list";
const CST_CODE_PATTERN = /^\d{3}$/;

const classificationsRoute = new Hono<{ Bindings: Env }>()
  .get("/", searchClassificationsByQuery)
  .get("/selective-tax", listSelectiveTax);

async function searchClassificationsByQuery(context: Context<{ Bindings: Env }>) {
  const parameters = context.req.query();
  const cstCode = parseOptionalCode("cstCode", parameters.cstCode, CST_CODE_PATTERN);
  const fields = combineFields({
    query: parseOptionalQuery(parameters.q, cstCode),
    cstCode,
    date: parseReferenceDate(parameters.date, new Date()),
    limit: parseLimit(parameters.limit),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: CLASSIFICATION_SEARCH_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const { page } = await searchClassifications(context.env.OPEN_DATA, fields.values);
  const result: ClassificationSearchResult = page;
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({
    action: CLASSIFICATION_SEARCH_ACTION,
    traceId,
    data: result,
  });
  const response = context.json(envelope);
  return response;
}

async function listSelectiveTax(context: Context<{ Bindings: Env }>) {
  const fields = combineFields({
    date: parseReferenceDate(context.req.query("date"), new Date()),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: SELECTIVE_TAX_LIST_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const { classifications } = await listSelectiveTaxClassifications(
    context.env.OPEN_DATA,
    fields.values.date,
  );
  const result: SelectiveTaxClassificationList = { items: classifications };
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({
    action: SELECTIVE_TAX_LIST_ACTION,
    traceId,
    data: result,
  });
  const response = context.json(envelope);
  return response;
}

// why: without q the route lists one CST's classifications, which is how the form fills its picker.
function parseOptionalQuery(raw: string | undefined, cstCode: FieldResult<string | null>) {
  const isListingCst = (raw ?? "").trim() === "" && cstCode.isValid && cstCode.value !== null;

  if (isListingCst) {
    const listing: FieldResult<SearchQuery | null> = { isValid: true, value: null };
    return listing;
  }

  const query: FieldResult<SearchQuery | null> = parseSearchQuery(raw);
  return query;
}

export { classificationsRoute };
