// The Imposto Seletivo block of an item as the visitor fills it, and its conversion into the item's
// selectiveTax group. The block exists only where the picked NCM carries the IS on the date (the
// NCM search says so) and the operation is from 2027, when the IS starts. Pure, like operation.draft.

import type { SelectiveTaxClassificationOption } from "@/features/classifications/classifications.service.ts";
import type { SelectiveTaxIncidence } from "@/features/ncm/ncm.dto.ts";
import { deriveSelectiveTaxIncidence } from "@/features/ncm/selective.tax.incidence.ts";
import { parseTypedDecimal } from "@/shared/format/decimal.brazil.ts";
import type { SelectiveTaxInput } from "./calculation.dto.ts";
import type { FieldErrors, ItemDraft, OperationDraft } from "./operation.draft.ts";

interface SelectiveTaxDraft {
  classification: SelectiveTaxClassificationOption | null;
  adValoremRate: string;
  adRemRate: string;
  quantity: string;
  unit: string;
}

type SelectiveTaxField = keyof SelectiveTaxDraft;

type SelectiveTaxErrors = Partial<Record<SelectiveTaxField, string>>;

type SelectiveTaxCheck =
  | { isValid: true; selectiveTax: SelectiveTaxInput }
  | { isValid: false; errors: SelectiveTaxErrors };

const SELECTIVE_TAX_FROM = "2027-01-01";
const RATE_PLACES = 4;
const MAX_RATE_INTEGER_DIGITS = 3;
// why: the NF-e takes adRemIS with 3 integer digits (TDec_0302_04RTC); the API accepts more.
const MAX_AD_REM_INTEGER_DIGITS = 3;
const MAX_QUANTITY_INTEGER_DIGITS = 11;
const UNIT = /^[\p{L}\p{N}]{1,6}$/u;

// why: CST 000 with 000001, the first supply of a good, is the ordinary sale that pays the IS.
const DEFAULT_SELECTIVE_TAX_CLASSIFICATION: SelectiveTaxClassificationOption = {
  code: "000001",
  label: "Primeiro fornecimento a qualquer título de bem",
  hint: "CST 000 · com cálculo",
  cstCode: "000",
  isCalculated: true,
};

const SELECTIVE_TAX_MESSAGES = {
  classificationRequired: "Escolha a classificação do Imposto Seletivo.",
  rateRequired: "Informe a alíquota ad valorem, a ad rem ou as duas.",
  adValoremRequired: "Informe a alíquota ad valorem.",
  adValoremInvalid: "Informe um percentual com até 4 casas decimais. Exemplo: 13,5.",
  adRemInvalid: "Informe um valor em reais por unidade, com até 4 casas decimais. Exemplo: 21,30.",
  quantityInvalid: "Informe uma quantidade maior que zero, com até 4 casas decimais. Exemplo: 10.",
  unitInvalid: "Informe a unidade, com até 6 letras ou números. Exemplo: VN.",
};

function createSelectiveTaxDraft(incidence: SelectiveTaxIncidence) {
  const selectiveTaxDraft: SelectiveTaxDraft = {
    classification: DEFAULT_SELECTIVE_TAX_CLASSIFICATION,
    adValoremRate: "",
    adRemRate: "",
    quantity: "",
    unit: incidence.adRemUnit?.code ?? "",
  };
  return selectiveTaxDraft;
}

function isSelectiveTaxDate(taxEventDate: string) {
  const isFrom2027 = taxEventDate >= SELECTIVE_TAX_FROM;
  return isFrom2027;
}

function checkSelectiveTaxDraft(draft: SelectiveTaxDraft, incidence: SelectiveTaxIncidence) {
  const errors: SelectiveTaxErrors = {};
  const hasAdRem = incidence.adRemUnit !== null;
  const adValoremRate = readOptional(draft.adValoremRate, MAX_RATE_INTEGER_DIGITS);
  const adRemRate = hasAdRem ? readOptional(draft.adRemRate, MAX_AD_REM_INTEGER_DIGITS) : undefined;

  if (draft.classification === null) {
    errors.classification = SELECTIVE_TAX_MESSAGES.classificationRequired;
  }

  if (adValoremRate === null) {
    errors.adValoremRate = SELECTIVE_TAX_MESSAGES.adValoremInvalid;
  }

  if (adRemRate === null) {
    errors.adRemRate = SELECTIVE_TAX_MESSAGES.adRemInvalid;
  }

  if (adValoremRate === undefined && adRemRate === undefined && !hasOfficialRate(incidence)) {
    const requiredKey = incidence.hasAdValorem ? "adValoremRate" : "adRemRate";
    errors[requiredKey] = hasAdRem
      ? SELECTIVE_TAX_MESSAGES.rateRequired
      : SELECTIVE_TAX_MESSAGES.adValoremRequired;
  }

  // why: an official ad rem rate the visitor leaves blank still multiplies a quantity (REG-023).
  const appliesAdRem =
    typeof adRemRate === "string" ||
    (adRemRate === undefined && hasAdRem && incidence.officialRates.adRem !== null);
  const adRemFields = appliesAdRem ? readAdRemFields(draft, errors) : {};
  const check = toCheck({ draft, errors, adValoremRate, adRemRate, adRemFields });
  return check;
}

