import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { calculationsRoute } from "@/features/calculations/calculations.route.ts";
import { classificationsRoute } from "@/features/classifications/classifications.route.ts";
import { cstRoute } from "@/features/cst/cst.route.ts";
import { healthRoute } from "@/features/health/health.route.ts";
import { municipalitiesRoute } from "@/features/municipalities/municipalities.route.ts";
import { nbsRoute } from "@/features/nbs/nbs.route.ts";
import { ncmRoute } from "@/features/ncm/ncm.route.ts";
import { openApiRoute } from "@/features/openapi/openapi.route.ts";
import { operationIndicatorsRoute } from "@/features/operation-indicators/operation-indicators.route.ts";
import { ratesRoute } from "@/features/rates/rates.route.ts";
import { simplesActivitiesRoute } from "@/features/simples-activities/simples-activities.route.ts";
import { simplesNacionalRoute } from "@/features/simples-nacional/simples-nacional.route.ts";
import {
  createErrorEnvelope,
  deriveTraceId,
  PROBLEM_CATALOG,
  type ProblemCode,
} from "@/shared/http/envelope.ts";
import { limitRequests } from "@/shared/http/rate.limit.ts";
import { logUnhandledError } from "@/shared/http/request.log.ts";
import { applySecurityHeaders } from "@/shared/http/security.headers.ts";

// why: limited route by route, never /api/* as a whole, so /api/health and /api/openapi.json need
// no binding; neither reads D1.
const SEARCH_PATHS = [
  "/api/ncm",
  "/api/nbs",
  "/api/classifications",
  "/api/classifications/selective-tax",
  "/api/cst",
  "/api/municipalities",
  "/api/rates",
  "/api/simples-nacional-activities",
];
const OPERATION_INDICATORS_PATH = "/api/operation-indicators";
const NOT_FOUND_ACTION = "route.resolve";
const UNHANDLED_ERROR_ACTION = "request.process";
const NOT_FOUND_STATUS = 404;
const INTERNAL_STATUS = 500;

const limitSearches = limitRequests<Env>("search", (bindings) => bindings.SEARCH_RATE_LIMITER);
const limitIndicatorLookups = limitRequests<Env>(
  "calculation",
  (bindings) => bindings.CALCULATION_RATE_LIMITER,
);

function createApiApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", applySecurityHeaders);

  for (const searchPath of SEARCH_PATHS) {
    app.use(searchPath, limitSearches);
  }

  app.use(OPERATION_INDICATORS_PATH, limitIndicatorLookups);
  app.route("/api/health", healthRoute);
  app.route("/api/openapi.json", openApiRoute);
  app.route("/api/ncm", ncmRoute);
  app.route("/api/nbs", nbsRoute);
  app.route("/api/classifications", classificationsRoute);
  app.route("/api/cst", cstRoute);
  app.route("/api/municipalities", municipalitiesRoute);
  app.route("/api/rates", ratesRoute);
  app.route("/api/operation-indicators", operationIndicatorsRoute);
  app.route("/api/calculations", calculationsRoute);
  app.route("/api/simples-nacional-calculations", simplesNacionalRoute);
  app.route("/api/simples-nacional-activities", simplesActivitiesRoute);
  app.notFound(respondNotFound);
  app.onError(respondUnhandledError);

  return app;
}

function respondNotFound(context: Context) {
  const traceId = deriveTraceId(context.req.raw);
  const instance = context.req.path;
  const detail = `No API route matches ${context.req.method} ${instance}`;
  const envelope = createErrorEnvelope({
    action: NOT_FOUND_ACTION,
    traceId,
    code: "NOT_FOUND",
    detail,
    instance,
  });
  const response = context.json(envelope, NOT_FOUND_STATUS);
  return response;
}

function respondUnhandledError(error: Error, context: Context) {
  if (error instanceof HTTPException) {
    const clientErrorCode = findClientErrorCode(error.status);

    if (clientErrorCode) {
      const clientErrorResponse = respondClientError({ error, code: clientErrorCode, context });
      return clientErrorResponse;
    }
  }

  const traceId = deriveTraceId(context.req.raw);
  const instance = context.req.path;
  const detail =
    "The request could not be processed. Retry, and report the traceId if it persists.";
  const envelope = createErrorEnvelope({
    action: UNHANDLED_ERROR_ACTION,
    traceId,
    code: "INTERNAL",
    detail,
    instance,
  });

  logUnhandledError(context, error);

  const response = context.json(envelope, INTERNAL_STATUS);
  return response;
}

// why: an HTTPException carries a deliberate 4xx; only statuses the catalog knows keep it, the rest stay 500.
function findClientErrorCode(status: number) {
  const entry = Object.entries(PROBLEM_CATALOG).find(
    ([, definition]) => definition.status === status && status < INTERNAL_STATUS,
  );
  const code = entry ? (entry[0] as ProblemCode) : null;
  return code;
}

function respondClientError(input: { error: HTTPException; code: ProblemCode; context: Context }) {
  const { error, code, context } = input;
  const envelope = createErrorEnvelope({
    action: UNHANDLED_ERROR_ACTION,
    traceId: deriveTraceId(context.req.raw),
    code,
    detail: error.message || PROBLEM_CATALOG[code].title,
    instance: context.req.path,
  });
  const response = context.json(envelope, error.status);
  return response;
}

const apiApp = createApiApp();

export { createApiApp };
export default apiApp;
