import { Hono } from "hono";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import {
  combineFields,
  parseReferenceDate,
  parseRequiredCode,
} from "@/shared/http/query.params.ts";
import type { OperationIndicatorsResult } from "./operation-indicators.dto.ts";
import { findOperationIndicators } from "./operation-indicators.repository.ts";

const OPERATION_INDICATORS_ACTION = "operationIndicators.lookup";
const NBS_CODE_PATTERN = /^\d{9}$/;
const CLASSIFICATION_CODE_PATTERN = /^\d{6}$/;

const operationIndicatorsRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const parameters = context.req.query();
  const fields = combineFields({
    nbsCode: parseRequiredCode("nbsCode", parameters.nbsCode, NBS_CODE_PATTERN),
    cClassTrib: parseRequiredCode("cClassTrib", parameters.cClassTrib, CLASSIFICATION_CODE_PATTERN),
    date: parseReferenceDate(parameters.date, new Date()),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: OPERATION_INDICATORS_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const { serviceItems } = await findOperationIndicators(context.env.OPEN_DATA, fields.values);
  const result: OperationIndicatorsResult = {
    nbsCode: fields.values.nbsCode,
    cClassTrib: fields.values.cClassTrib,
    serviceItems,
  };
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({
    action: OPERATION_INDICATORS_ACTION,
    traceId,
    data: result,
  });
  const response = context.json(envelope);
  return response;
});

export { operationIndicatorsRoute };
