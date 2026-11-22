// Response envelope shared by the Worker (producer) and the SPA (consumer).
// Shape: ok → meta → payload; errors follow RFC 9457 Problem Details.

type ProblemCode =
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "METHOD_NOT_ALLOWED"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "INTERNAL";

interface ProblemDefinition {
  status: number;
  title: string;
}

interface ValidationIssue {
  field: string;
  message: string;
}

interface SuccessMeta {
  action: string;
  traceId: string;
}

interface ErrorMeta extends SuccessMeta {
  timestamp: string;
}

interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: ProblemCode;
  errors?: ValidationIssue[];
}

interface SuccessEnvelope<Payload> {
  ok: true;
  meta: SuccessMeta;
  data: Payload;
}

interface ErrorEnvelope {
  ok: false;
  meta: ErrorMeta;
  error: Problem;
}

type Envelope<Payload> = SuccessEnvelope<Payload> | ErrorEnvelope;

interface SuccessEnvelopeInput<Payload> {
  action: string;
  traceId: string;
  data: Payload;
}

interface ErrorEnvelopeInput {
  action: string;
  traceId: string;
  code: ProblemCode;
  detail: string;
  instance: string;
  errors?: ValidationIssue[];
}

const TRACE_HEADER = "cf-ray";
const TRACE_ID_PATTERN = /^[\w-]{1,64}$/;
const TRACE_IDS = new WeakMap<Request, string>();

const PROBLEM_CATALOG: Record<ProblemCode, ProblemDefinition> = {
  INVALID_INPUT: { status: 400, title: "Invalid input" },
  NOT_FOUND: { status: 404, title: "Resource not found" },
  METHOD_NOT_ALLOWED: { status: 405, title: "Method not allowed" },
  PAYLOAD_TOO_LARGE: { status: 413, title: "Payload too large" },
  RATE_LIMITED: { status: 429, title: "Too many requests" },
  INTERNAL: { status: 500, title: "Internal error" },
};

function createSuccessEnvelope<Payload>(input: SuccessEnvelopeInput<Payload>) {
  const { action, traceId, data } = input;
  const envelope: SuccessEnvelope<Payload> = { ok: true, meta: { action, traceId }, data };
  return envelope;
}

function createErrorEnvelope(input: ErrorEnvelopeInput) {
  const { action, traceId, code, detail, instance, errors } = input;
  const timestamp = new Date().toISOString();
  const problem = createProblem({ code, detail, instance, errors });
  const envelope: ErrorEnvelope = {
    ok: false,
    meta: { action, traceId, timestamp },
    error: problem,
  };
  return envelope;
}

function createProblem(input: Pick<ErrorEnvelopeInput, "code" | "detail" | "instance" | "errors">) {
  const { code, detail, instance, errors } = input;
  const { status, title } = PROBLEM_CATALOG[code];
  const type = `/problems/${code.toLowerCase().replaceAll("_", "-")}`;
  const baseProblem: Problem = { type, title, status, detail, instance, code };
  const problem: Problem = errors ? { ...baseProblem, errors } : baseProblem;
  return problem;
}

// why: only Cloudflare's edge sets cf-ray; in dev any client can, and the value is echoed and logged.
// Memoized per request, so a drawn UUID is the same in the response and in its log events.
function deriveTraceId(request: Request) {
  const knownTraceId = TRACE_IDS.get(request);

  if (knownTraceId) {
    return knownTraceId;
  }

  const edgeTraceId = request.headers.get(TRACE_HEADER) ?? "";
  const traceId = TRACE_ID_PATTERN.test(edgeTraceId) ? edgeTraceId : crypto.randomUUID();

  TRACE_IDS.set(request, traceId);

  return traceId;
}

export type { Envelope, ErrorEnvelope, Problem, ProblemCode, SuccessEnvelope, ValidationIssue };
export { createErrorEnvelope, createSuccessEnvelope, deriveTraceId, PROBLEM_CATALOG };
