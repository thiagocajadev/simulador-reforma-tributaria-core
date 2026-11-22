// Values the Vitest global setup (scripts/open-data/open-data.provide.ts) hands to the tests.

import "vitest";

declare module "vitest" {
  interface ProvidedContext {
    openDataStatements: string[];
  }
}
