// The OpenAPI 3.1 description of the public API, written by hand. GET /api/openapi.json serves it,
// openapi.reference.ts reads its routes for a reference in Portuguese, and openapi.route.test.ts fails when a
// route of src/worker/index.ts is missing here. The shapes mirror the *.dto.ts files of each slice;
// the long ones (the calculation results) are described down to the fields a client reads, with the
// rest open, and docs/calculation.md and docs/simples-nacional.md carry every field.

import { version } from "../../../package.json";
import { API_ORIGIN } from "./openapi.origin.ts";

type JsonSchema = Record<string, unknown>;

const DECIMAL: JsonSchema = {
  type: "string",
  pattern: "^-?\\d+(\\.\\d+)?$",
  description: "A decimal as a plain string, never a JSON number.",
};
const NULLABLE_DECIMAL: JsonSchema = { oneOf: [DECIMAL, { type: "null" }] };
const NULLABLE_STRING: JsonSchema = { type: ["string", "null"] };
const ISO_DATE: JsonSchema = { type: "string", format: "date", examples: ["2027-03-10"] };

function reference(name: string) {
  const pointer = { $ref: `#/components/schemas/${name}` };
  return pointer;
}

function success(dataSchema: JsonSchema, description: string) {
  const response = {
    description,
    content: {
      "application/json": {
        schema: {
          type: "object",
          required: ["ok", "meta", "data"],
          properties: { ok: { const: true }, meta: reference("SuccessMeta"), data: dataSchema },
        },
      },
    },
  };
  return response;
}

function problem(name: string) {
  const pointer = { $ref: `#/components/responses/${name}` };
  return pointer;
}

const QUERY_PARAMETERS = {
  q: {
    name: "q",
    in: "query",
    required: true,
    description:
      'Search text, 2 to 60 characters. Digits and separators search by code prefix ("0713.33"); words search the description.',
    schema: { type: "string", minLength: 2, maxLength: 60 },
  },
  date: {
    name: "date",
    in: "query",
    required: false,
    description: "Reference date, YYYY-MM-DD. Defaults to today in Brasília.",
    schema: ISO_DATE,
  },
  limit: {
    name: "limit",
    in: "query",
    required: false,
    description: "Page size, 1 to 20. Defaults to 20.",
    schema: { type: "integer", minimum: 1, maximum: 20, default: 20 },
  },
};

const SEARCH_ERRORS = {
  "400": problem("InvalidInput"),
  "429": problem("RateLimited"),
  "500": problem("Internal"),
};

function searchPage(itemSchema: JsonSchema) {
  const page = {
    type: "object",
    required: ["items", "hasMore"],
    properties: {
      items: { type: "array", items: itemSchema },
      hasMore: { type: "boolean", description: "True when more matches exist past the limit." },
    },
  };
  return page;
}

function itemList(itemSchema: JsonSchema) {
  const list = {
    type: "object",
    required: ["items"],
    properties: { items: { type: "array", items: itemSchema } },
  };
  return list;
}

