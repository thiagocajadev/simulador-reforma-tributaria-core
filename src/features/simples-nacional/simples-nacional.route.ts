import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import { throttleRequest } from "@/shared/http/rate.limit.ts";
import { calculateSimplesOperation } from "./operation.simples.ts";
import { parseSimplesOperation } from "./simples.request.ts";

const SIMPLES_CALCULATION_ACTION = "simplesNacionalCalculations.calculate";

// why: 20 items with 34-place rates take about 8 KB; the cap keeps parsing inside the CPU budget.
const MAX_BODY_BYTES = 32 * 1024;

const simplesNacionalRoute = new Hono<{ Bindings: Env }>().post(
  "/",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (context) => {
      const tooLarge = respondInvalidInput(context, {
        action: SIMPLES_CALCULATION_ACTION,
        issues: [{ field: "body", message: `Must be at most ${MAX_BODY_BYTES / 1024} KB.` }],
      });
      return tooLarge;
    },
  }),
  async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined);
    const parsed = parseSimplesOperation(body);

    if (!parsed.isValid) {
      const rejection = respondInvalidInput(context, {
        action: SIMPLES_CALCULATION_ACTION,
        issues: parsed.issues,
      });
      return rejection;
    }

    // why: a body that fails validation reads no D1, so the charge comes after it, by item.
    const refusal = await throttleRequest(context, {
      limiter: context.env.CALCULATION_RATE_LIMITER,
      limiterName: "calculation",
      cost: parsed.operation.items.length,
    });

    if (refusal) {
      return refusal;
    }

    const outcome = await calculateSimplesOperation(context.env.OPEN_DATA, parsed.operation);

    if (outcome.kind === "invalid") {
      const operationRejection = respondInvalidInput(context, {
        action: SIMPLES_CALCULATION_ACTION,
        issues: outcome.issues,
      });
      return operationRejection;
    }

    const traceId = deriveTraceId(context.req.raw);
    const envelope = createSuccessEnvelope({
      action: SIMPLES_CALCULATION_ACTION,
      traceId,
      data: outcome.result,
    });
    const response = context.json(envelope);
    return response;
  },
);

export { simplesNacionalRoute };
