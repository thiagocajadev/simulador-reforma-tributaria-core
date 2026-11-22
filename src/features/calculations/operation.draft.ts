// The operation form as the user fills it, and its conversion into the body of
// POST /api/calculations. Pure: the component and its hook only call these functions.

import type { ClassificationOption } from "@/features/classifications/classifications.service.ts";
import type { NcmOption } from "@/features/ncm/ncm.service.ts";
import type { SearchOption } from "@/shared/data/search.option.ts";
import { parseTypedDecimal } from "@/shared/format/decimal.brazil.ts";
import type { ValidationIssue } from "@/shared/http/envelope.ts";
import type { NominalRates, Operation, OperationItem } from "./calculation.dto.ts";
import { checkItemSelectiveTax, type SelectiveTaxDraft } from "./selective.tax.draft.ts";

type DocumentKind = "nfe" | "nfce" | "nfse";

type Nomenclature = "ncm" | "nbs";

interface DocumentKindDefinition {
  documentType: number;
  label: string;
  nomenclature: Nomenclature;
  maxItems: number;
}

// `description` is how the item reads on the result and the note (the xProd of a real one); it
// starts from the product's code table entry and the visitor may rewrite it.
// An NCM option carries whether the Imposto Seletivo applies; an NBS option does not.
type ProductOption = SearchOption & Partial<Pick<NcmOption, "selectiveTaxWindows">>;

interface ItemDraft {
  draftId: number;
  product: ProductOption | null;
  description: string;
  classification: ClassificationOption | null;
  baseAmount: string;
  selectiveTax: SelectiveTaxDraft | null;
}

type NominalRatesDraft = Record<keyof NominalRates, string>;

interface OperationDraft {
  taxEventDate: string;
  uf: string;
  municipality: SearchOption | null;
  documentKind: DocumentKind;
  operationItems: ItemDraft[];
  nominalRates: NominalRatesDraft;
}

type FieldErrors = Record<string, string>;

type DraftCheck =
  | { isValid: true; operation: Operation }
  | { isValid: false; fieldErrors: FieldErrors };

const DOCUMENT_KINDS: Record<DocumentKind, DocumentKindDefinition> = {
  nfe: { documentType: 55, label: "NF-e, venda de mercadorias", nomenclature: "ncm", maxItems: 20 },
  nfce: {
    documentType: 65,
    label: "NFC-e, venda ao consumidor",
    nomenclature: "ncm",
    maxItems: 20,
  },
  nfse: {
    documentType: 91,
    label: "NFS-e, prestação de serviço",
    nomenclature: "nbs",
    maxItems: 1,
  },
};

const UF_CODES = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
];

const NOMINAL_RATES_FROM = "2027-01-01";
// why: LC 214/2025, art. 344, fixes the IBS of 2027 and 2028 at 0,05% for the state and 0,05% for
// the municipality; the open data still carries only 2026, so the form fills them in for the visitor.
const STATUTORY_IBS = { from: "2027-01-01", until: "2028-12-31", rate: "0,05" };
const ITEM_DESCRIPTION_MAX = 120;
const AMOUNT_PLACES = 2;
const RATE_PLACES = 4;
const MAX_AMOUNT_INTEGER_DIGITS = 13;
const MAX_RATE_INTEGER_DIGITS = 3;

// why: the form asks for a date only; noon in Brasília (fixed UTC-3 since 2019) keeps that date.
const TAX_EVENT_TIME = "T12:00:00-03:00";

const NOMINAL_RATE_KEYS: (keyof NominalRates)[] = ["cbsRate", "ibsUfRate", "ibsMunRate"];
const ITEM_FIELD_PATH = /^items\[(\d+)\](?:\.(\w+))?/;
const NOMINAL_RATE_PATH = /^items\[\d+\]\.nominalRates(?:\.(\w+))?$/;
const SELECTIVE_TAX_PATH = /^items\[(\d+)\]\.selectiveTax(?:\.(\w+))?$/;

const OPERATION_FIELD_KEYS: Record<string, string> = {
  taxEventDate: "taxEventDate",
  uf: "uf",
  municipalityCode: "municipality",
  documentType: "documentKind",
};

const SELECTIVE_TAX_FIELD_KEYS: Record<string, string> = {
  adValoremRate: "adValoremRate",
  adRemRate: "adRemRate",
  quantity: "quantity",
  unit: "unit",
};

const ITEM_ERROR_KEY = /^items\.(\d+)\.(.+)$/;

const ITEM_FIELD_KEYS: Record<string, keyof ItemDraft> = {
  ncmCode: "product",
  nbsCode: "product",
  cstCode: "classification",
  cClassTrib: "classification",
  baseAmount: "baseAmount",
};

