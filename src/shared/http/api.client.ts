// The only module that calls fetch. Every API answer becomes a Result, so no caller needs try/catch.

import type { Envelope, ProblemCode, ValidationIssue } from "./envelope.ts";

type ApiFailureCode = ProblemCode | "NETWORK" | "UNEXPECTED_RESPONSE";

interface ApiFailure {
  code: ApiFailureCode;
  traceId: string | null;
  issues?: ValidationIssue[];
}

interface ApiRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
}

type Result<Value> = { isSuccess: true; value: Value } | { isSuccess: false; failure: ApiFailure };

async function requestApi<Payload>(path: string, options: ApiRequestOptions = {}) {
  const response = await fetchSafely(path, options);

  if (!response) {
    const networkFailure = createFailure("NETWORK");
    return networkFailure;
  }

  const envelope = await parseEnvelope<Payload>(response);

  if (!envelope) {
    const unexpectedFailure = createFailure("UNEXPECTED_RESPONSE");
    return unexpectedFailure;
  }

  const result = toResult(envelope);
  return result;
}

async function fetchSafely(path: string, options: ApiRequestOptions) {
  const init = buildRequestInit(options);

  try {
    const response = await fetch(path, init);
    return response;
  } catch {
    return null;
  }
}

function buildRequestInit(options: ApiRequestOptions) {
  const { method = "GET", body } = options;

  if (body === undefined) {
    const readInit: RequestInit = { method, headers: { Accept: "application/json" } };
    return readInit;
  }

  const writeInit: RequestInit = {
    method,
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
  return writeInit;
}

async function parseEnvelope<Payload>(response: Response) {
  const body = await readJsonSafely(response);
  const isTrustedEnvelope = isEnvelope(body) && body.ok === response.ok;

  if (!isTrustedEnvelope) {
    return null;
  }

  const envelope = body as Envelope<Payload>;
  return envelope;
}

async function readJsonSafely(response: Response) {
  try {
    const body: unknown = await response.json();
    return body;
  } catch {
    return null;
  }
}

function isEnvelope(body: unknown): body is Envelope<unknown> {
  if (typeof body !== "object" || body === null || !("ok" in body) || !("meta" in body)) {
    return false;
  }

  const hasSuccessPayload = body.ok === true && "data" in body;
  const hasProblem =
    body.ok === false &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error !== null &&
    "code" in body.error;
  const isValidShape = hasSuccessPayload || hasProblem;
  return isValidShape;
}

function toResult<Payload>(envelope: Envelope<Payload>) {
  if (envelope.ok) {
    const success: Result<Payload> = { isSuccess: true, value: envelope.data };
    return success;
  }

  const { code, errors } = envelope.error;
  const baseFailure: ApiFailure = { code, traceId: envelope.meta.traceId };
  const apiFailure: ApiFailure = errors ? { ...baseFailure, issues: errors } : baseFailure;
  const failure: Result<Payload> = { isSuccess: false, failure: apiFailure };
  return failure;
}

function createFailure<Payload>(code: ApiFailureCode) {
  const failure: Result<Payload> = { isSuccess: false, failure: { code, traceId: null } };
  return failure;
}

export type { ApiFailure, ApiRequestOptions, Result };
export { requestApi };
