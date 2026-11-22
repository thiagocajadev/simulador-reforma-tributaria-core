import { Hono } from "hono";
import { OPENAPI_DOCUMENT } from "./openapi.document.ts";

// why: the document is the contract itself, so it goes out bare, without the success envelope.
const openApiRoute = new Hono().get("/", (context) => {
  const response = context.json(OPENAPI_DOCUMENT);
  return response;
});

export { openApiRoute };