const MESSAGES = {
  dateRequired: "Informe a data do fato gerador.",
  municipalityRequired: "Escolha o município.",
  ncmRequired: "Escolha o NCM do produto.",
  nbsRequired: "Escolha o NBS do serviço.",
  classificationRequired: "Escolha a classificação tributária.",
  amountInvalid: "Informe um valor maior que zero, com até 2 casas decimais. Exemplo: 1.000,00.",
  rateInvalid: "Informe um percentual com até 4 casas decimais. Exemplo: 8,8.",
  rejectedByApi: "A API recusou este valor.",
};

function createDraft(today: string) {
  const draft: OperationDraft = applyStatutoryIbsRates({
    taxEventDate: today,
    uf: "",
    municipality: null,
    documentKind: "nfse",
    operationItems: [createItemDraft(1)],
    nominalRates: { cbsRate: "", ibsUfRate: "", ibsMunRate: "" },
  });
  return draft;
}

// why: in 2027 and 2028 only an empty field is filled, so a rate the visitor typed survives; out
// of those years a field still holding the statutory rate is emptied, so it never poses as the law.
function applyStatutoryIbsRates(draft: OperationDraft) {
  const isStatutoryYear =
    draft.taxEventDate >= STATUTORY_IBS.from && draft.taxEventDate <= STATUTORY_IBS.until;
  const [from, to] = isStatutoryYear ? ["", STATUTORY_IBS.rate] : [STATUTORY_IBS.rate, ""];
  const { ibsUfRate, ibsMunRate } = draft.nominalRates;
  const applied: OperationDraft = {
    ...draft,
    nominalRates: {
      ...draft.nominalRates,
      ibsUfRate: ibsUfRate === from ? to : ibsUfRate,
      ibsMunRate: ibsMunRate === from ? to : ibsMunRate,
    },
  };
  return applied;
}

function createItemDraft(draftId: number) {
  const itemDraft: ItemDraft = {
    draftId,
    product: null,
    description: "",
    classification: null,
    baseAmount: "",
    selectiveTax: null,
  };
  return itemDraft;
}

// why: the leaf of a code table reads alone as "Polido ou brunido"; the heading in front of it
// ("Arroz") says what the thing is. Capped at 120 characters, the xProd limit of the NF-e.
function describeProduct(product: SearchOption) {
  const heading = product.hint?.split(" › ")[0]?.replace(/\.$/, "").trim() ?? "";
  const leaf = product.label.charAt(0).toLowerCase() + product.label.slice(1);
  const joined = heading && heading !== product.label ? `${heading}, ${leaf}` : product.label;
  const description = joined.slice(0, ITEM_DESCRIPTION_MAX);
  return description;
}

// why: the simulator is about the reform in force, from 2027; 2026 stays reachable by the date.
function chooseDefaultDate(today: string) {
  const defaultDate = today < NOMINAL_RATES_FROM ? NOMINAL_RATES_FROM : today;
  return defaultDate;
}

function requiresNominalRates(taxEventDate: string) {
  const isFrom2027 = taxEventDate >= NOMINAL_RATES_FROM;
  return isFrom2027;
}

function changeUf(draft: OperationDraft, uf: string) {
  const changed: OperationDraft = { ...draft, uf, municipality: null };
  return changed;
}

// why: a nationwide search leaves the UF blank; the picked municipality's UF fills it.
function chooseMunicipality(draft: OperationDraft, municipality: SearchOption) {
  const hintedUf = municipality.hint ?? "";
  const uf = UF_CODES.includes(hintedUf) ? hintedUf : draft.uf;
  const chosen: OperationDraft = { ...draft, uf, municipality };
  return chosen;
}

// why: NCM and NBS codes do not carry over between nomenclatures, and an NFS-e has one service.
function changeDocumentKind(draft: OperationDraft, documentKind: DocumentKind) {
  const { maxItems, nomenclature } = DOCUMENT_KINDS[documentKind];
  const isSameNomenclature = DOCUMENT_KINDS[draft.documentKind].nomenclature === nomenclature;
  const keptItems = draft.operationItems.slice(0, maxItems);
  const operationItems = isSameNomenclature
    ? keptItems
    : keptItems.map((itemDraft) => ({ ...itemDraft, product: null, selectiveTax: null }));
  const changed: OperationDraft = { ...draft, documentKind, operationItems };
  return changed;
}

