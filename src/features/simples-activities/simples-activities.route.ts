import { Hono } from "hono";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import {
  combineFields,
  parseReferenceDate,
  parseRequiredCode,
} from "@/shared/http/query.params.ts";
import type { SimplesActivityListResult } from "./simples-activities.dto.ts";
import { listSimplesActivities } from "./simples-activities.repository.ts";

const SIMPLES_ACTIVITY_LIST_ACTION = "simplesNacionalActivities.list";
const DOCUMENT_TYPE = /^\d{2}$/;

const simplesActivitiesRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const fields = combineFields({
    date: parseReferenceDate(context.req.query("date"), new Date()),
    documentType: parseRequiredCode(
      "documentType",
      context.req.query("documentType"),
      DOCUMENT_TYPE,
    ),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: SIMPLES_ACTIVITY_LIST_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const activities = await listSimplesActivities(context.env.OPEN_DATA, {
    date: fields.values.date,
    documentType: Number(fields.values.documentType),
  });
  const result: SimplesActivityListResult = { items: activities };
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({
    action: SIMPLES_ACTIVITY_LIST_ACTION,
    traceId,
    data: result,
  });
  const response = context.json(envelope);
  return response;
});

export { simplesActivitiesRoute };