// why: once the open data holds a rate, a blank field takes it, as the engine resolves it.
function hasOfficialRate(incidence: SelectiveTaxIncidence) {
  const { officialRates, adRemUnit } = incidence;
  const hasRate =
    officialRates.adValorem !== null || (adRemUnit !== null && officialRates.adRem !== null);
  return hasRate;
}

function readAdRemFields(draft: SelectiveTaxDraft, errors: SelectiveTaxErrors) {
  const quantity = readQuantity(draft.quantity);
  const unit = draft.unit.trim().toUpperCase();

  if (quantity === null) {
    errors.quantity = SELECTIVE_TAX_MESSAGES.quantityInvalid;
  }

  if (!UNIT.test(unit)) {
    errors.unit = SELECTIVE_TAX_MESSAGES.unitInvalid;
  }

  const fields = { quantity: quantity ?? undefined, unit };
  return fields;
}

function toCheck(input: {
  draft: SelectiveTaxDraft;
  errors: SelectiveTaxErrors;
  adValoremRate: string | null | undefined;
  adRemRate: string | null | undefined;
  adRemFields: { quantity?: string; unit?: string };
}) {
  const { draft, errors, adValoremRate, adRemRate, adRemFields } = input;

  if (Object.keys(errors).length > 0 || draft.classification === null) {
    const invalid: SelectiveTaxCheck = { isValid: false, errors };
    return invalid;
  }

  const selectiveTax: SelectiveTaxInput = {
    cstCode: draft.classification.cstCode,
    cClassTrib: draft.classification.code,
    ...(adValoremRate ? { adValoremRate } : {}),
    ...(adRemRate ? { adRemRate } : {}),
    ...adRemFields,
  };
  const valid: SelectiveTaxCheck = { isValid: true, selectiveTax };
  return valid;
}

// why: a blank field is a rate left out (undefined); a typed one that cannot be read is null.
function readOptional(typed: string, maxIntegerDigits: number) {
  if (typed.trim() === "") {
    return undefined;
  }

  const plain = parseTypedDecimal(typed, RATE_PLACES);
  const integerDigits = plain?.split(".")[0] ?? "";
  const rate = plain !== null && integerDigits.length <= maxIntegerDigits ? plain : null;
  return rate;
}

function readQuantity(typed: string) {
  const plain = parseTypedDecimal(typed, RATE_PLACES);
  const integerDigits = plain?.split(".")[0] ?? "";
  const isUsable =
    plain !== null && integerDigits.length <= MAX_QUANTITY_INTEGER_DIGITS && /[1-9]/.test(plain);
  const quantity = isUsable ? plain : null;
  return quantity;
}

// why: NCM documents only (the NFS-e has no IS), from 2027, where the NCM carries it on the date.
function findSelectiveTaxIncidence(draft: OperationDraft, itemDraft: ItemDraft) {
  const isNcmDocument = draft.documentKind !== "nfse";
  const windows = itemDraft.product?.selectiveTaxWindows ?? [];
  const incidence =
    isNcmDocument && isSelectiveTaxDate(draft.taxEventDate)
      ? deriveSelectiveTaxIncidence(windows, draft.taxEventDate)
      : null;
  return incidence;
}

function checkItemSelectiveTax(input: {
  draft: OperationDraft;
  itemDraft: ItemDraft;
  index: number;
}) {
  const { draft, itemDraft, index } = input;
  const incidence = findSelectiveTaxIncidence(draft, itemDraft);

  if (!incidence) {
    const notNeeded = { selectiveTax: undefined, fieldErrors: {} as FieldErrors };
    return notNeeded;
  }

  const check = checkSelectiveTaxDraft(
    itemDraft.selectiveTax ?? createSelectiveTaxDraft(incidence),
    incidence,
  );
  const fieldErrors: FieldErrors = check.isValid
    ? {}
    : Object.fromEntries(
        Object.entries(check.errors).map(([field, message]) => [
          selectiveTaxFieldKey(index, field as SelectiveTaxField),
          message,
        ]),
      );
  const checked = { selectiveTax: check.isValid ? check.selectiveTax : undefined, fieldErrors };
  return checked;
}

function selectiveTaxFieldKey(index: number, field: SelectiveTaxField) {
  const key = `items.${index}.selectiveTax.${field}`;
  return key;
}

export type { SelectiveTaxDraft, SelectiveTaxErrors, SelectiveTaxField };
export {
  checkItemSelectiveTax,
  checkSelectiveTaxDraft,
  createSelectiveTaxDraft,
  DEFAULT_SELECTIVE_TAX_CLASSIFICATION,
  findSelectiveTaxIncidence,
  isSelectiveTaxDate,
  selectiveTaxFieldKey,
};