function addItem(draft: OperationDraft) {
  const { maxItems } = DOCUMENT_KINDS[draft.documentKind];

  if (draft.operationItems.length >= maxItems) {
    return draft;
  }

  const nextDraftId = Math.max(0, ...draft.operationItems.map((entry) => entry.draftId)) + 1;
  const changed: OperationDraft = {
    ...draft,
    operationItems: [...draft.operationItems, createItemDraft(nextDraftId)],
  };
  return changed;
}

function removeItem(draft: OperationDraft, draftId: number) {
  if (draft.operationItems.length <= 1) {
    return draft;
  }

  const operationItems = draft.operationItems.filter((entry) => entry.draftId !== draftId);
  const changed: OperationDraft = { ...draft, operationItems };
  return changed;
}

function updateItem(draft: OperationDraft, draftId: number, patch: Partial<ItemDraft>) {
  const operationItems = draft.operationItems.map((entry) =>
    entry.draftId === draftId ? { ...entry, ...patch, draftId } : entry,
  );
  const changed: OperationDraft = { ...draft, operationItems };
  return changed;
}

function checkDraft(draft: OperationDraft) {
  const fieldErrors: FieldErrors = {
    ...checkOperationFields(draft),
    ...checkNominalRates(draft),
    ...Object.assign(
      {},
      ...draft.operationItems.map((entry, index) => checkItem(draft, entry, index)),
    ),
  };

  if (Object.keys(fieldErrors).length > 0) {
    const invalid: DraftCheck = { isValid: false, fieldErrors };
    return invalid;
  }

  const valid: DraftCheck = { isValid: true, operation: toOperation(draft) };
  return valid;
}

function checkOperationFields(draft: OperationDraft) {
  const fieldErrors: FieldErrors = {};

  if (draft.taxEventDate === "") {
    fieldErrors.taxEventDate = MESSAGES.dateRequired;
  }

  if (draft.municipality === null) {
    fieldErrors.municipality = MESSAGES.municipalityRequired;
  }

  return fieldErrors;
}

function checkNominalRates(draft: OperationDraft) {
  if (!requiresNominalRates(draft.taxEventDate)) {
    return {};
  }

  const invalidKeys = NOMINAL_RATE_KEYS.filter((key) => readRate(draft.nominalRates[key]) === null);
  const fieldErrors: FieldErrors = Object.fromEntries(
    invalidKeys.map((key) => [`nominalRates.${key}`, MESSAGES.rateInvalid]),
  );
  return fieldErrors;
}

function checkItem(draft: OperationDraft, itemDraft: ItemDraft, index: number) {
  const fieldErrors: FieldErrors = {};
  const isNbs = DOCUMENT_KINDS[draft.documentKind].nomenclature === "nbs";

  if (itemDraft.product === null) {
    fieldErrors[itemFieldKey(index, "product")] = isNbs
      ? MESSAGES.nbsRequired
      : MESSAGES.ncmRequired;
  }

  if (itemDraft.classification === null) {
    fieldErrors[itemFieldKey(index, "classification")] = MESSAGES.classificationRequired;
  }

  if (readAmount(itemDraft.baseAmount) === null) {
    fieldErrors[itemFieldKey(index, "baseAmount")] = MESSAGES.amountInvalid;
  }

  const selectiveTaxErrors = checkItemSelectiveTax({ draft, itemDraft, index }).fieldErrors;
  const itemErrors: FieldErrors = { ...fieldErrors, ...selectiveTaxErrors };
  return itemErrors;
}

function toOperation(draft: OperationDraft) {
  const { documentType, nomenclature } = DOCUMENT_KINDS[draft.documentKind];
  const nominalRates = requiresNominalRates(draft.taxEventDate)
    ? toNominalRates(draft.nominalRates)
    : undefined;
  const operation: Operation = {
    taxEventDate: `${draft.taxEventDate}${TAX_EVENT_TIME}`,
    uf: draft.uf,
    municipalityCode: Number(draft.municipality?.code),
    documentType,
    items: draft.operationItems.map((itemDraft, index) =>
      toOperationItem({ draft, itemDraft, index, nomenclature, nominalRates }),
    ),
  };
  return operation;
}

function toOperationItem(input: {
  draft: OperationDraft;
  itemDraft: ItemDraft;
  index: number;
  nomenclature: Nomenclature;
  nominalRates: NominalRates | undefined;
}) {
  const { draft, itemDraft, index, nomenclature, nominalRates } = input;
  const { selectiveTax } = checkItemSelectiveTax({ draft, itemDraft, index });
  const productCode = itemDraft.product?.code ?? "";
  const productField = nomenclature === "ncm" ? { ncmCode: productCode } : { nbsCode: productCode };
  const operationItem: OperationItem = {
    itemNumber: index + 1,
    ...productField,
    cstCode: itemDraft.classification?.cstCode ?? "",
    cClassTrib: itemDraft.classification?.code ?? "",
    baseAmount: readAmount(itemDraft.baseAmount) ?? "",
    ...(nominalRates ? { nominalRates } : {}),
    ...(selectiveTax ? { selectiveTax } : {}),
  };
  return operationItem;
}

