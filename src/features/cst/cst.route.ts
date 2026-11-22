import { Hono } from "hono";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import { combineFields, parseReferenceDate } from "@/shared/http/query.params.ts";
import type { CstListResult } from "./cst.dto.ts";
import { listCst } from "./cst.repository.ts";

const CST_LIST_ACTION = "cst.list";

const cstRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const fields = combineFields({
    date: parseReferenceDate(context.req.query("date"), new Date()),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: CST_LIST_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const cstEntries = await listCst(context.env.OPEN_DATA, fields.values.date);
  const result: CstListResult = { items: cstEntries };
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({ action: CST_LIST_ACTION, traceId, data: result });
  const response = context.json(envelope);
  return response;
});

export { cstRoute };
