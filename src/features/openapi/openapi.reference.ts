// The API reference for a page in Portuguese: the routes, methods and parameters read
// from OPENAPI_DOCUMENT, so the page cannot drift from the contract, and the copy in Portuguese
// kept here, one entry per operationId (openapi.reference.test.ts fails on a missing or extra one).

import { OPENAPI_DOCUMENT } from "./openapi.document.ts";

type OperationId =
  | "readHealth"
  | "readOpenApi"
  | "searchNcm"
  | "searchNbs"
  | "searchClassifications"
  | "listSelectiveTaxClassifications"
  | "listCst"
  | "searchMunicipalities"
  | "lookUpRates"
  | "lookUpOperationIndicators"
  | "calculateOperation"
  | "calculateSimplesOperation"
  | "listSimplesActivities";

interface OperationGuide {
  summary: string;
  example: string;
}

interface ApiParameter {
  name: string;
  isRequired: boolean;
}

interface ApiOperation {
  operationId: OperationId;
  method: string;
  path: string;
  tag: string;
  summary: string;
  example: string;
  parameters: ApiParameter[];
  hasBody: boolean;
}

interface DocumentOperation {
  operationId: string;
  tags: string[];
  parameters?: Array<{ name: string; required?: boolean }>;
  requestBody?: unknown;
}

// A full rate 2026 NF-e item (a notebook, golden case full-rate-goods-2026), the shortest body
// that calculates: the page prints it as a curl call,
// and openapi.examples.d1.test.ts posts it.
const CALCULATION_EXAMPLE = {
  taxEventDate: "2026-03-10T10:00:00-03:00",
  uf: "RS",
  municipalityCode: 4314902,
  documentType: 55,
  items: [
    {
      itemNumber: 1,
      ncmCode: "84713012",
      cstCode: "000",
      cClassTrib: "000001",
      baseAmount: "1000.00",
    },
  ],
};

const API_BASE_URL = OPENAPI_DOCUMENT.servers[0]?.url ?? "";

const TAG_TITLES: Record<string, string> = {
  Status: "Situação",
  Codes: "Tabelas de códigos",
  "Places and rates": "Lugares e alíquotas",
  Calculations: "Cálculos",
};

const OPERATION_GUIDES: Record<OperationId, OperationGuide> = {
  readHealth: {
    summary: "Diz se a API está no ar e em qual versão.",
    example: "/api/health",
  },
  readOpenApi: {
    summary: "A descrição OpenAPI 3.1 da API inteira, para gerar clientes ou abrir num leitor.",
    example: "/api/openapi.json",
  },
  searchNcm: {
    summary:
      "Busca NCM, os códigos de mercadorias, por código ou por palavras, com o IS quando incide.",
    example: "/api/ncm?q=cerveja&date=2027-03-10",
  },
  searchNbs: {
    summary: "Busca NBS, os códigos de serviços, por código ou por palavras.",
    example: "/api/nbs?q=ensino&date=2026-06-01",
  },
  searchClassifications: {
    summary: "Busca cClassTrib, ou lista as classificações de um CST quando vem só o cstCode.",
    example: "/api/classifications?cstCode=200&date=2027-03-10",
  },
  listSelectiveTaxClassifications: {
    summary: "Lista as classificações do Imposto Seletivo em vigor na data.",
    example: "/api/classifications/selective-tax?date=2027-03-10",
  },
  listCst: {
    summary: "Lista os CST do IBS e da CBS em vigor na data.",
    example: "/api/cst?date=2027-03-10",
  },
  searchMunicipalities: {
    summary: "Busca municípios pelo nome, com o código IBGE, se quiser dentro de uma UF.",
    example: "/api/municipalities?q=porto&uf=RS",
  },
  lookUpRates: {
    summary: "Traz as alíquotas da CBS, do IBS estadual e do IBS municipal de um lugar na data.",
    example: "/api/rates?uf=RS&municipalityCode=4314902&date=2026-06-01",
  },
  lookUpOperationIndicators: {
    summary: "Lista os itens da LC 116 e os indicadores da operação de um par NBS e cClassTrib.",
    example: "/api/operation-indicators?nbsCode=122011200&cClassTrib=200028&date=2026-03-10",
  },
  calculateOperation: {
    summary: "Calcula a CBS, o IBS e, de 2027 em diante, o IS de uma operação, item por item.",
    example: "/api/calculations",
  },
  calculateSimplesOperation: {
    summary: "Calcula a CBS e o IBS da mesma operação no Simples Nacional, de 2027 em diante.",
    example: "/api/simples-nacional-calculations",
  },
  listSimplesActivities: {
    summary: "Lista as atividades do Simples Nacional que um documento aceita na data.",
    example: "/api/simples-nacional-activities?documentType=55&date=2027-03-10",
  },
};

function listApiOperations() {
  const operations = Object.entries(OPENAPI_DOCUMENT.paths).flatMap(([path, pathItem]) =>
    Object.entries(pathItem as Record<string, DocumentOperation>).map(([method, operation]) =>
      toApiOperation({ path, method, operation }),
    ),
  );
  return operations;
}

function toApiOperation(input: { path: string; method: string; operation: DocumentOperation }) {
  const { path, method, operation } = input;
  const operationId = operation.operationId as OperationId;
  const guide = OPERATION_GUIDES[operationId];
  const tag = operation.tags[0] ?? "";
  const apiOperation: ApiOperation = {
    operationId,
    method: method.toUpperCase(),
    path,
    tag: TAG_TITLES[tag] ?? tag,
    summary: guide.summary,
    example: guide.example,
    parameters: (operation.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      isRequired: parameter.required === true,
    })),
    hasBody: operation.requestBody !== undefined,
  };
  return apiOperation;
}

function groupApiOperations() {
  const groups = new Map<string, ApiOperation[]>();

  for (const operation of listApiOperations()) {
    groups.set(operation.tag, [...(groups.get(operation.tag) ?? []), operation]);
  }

  const grouped = [...groups.entries()].map(([tag, operations]) => ({ tag, operations }));
  return grouped;
}

export type { ApiOperation, OperationId };
export {
  API_BASE_URL,
  CALCULATION_EXAMPLE,
  groupApiOperations,
  listApiOperations,
  OPERATION_GUIDES,
};