function toNominalRates(draft: NominalRatesDraft) {
  const nominalRates: NominalRates = {
    cbsRate: readRate(draft.cbsRate) ?? "",
    ibsUfRate: readRate(draft.ibsUfRate) ?? "",
    ibsMunRate: readRate(draft.ibsMunRate) ?? "",
  };
  return nominalRates;
}

function readAmount(typed: string) {
  const plain = parseTypedDecimal(typed, AMOUNT_PLACES);
  const integerDigits = plain?.split(".")[0] ?? "";
  const isUsable =
    plain !== null && integerDigits.length <= MAX_AMOUNT_INTEGER_DIGITS && /[1-9]/.test(plain);
  const amount = isUsable ? plain : null;
  return amount;
}

function readRate(typed: string) {
  const plain = parseTypedDecimal(typed, RATE_PLACES);
  const integerDigits = plain?.split(".")[0] ?? "";
  const isUsable = plain !== null && integerDigits.length <= MAX_RATE_INTEGER_DIGITS;
  const rate = isUsable ? plain : null;
  return rate;
}

function itemFieldKey(index: number, field: keyof ItemDraft) {
  const key = `items.${index}.${field}`;
  return key;
}

// why: a 400 names API paths ("items[0].ncmCode"); the form shows the error under its own field.
function toFieldErrors(issues: ValidationIssue[]) {
  const entries = issues.map((issue) => [toFieldKey(issue.field), MESSAGES.rejectedByApi]);
  const fieldErrors: FieldErrors = Object.fromEntries(entries);
  return fieldErrors;
}

function toFieldKey(apiField: string) {
  const selectiveTaxMatch = SELECTIVE_TAX_PATH.exec(apiField);

  if (selectiveTaxMatch) {
    const [, index = "0", field = ""] = selectiveTaxMatch;
    const selectiveTaxKey = `items.${index}.selectiveTax.${SELECTIVE_TAX_FIELD_KEYS[field] ?? "classification"}`;
    return selectiveTaxKey;
  }

  const nominalRateMatch = NOMINAL_RATE_PATH.exec(apiField);

  if (nominalRateMatch) {
    const nominalRateKey = `nominalRates.${nominalRateMatch[1] ?? "cbsRate"}`;
    return nominalRateKey;
  }

  const itemMatch = ITEM_FIELD_PATH.exec(apiField);

  if (itemMatch) {
    const [, index = "0", field = ""] = itemMatch;
    const itemKey = itemFieldKey(Number(index), ITEM_FIELD_KEYS[field] ?? "product");
    return itemKey;
  }

  const operationKey = OPERATION_FIELD_KEYS[apiField] ?? "form";
  return operationKey;
}

// why: "nominalRates" clears every rate, and "items.1" never clears "items.10.product".
function clearFieldErrors(errors: FieldErrors, editedKeys: string[]) {
  const isEdited = (key: string) =>
    editedKeys.some((edited) => key === edited || key.startsWith(`${edited}.`));
  const remaining: FieldErrors = Object.fromEntries(
    Object.entries(errors).filter(([key]) => !isEdited(key)),
  );
  return remaining;
}

// why: item errors are keyed by position, so the items after a removed one move up a slot.
function removeItemErrors(errors: FieldErrors, removedIndex: number) {
  const entries = Object.entries(errors).flatMap(([key, message]) => {
    const match = ITEM_ERROR_KEY.exec(key);
    const index = Number(match?.[1]);

    if (!match || index < removedIndex) {
      return [[key, message]];
    }

    const shifted = index === removedIndex ? [] : [[`items.${index - 1}.${match[2]}`, message]];
    return shifted;
  });
  const remaining: FieldErrors = Object.fromEntries(entries);
  return remaining;
}

export type { DocumentKind, FieldErrors, ItemDraft, Nomenclature, OperationDraft, ProductOption };
export {
  addItem,
  applyStatutoryIbsRates,
  changeDocumentKind,
  changeUf,
  checkDraft,
  chooseDefaultDate,
  chooseMunicipality,
  clearFieldErrors,
  createDraft,
  DOCUMENT_KINDS,
  describeProduct,
  ITEM_DESCRIPTION_MAX,
  itemFieldKey,
  removeItem,
  removeItemErrors,
  requiresNominalRates,
  toFieldErrors,
  UF_CODES,
  updateItem,
};