const SCHEMAS: Record<string, JsonSchema> = {
  SuccessMeta: {
    type: "object",
    required: ["action", "traceId"],
    properties: {
      action: { type: "string", examples: ["ncm.search"] },
      traceId: { type: "string", description: "The Cloudflare cf-ray, or a drawn UUID." },
    },
  },
  ErrorEnvelope: {
    type: "object",
    required: ["ok", "meta", "error"],
    properties: {
      ok: { const: false },
      meta: {
        type: "object",
        required: ["action", "traceId", "timestamp"],
        properties: {
          action: { type: "string" },
          traceId: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      error: reference("Problem"),
    },
  },
  Problem: {
    type: "object",
    description: "RFC 9457 Problem Details.",
    required: ["type", "title", "status", "detail", "instance", "code"],
    properties: {
      type: { type: "string", examples: ["/problems/invalid-input"] },
      title: { type: "string" },
      status: { type: "integer" },
      detail: { type: "string" },
      instance: { type: "string" },
      code: {
        type: "string",
        enum: [
          "INVALID_INPUT",
          "NOT_FOUND",
          "METHOD_NOT_ALLOWED",
          "PAYLOAD_TOO_LARGE",
          "RATE_LIMITED",
          "INTERNAL",
        ],
      },
      errors: {
        type: "array",
        description: "Every field that failed, on a 400.",
        items: {
          type: "object",
          required: ["field", "message"],
          properties: { field: { type: "string" }, message: { type: "string" } },
        },
      },
    },
  },
  HealthReport: {
    type: "object",
    required: ["status", "version"],
    properties: { status: { const: "ok" }, version: { type: "string", examples: [version] } },
  },
  ValidityWindow: {
    type: "object",
    required: ["from", "to"],
    properties: { from: ISO_DATE, to: { oneOf: [ISO_DATE, { type: "null" }] } },
  },
  SelectiveTaxIncidence: {
    type: ["object", "null"],
    description: "Whether the Imposto Seletivo applies to the code on the date.",
    required: ["hasAdValorem", "adRemUnit", "officialRates"],
    properties: {
      hasAdValorem: { type: "boolean" },
      adRemUnit: {
        type: ["object", "null"],
        properties: { code: { type: "string" }, description: { type: "string" } },
      },
      officialRates: {
        type: "object",
        description: "Null while the open data holds no rate; the client then sends one.",
        properties: { adValorem: NULLABLE_DECIMAL, adRem: NULLABLE_DECIMAL },
      },
    },
  },
  NcmMatch: {
    type: "object",
    required: ["ncmCode", "description", "context", "validFrom", "validTo", "selectiveTax"],
    properties: {
      ncmCode: { type: "string", pattern: "^\\d{8}$" },
      description: { type: "string" },
      context: { type: "string", description: "The chapter and heading the code sits under." },
      validFrom: ISO_DATE,
      validTo: { oneOf: [ISO_DATE, { type: "null" }] },
      selectiveTax: reference("SelectiveTaxIncidence"),
      selectiveTaxWindows: {
        type: "array",
        description: "The IS rate rows over the code, to evaluate another date without searching.",
        items: { type: "object" },
      },
    },
  },
  NbsMatch: {
    type: "object",
    required: ["nbsCode", "description", "context", "validFrom", "validTo"],
    properties: {
      nbsCode: { type: "string", pattern: "^\\d{9}$" },
      description: { type: "string" },
      context: { type: "string" },
      validFrom: ISO_DATE,
      validTo: { oneOf: [ISO_DATE, { type: "null" }] },
    },
  },
  ClassificationMatch: {
    type: "object",
    required: ["cClassTrib", "description", "cstCode", "rateType", "validFrom", "validTo"],
    properties: {
      cClassTrib: { type: "string", pattern: "^\\d{6}$" },
      description: { type: "string" },
      cstCode: { type: "string", pattern: "^\\d{3}$" },
      rateType: { type: "string" },
      nomenclature: NULLABLE_STRING,
      validFrom: ISO_DATE,
      validTo: { oneOf: [ISO_DATE, { type: "null" }] },
    },
  },
  SelectiveTaxClassification: {
    type: "object",
    required: ["cClassTrib", "description", "cstCode", "cstDescription", "isCalculated"],
    properties: {
      cClassTrib: { type: "string" },
      description: { type: "string" },
      cstCode: { type: "string" },
      cstDescription: { type: "string" },
      isCalculated: { type: "boolean", description: "False where the treatment yields zero." },
    },
  },
  CstEntry: {
    type: "object",
    required: ["cstCode", "description"],
    properties: { cstCode: { type: "string" }, description: { type: "string" } },
  },
  MunicipalityMatch: {
    type: "object",
    required: ["municipalityCode", "name", "uf"],
    properties: {
      municipalityCode: { type: "integer", description: "The 7-digit IBGE code." },
      name: { type: "string" },
      uf: { type: "string", pattern: "^[A-Z]{2}$" },
    },
  },
  RateLookupResult: {
    type: "object",
    required: ["rates", "requiresNominalRates"],
    properties: {
      rates: {
        type: "array",
        items: {
          type: "object",
          required: ["tax", "rate", "source"],
          properties: {
            tax: { type: "string", enum: ["CBS", "IBS_UF", "IBS_MUN"] },
            rate: DECIMAL,
            source: { type: "string", enum: ["standard", "reference"] },
          },
        },
      },
      requiresNominalRates: {
        type: "boolean",
        description: "True from 2027, while the law has not fixed the rates.",
      },
    },
  },
  OperationIndicatorsResult: {
    type: "object",
    required: ["nbsCode", "cClassTrib", "serviceItems"],
    properties: {
      nbsCode: { type: "string" },
      cClassTrib: { type: "string" },
      serviceItems: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lc116Code: { type: "string" },
            nationalTaxCode: { type: "string" },
            description: { type: "string" },
            indicators: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  indicatorCode: { type: "string" },
                  incidencePlace: { type: "string" },
                  operationType: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  SimplesActivity: {
    type: "object",
    required: ["activityCode", "description", "annex", "isNonTaxable"],
    properties: {
      activityCode: { type: "string" },
      description: { type: "string" },
      annex: NULLABLE_STRING,
      isNonTaxable: { type: "boolean" },
      annexWithoutFatorR: NULLABLE_STRING,
      annexWithFatorR: NULLABLE_STRING,
      hasIssInSimples: { type: "boolean" },
      allowsMunicipalBenefit: { type: "boolean" },
    },
  },
  Operation: {
    type: "object",
    required: ["taxEventDate", "uf", "municipalityCode", "items"],
    properties: {
      taxEventDate: {
        type: "string",
        format: "date-time",
        description: "The moment of the taxable event, a date and time with its offset.",
        examples: ["2027-03-10T12:00:00-03:00"],
      },
      uf: { type: "string", pattern: "^[A-Z]{2}$" },
      municipalityCode: { type: "integer" },
      documentType: {
        type: "integer",
        description: "tpDoc: 55 NF-e, 65 NFC-e, 91 NFS-e.",
        examples: [55],
      },
      items: { type: "array", minItems: 1, maxItems: 20, items: reference("OperationItem") },
    },
  },
  OperationItem: {
    type: "object",
    required: ["itemNumber", "cstCode", "cClassTrib", "baseAmount"],
    properties: {
      itemNumber: { type: "integer", minimum: 1, maximum: 999 },
      ncmCode: { type: "string", description: "Goods: the 8-digit NCM." },
      nbsCode: { type: "string", description: "Services: the 9-digit NBS." },
      cstCode: { type: "string", pattern: "^\\d{3}$" },
      cClassTrib: { type: "string", pattern: "^\\d{6}$" },
      baseAmount: DECIMAL,
      nominalRates: {
        type: "object",
        description: "Required from 2027, while the law has not fixed the rates. Percentages.",
        properties: { cbsRate: DECIMAL, ibsUfRate: DECIMAL, ibsMunRate: DECIMAL },
      },
      selectiveTax: {
        type: "object",
        description:
          "The Imposto Seletivo group (NF-e and NFC-e, from 2027). Ad valorem in percent; ad rem in reais per unit, times quantity.",
        required: ["cstCode", "cClassTrib"],
        properties: {
          cstCode: { type: "string" },
          cClassTrib: { type: "string" },
          adValoremRate: DECIMAL,
          adRemRate: DECIMAL,
          quantity: DECIMAL,
          unit: { type: "string" },
        },
      },
    },
  },
  CalculationResult: {
    type: "object",
    required: ["items", "totals", "dataVersion"],
    properties: {
      items: {
        type: "array",
        description:
          "One result per item, by status: calculated or simulated (with taxes), rejected (with violations) or notImplemented (with a reason).",
        items: {
          type: "object",
          required: ["itemNumber", "status"],
          properties: {
            itemNumber: { type: "integer" },
            status: {
              type: "string",
              enum: ["calculated", "simulated", "rejected", "notImplemented"],
            },
            cstCode: { type: "string" },
            cClassTrib: { type: "string" },
            taxes: {
              type: ["object", "null"],
              description:
                "baseAmount, cbs, ibsUf, ibsMun (each with rate, effectiveRate, amount and calculationSteps) and ibsAmount.",
            },
            selectiveTax: {
              type: ["object", "null"],
              description: "The IS group as calculated, with its amount.",
            },
            violations: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  ruleCode: { type: "string", examples: ["REG-004"] },
                  field: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
            reason: { type: "string" },
          },
        },
      },
      totals: {
        type: "object",
        properties: {
          baseAmount: DECIMAL,
          cbsAmount: DECIMAL,
          ibsUfAmount: DECIMAL,
          ibsMunAmount: DECIMAL,
          ibsAmount: DECIMAL,
          selectiveTaxAmount: DECIMAL,
        },
      },
      dataVersion: { type: "string", description: "The open data version, such as V0073." },
    },
  },
  SimplesCalculationRequest: {
    type: "object",
    description:
      "NF-e and NFC-e send crt and a rate pair per item; the NFS-e sends simplesOption, the assessment regimes and effectiveRates, with exactly one item.",
    required: ["taxEventDate", "documentType", "items"],
    properties: {
      taxEventDate: ISO_DATE,
      documentType: { type: "integer", examples: [55] },
      crt: { type: "integer", enum: [1, 2, 3, 4] },
      ibsCbsRegime: { type: "integer", enum: [1, 2] },
      simplesOption: { type: "integer", enum: [1, 2, 3, 4] },
      ibsCbsAssessmentRegime: { type: "integer", enum: [1, 2, 3] },
      simplesTaxesAssessmentRegime: { type: "integer", enum: [1, 2, 3] },
      governmentEntity: { type: "integer", enum: [1, 2, 3, 4] },
      effectiveRates: {
        type: "object",
        description: "The company's PGDAS row: a rate pair per annex.",
      },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 20,
        items: {
          type: "object",
          required: ["itemNumber", "cClassTrib", "baseAmount"],
          properties: {
            itemNumber: { type: "integer", minimum: 1, maximum: 999 },
            activityCode: { type: "string" },
            cClassTrib: { type: "string" },
            ncmCode: { type: "string" },
            nbsCode: { type: "string" },
            baseAmount: DECIMAL,
            selectiveTaxAmount: {
              ...DECIMAL,
              description: "The item's IS, passed through to the total. 0.00 when absent.",
            },
            cbsSimplesRate: DECIMAL,
            ibsSimplesRate: DECIMAL,
            issTaxation: {
              type: "integer",
              enum: [1, 2, 3, 4],
              description:
                "NFS-e: how the ISS is taxed; required for the activities with the ISS in the Simples (VSN-036).",
            },
            issWithholding: {
              type: "integer",
              enum: [1, 2, 3],
              description: "NFS-e: the ISS withholding, with issTaxation 1 (VSN-037).",
            },
            municipalBenefit: {
              type: "integer",
              enum: [1, 2, 3, 4],
              description: "NFS-e: the municipal ISS benefit, for activities 12 and 13 (VSN-038).",
            },
          },
        },
      },
    },
  },
  SimplesCalculationResult: {
    type: "object",
    required: ["items", "totals", "dataVersion"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          required: ["itemNumber", "status"],
          properties: {
            itemNumber: { type: "integer" },
            status: {
              type: "string",
              enum: ["calculated", "notCalculated", "rejected", "notImplemented"],
            },
            baseAmount: DECIMAL,
            cbs: { type: "object", description: "rate, dueAmount, pendingAmount, steps." },
            ibs: { type: ["object", "null"], description: "Null with CRT 2." },
            selectiveTaxAmount: NULLABLE_DECIMAL,
            itemTotal: DECIMAL,
          },
        },
      },
      totals: {
        type: ["object", "null"],
        properties: {
          grossRevenue: DECIMAL,
          baseAmount: NULLABLE_DECIMAL,
          ibsDueAmount: NULLABLE_DECIMAL,
          cbsDueAmount: NULLABLE_DECIMAL,
          selectiveTaxAmount: NULLABLE_DECIMAL,
          taxTotal: NULLABLE_DECIMAL,
        },
      },
      dataVersion: { type: "string" },
    },
  },
};

function problemResponse(description: string) {
  const response = {
    description,
    content: { "application/json": { schema: reference("ErrorEnvelope") } },
  };
  return response;
}

const RESPONSES = {
  InvalidInput: problemResponse(
    "INVALID_INPUT: a parameter or the body failed; error.errors lists every field. A body over 32 KB gets it too.",
  ),
  RateLimited: {
    ...problemResponse(
      "RATE_LIMITED: more than 60 requests (or calculated items) in 60 seconds from one address.",
    ),
    headers: { "Retry-After": { schema: { type: "integer" }, description: "Seconds to wait." } },
  },
  Internal: problemResponse("INTERNAL: an unexpected failure, logged with the traceId."),
};

const CALCULATION_ERRORS = {
  "400": problem("InvalidInput"),
  "429": problem("RateLimited"),
  "500": problem("Internal"),
};

const PATHS = {
  "/api/health": {
    get: {
      operationId: "readHealth",
      tags: ["Status"],
      summary: "Report that the API answers, with its version",
      responses: { "200": success(reference("HealthReport"), "The API answers.") },
    },
  },
  "/api/openapi.json": {
    get: {
      operationId: "readOpenApi",
      tags: ["Status"],
      summary: "This document",
      responses: {
        "200": {
          description: "The OpenAPI 3.1 description, without the envelope.",
          content: { "application/json": { schema: { type: "object" } } },
        },
      },
    },
  },
  "/api/ncm": {
    get: {
      operationId: "searchNcm",
      tags: ["Codes"],
      summary: "Search NCM codes (goods) valid on a date",
      parameters: [QUERY_PARAMETERS.q, QUERY_PARAMETERS.date, QUERY_PARAMETERS.limit],
      responses: {
        "200": success(searchPage(reference("NcmMatch")), "A page of NCM matches."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/nbs": {
    get: {
      operationId: "searchNbs",
      tags: ["Codes"],
      summary: "Search NBS codes (services) valid on a date",
      parameters: [QUERY_PARAMETERS.q, QUERY_PARAMETERS.date, QUERY_PARAMETERS.limit],
      responses: {
        "200": success(searchPage(reference("NbsMatch")), "A page of NBS matches."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/classifications": {
    get: {
      operationId: "searchClassifications",
      tags: ["Codes"],
      summary: "Search cClassTrib, or list one CST's classifications",
      parameters: [
        {
          ...QUERY_PARAMETERS.q,
          required: false,
          description: "Search text; optional with cstCode.",
        },
        {
          name: "cstCode",
          in: "query",
          required: false,
          description: "A 3-digit CST. Without q, lists its classifications.",
          schema: { type: "string", pattern: "^\\d{3}$" },
        },
        QUERY_PARAMETERS.date,
        QUERY_PARAMETERS.limit,
      ],
      responses: {
        "200": success(searchPage(reference("ClassificationMatch")), "A page of classifications."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/classifications/selective-tax": {
    get: {
      operationId: "listSelectiveTaxClassifications",
      tags: ["Codes"],
      summary: "List the Imposto Seletivo classifications valid on a date",
      parameters: [QUERY_PARAMETERS.date],
      responses: {
        "200": success(
          itemList(reference("SelectiveTaxClassification")),
          "Every IS classification.",
        ),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/cst": {
    get: {
      operationId: "listCst",
      tags: ["Codes"],
      summary: "List the CST codes of the IBS and the CBS valid on a date",
      parameters: [QUERY_PARAMETERS.date],
      responses: {
        "200": success(itemList(reference("CstEntry")), "Every CST."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/municipalities": {
    get: {
      operationId: "searchMunicipalities",
      tags: ["Places and rates"],
      summary: "Search municipalities, optionally within one state",
      parameters: [
        QUERY_PARAMETERS.q,
        {
          name: "uf",
          in: "query",
          required: false,
          schema: { type: "string", pattern: "^[A-Za-z]{2}$" },
        },
        QUERY_PARAMETERS.date,
        QUERY_PARAMETERS.limit,
      ],
      responses: {
        "200": success(searchPage(reference("MunicipalityMatch")), "A page of municipalities."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/rates": {
    get: {
      operationId: "lookUpRates",
      tags: ["Places and rates"],
      summary: "Look up the CBS, IBS UF and IBS municipal rates for a place and date",
      parameters: [
        QUERY_PARAMETERS.date,
        {
          name: "uf",
          in: "query",
          required: true,
          schema: { type: "string", pattern: "^[A-Za-z]{2}$" },
        },
        {
          name: "municipalityCode",
          in: "query",
          required: true,
          description: "The 7-digit IBGE code, inside uf.",
          schema: { type: "string", pattern: "^\\d{7}$" },
        },
      ],
      responses: {
        "200": success(reference("RateLookupResult"), "The rates on the date."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/operation-indicators": {
    get: {
      operationId: "lookUpOperationIndicators",
      tags: ["Places and rates"],
      summary: "List the NFS-e service items and operation indicators of an NBS and cClassTrib",
      parameters: [
        {
          name: "nbsCode",
          in: "query",
          required: true,
          schema: { type: "string", pattern: "^\\d{9}$" },
        },
        {
          name: "cClassTrib",
          in: "query",
          required: true,
          schema: { type: "string", pattern: "^\\d{6}$" },
        },
        QUERY_PARAMETERS.date,
      ],
      responses: {
        "200": success(reference("OperationIndicatorsResult"), "The service items of the pair."),
        ...SEARCH_ERRORS,
      },
    },
  },
  "/api/calculations": {
    post: {
      operationId: "calculateOperation",
      tags: ["Calculations"],
      summary: "Calculate the CBS, the IBS and, from 2027, the IS of an operation",
      description:
        "Regular regime, ported from the Receita Federal calculator. Each item counts as one request against the rate limit.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: reference("Operation") } },
      },
      responses: {
        "200": success(reference("CalculationResult"), "Every item's result and the totals."),
        ...CALCULATION_ERRORS,
      },
    },
  },
  "/api/simples-nacional-calculations": {
    post: {
      operationId: "calculateSimplesOperation",
      tags: ["Calculations"],
      summary:
        "Calculate the CBS and the IBS of an operation under the Simples Nacional, from 2027",
      description:
        "Ported from the Receita Federal Simples Nacional calculator. Each item counts as one request against the rate limit.",
      requestBody: {
        required: true,
        content: { "application/json": { schema: reference("SimplesCalculationRequest") } },
      },
      responses: {
        "200": success(
          reference("SimplesCalculationResult"),
          "Every item's result and the totals.",
        ),
        ...CALCULATION_ERRORS,
      },
    },
  },
  "/api/simples-nacional-activities": {
    get: {
      operationId: "listSimplesActivities",
      tags: ["Codes"],
      summary: "List the Simples Nacional activities a document admits on a date",
      parameters: [
        QUERY_PARAMETERS.date,
        {
          name: "documentType",
          in: "query",
          required: true,
          description: "tpDoc: 55, 65 or 91.",
          schema: { type: "string", pattern: "^\\d{2}$" },
        },
      ],
      responses: {
        "200": success(itemList(reference("SimplesActivity")), "Every activity."),
        ...SEARCH_ERRORS,
      },
    },
  },
};

const OPENAPI_DOCUMENT = {
  openapi: "3.1.0",
  info: {
    title: "Simulador da Reforma Tributária API",
    version,
    summary:
      "CBS, IBS and IS of Brazil's consumption tax reform, from the open data of the Receita Federal.",
    description: [
      "A public, read-only API over open data: no login, no key, nothing stored.",
      "Rate limits: 60 requests in 60 seconds per address (an IPv6 address counts by its /64); a calculation counts each item. Above it: 429 with Retry-After.",
      "It runs on the Cloudflare Free plan, whose database reads are capped per day, so it may answer 500 late in a busy day. No SLA.",
      "No CORS on the data routes: a script on another site cannot read them from a browser. Servers, scripts and agents can. This document is open to every origin, so any OpenAPI reader can load it by URL.",
      "Every response is an envelope: { ok: true, meta, data } or { ok: false, meta, error }, the error as RFC 9457 Problem Details. Every decimal is a string.",
    ].join("\n\n"),
    license: { name: "MIT", identifier: "MIT" },
    contact: { url: API_ORIGIN.contactUrl },
  },
  externalDocs: API_ORIGIN.reference,
  servers: [{ url: API_ORIGIN.serverUrl }],
  tags: [
    { name: "Status" },
    { name: "Codes", description: "The code tables of the open data." },
    { name: "Places and rates" },
    { name: "Calculations" },
  ],
  paths: PATHS,
  components: { schemas: SCHEMAS, responses: RESPONSES },
};

type OpenApiDocument = typeof OPENAPI_DOCUMENT;

export type { OpenApiDocument };
export { OPENAPI_DOCUMENT };
