import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import { throttleRequest } from "@/shared/http/rate.limit.ts";
import { parseOperation } from "./calculation.request.ts";
import { calculateOperation } from "./operation.calculate.ts";

const CALCULATION_ACTION = "calculations.calculate";

// why: 20 items take about 6 KB; the cap keeps JSON parsing inside the Free plan CPU budget.
const MAX_BODY_BYTES = 32 * 1024;

const calculationsRoute = new Hono<{ Bindings: Env }>().post(
  "/",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (context) => {
      const tooLarge = respondInvalidInput(context, {
        action: CALCULATION_ACTION,
        issues: [{ field: "body", message: `Must be at most ${MAX_BODY_BYTES / 1024} KB.` }],
      });
      return tooLarge;
    },
  }),
  async (context) => {
    const body = await context.req.json<unknown>().catch(() => undefined);
    const parsed = parseOperation(body);

    if (!parsed.isValid) {
      const rejection = respondInvalidInput(context, {
        action: CALCULATION_ACTION,
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

    const outcome = await calculateOperation(context.env.OPEN_DATA, parsed.operation);

    if (outcome.kind === "invalid") {
      const operationRejection = respondInvalidInput(context, {
        action: CALCULATION_ACTION,
        issues: outcome.issues,
      });
      return operationRejection;
    }

    const traceId = deriveTraceId(context.req.raw);
    const envelope = createSuccessEnvelope({
      action: CALCULATION_ACTION,
      traceId,
      data: outcome.result,
    });
    const response = context.json(envelope);
    return response;
  },
);

export { calculationsRoute };
