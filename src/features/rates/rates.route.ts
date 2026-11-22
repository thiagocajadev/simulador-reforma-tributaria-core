import { Hono } from "hono";
import { findMunicipality, findUfCode } from "@/shared/data/location.lookup.ts";
import { createSuccessEnvelope, deriveTraceId } from "@/shared/http/envelope.ts";
import { respondInvalidInput } from "@/shared/http/problem.respond.ts";
import {
  combineFields,
  type FieldResult,
  parseMunicipalityCode,
  parseReferenceDate,
  parseUf,
} from "@/shared/http/query.params.ts";
import { composeRate } from "./rates.compose.ts";
import type { RateLookupResult, TaxRate } from "./rates.dto.ts";
import { findRateComponents } from "./rates.repository.ts";

const RATE_LOOKUP_ACTION = "rates.lookup";

// why: from 2027 the law has not fixed the rates, and the upstream calculator requires nominal
// rates in the operation (ProcessamentoItemService.java:60 and :454).
const NOMINAL_RATES_FROM_YEAR = 2027;

const ratesRoute = new Hono<{ Bindings: Env }>().get("/", async (context) => {
  const parameters = context.req.query();
  const fields = combineFields({
    date: parseReferenceDate(parameters.date, new Date()),
    uf: parseUf(parameters.uf),
    municipalityCode: parseMunicipalityCode(parameters.municipalityCode),
  });

  if (!fields.isValid) {
    const rejection = respondInvalidInput(context, {
      action: RATE_LOOKUP_ACTION,
      issues: fields.issues,
    });
    return rejection;
  }

  const database = context.env.OPEN_DATA;
  const { date, uf, municipalityCode } = fields.values;
  const location = await resolveLocation({ database, uf, municipalityCode });

  if (!location.isValid) {
    const locationRejection = respondInvalidInput(context, {
      action: RATE_LOOKUP_ACTION,
      issues: [location.issue],
    });
    return locationRejection;
  }

  const result = await lookUpRates({ database, date, ufCode: location.value, municipalityCode });
  const traceId = deriveTraceId(context.req.raw);
  const envelope = createSuccessEnvelope({ action: RATE_LOOKUP_ACTION, traceId, data: result });
  const response = context.json(envelope);
  return response;
});

async function resolveLocation(input: {
  database: D1Database;
  uf: string;
  municipalityCode: number;
}) {
  const { database, uf, municipalityCode } = input;
  const ufCode = await findUfCode(database, uf);

  if (ufCode === null) {
    const unknownUf: FieldResult<number> = {
      isValid: false,
      issue: { field: "uf", message: `Unknown state code "${uf}".` },
    };
    return unknownUf;
  }

  const municipality = await findMunicipality(database, municipalityCode);

  if (municipality?.ufCode !== ufCode) {
    const outsideUf: FieldResult<number> = {
      isValid: false,
      issue: {
        field: "municipalityCode",
        message: `Municipality ${municipalityCode} is not in ${uf}.`,
      },
    };
    return outsideUf;
  }

  const resolved: FieldResult<number> = { isValid: true, value: ufCode };
  return resolved;
}

async function lookUpRates(input: {
  database: D1Database;
  date: string;
  ufCode: number;
  municipalityCode: number;
}) {
  const { database, date, ufCode, municipalityCode } = input;
  const components = await findRateComponents(database, { date, ufCode, municipalityCode });
  const rates = components.map(({ tax, ...rateComponents }) => {
    const taxRate: TaxRate = { tax, ...composeRate(rateComponents) };
    return taxRate;
  });
  const requiresNominalRates = Number(date.slice(0, 4)) >= NOMINAL_RATES_FROM_YEAR;
  const result: RateLookupResult = { rates, requiresNominalRates };
  return result;
}

export { ratesRoute };
