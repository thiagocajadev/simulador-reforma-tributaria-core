import { Hono } from "hono";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { version } from "../../../package.json";
import { HEALTHY_STATUS, type HealthReport } from "./health.dto.ts";

const HEALTH_ACTION = "health.read";

const healthRoute = new Hono().get("/", (context) => {
  const traceId = deriveTraceId(context.req.raw);
  const report: HealthReport = { status: HEALTHY_STATUS, version };
  const envelope = createSuccessEnvelope({ action: HEALTH_ACTION, traceId, data: report });
  const response = context.json(envelope);
  return response;
});

export { healthRoute };
