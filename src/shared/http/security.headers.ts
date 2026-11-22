// The response headers of every /api/* answer, errors and 404s included (docs/security.md). The API
// answers JSON only, so its policy allows nothing to load or frame it. The static pages carry their
// own set in public/_headers, which security.headers.test.ts keeps in step on the shared headers.
// One exception: the OpenAPI document, static and with no D1 read, opens to every origin, so a reader
// on another site (Swagger Editor, Scalar) can load it by its URL. The data routes stay same-origin.
import type { MiddlewareHandler } from "hono";

const API_SECURITY_HEADERS: Record<string, string> = {
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Resource-Policy": "same-origin",
};

const OPEN_DOCUMENT_PATHS = new Set(["/api/openapi.json"]);

const OPEN_DOCUMENT_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Cross-Origin-Resource-Policy": "cross-origin",
};

const applySecurityHeaders: MiddlewareHandler = async (context, next) => {
  await next();

  const isOpenDocument = OPEN_DOCUMENT_PATHS.has(context.req.path);
  const headers = isOpenDocument
    ? { ...API_SECURITY_HEADERS, ...OPEN_DOCUMENT_HEADERS }
    : API_SECURITY_HEADERS;

  for (const [name, value] of Object.entries(headers)) {
    context.res.headers.set(name, value);
  }
};

export { API_SECURITY_HEADERS, applySecurityHeaders, OPEN_DOCUMENT_HEADERS };
