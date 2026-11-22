// The Imposto Seletivo rules of one item, in the order ProcessamentoItemService.obterTratamentoClassificacao
// applies them after the CBS/IBS ones: the IS group's CST and classification, a typed ad rem rate
// without its unit, a document that does not take the IS (REG-032), an NCM with the IS and no
// group (REG-013) or no rate (REG-035), then the quantity and unit an ad rem rate needs.
// Rule codes and fields follow ProblemType.java; the messages are upstream's, in English.

import type { OperationItem, RuleViolation } from "./calculation.dto.ts";
import type { ItemFacts } from "./calculation.facts.ts";
import { hasResolvedRate, resolveSelectiveTaxRates } from "./selective.tax.rates.ts";

interface SelectiveTaxContext {
  item: OperationItem;
  facts: ItemFacts;
  date: string;
  documentAcronym: string | null;
}

type SelectiveTaxViolation = Omit<RuleViolation, "field"> & { field?: string };

const SELECTIVE_TAX_FROM_YEAR = 2027;
// why: SiglasDFeEnum.impostoSeletivoAplicavel admits the IS on NF-e and NFC-e only.
const SELECTIVE_TAX_DOCUMENTS = new Set(["NFE", "NFCE"]);
const ZERO_QUANTITY = /^0+(?:\.0+)?$/;

function checkSelectiveTaxRules(context: SelectiveTaxContext) {
  const violation =
    checkSelectiveTaxCodes(context) ??
    checkTypedAdRemUnit(context) ??
    checkSelectiveTaxIncidence(context) ??
    checkAdRemQuantity(context);
  return violation;
}

function checkSelectiveTaxCodes(context: SelectiveTaxContext) {
  const { item, facts, date } = context;
  const group = item.selectiveTax;

  if (!group) {
    return null;
  }

  if (!facts.selectiveTax.isCstFound) {
    const cstMissing: SelectiveTaxViolation = {
      ruleCode: "REG-004",
      field: "selectiveTax.cstCode",
      message: `CST ${group.cstCode} does not exist for the Imposto Seletivo on ${date}.`,
    };
    return cstMissing;
  }

  const { classification } = facts.selectiveTax;

  if (!classification) {
    const classificationMissing: SelectiveTaxViolation = {
      ruleCode: "REG-005",
      field: "selectiveTax.cClassTrib",
      message: `cClassTrib ${group.cClassTrib} does not exist for the Imposto Seletivo on ${date}.`,
    };
    return classificationMissing;
  }

  if (classification.cstCode !== group.cstCode) {
    const otherCst: SelectiveTaxViolation = {
      ruleCode: "REG-006",
      field: "selectiveTax.cClassTrib",
      message: `Imposto Seletivo cClassTrib ${group.cClassTrib} belongs to CST ${classification.cstCode}, not ${group.cstCode}.`,
    };
    return otherCst;
  }

  if (classification.treatment) {
    return null;
  }

  const treatmentMissing: SelectiveTaxViolation = {
    ruleCode: "REG-008",
    field: "selectiveTax.cClassTrib",
    message: `Imposto Seletivo cClassTrib ${group.cClassTrib} has no treatment on ${date}.`,
  };
  return treatmentMissing;
}

function checkTypedAdRemUnit(context: SelectiveTaxContext) {
  const group = context.item.selectiveTax;
  const hasTypedAdRem = group?.adRemRate !== undefined;

  if (!hasTypedAdRem || group?.unit) {
    return null;
  }

  const unitMissing: SelectiveTaxViolation = {
    ruleCode: "REG-023",
    field: "selectiveTax.unit",
    message: "The Imposto Seletivo unit is required when the ad rem rate is typed.",
  };
  return unitMissing;
}

function checkSelectiveTaxIncidence(context: SelectiveTaxContext) {
  const { item, facts, date, documentAcronym } = context;
  const resolved = resolveSelectiveTaxRates(item, facts.selectiveTax.rates);
  const isResolved = hasResolvedRate(resolved);
  const ncmText = `NCM ${item.ncmCode ?? ""}`;

  if (isResolved && documentAcronym && !SELECTIVE_TAX_DOCUMENTS.has(documentAcronym)) {
    const notOnDocument: SelectiveTaxViolation = {
      ruleCode: "REG-032",
      field: "selectiveTax",
      message: `Document type ${documentAcronym} does not take the Imposto Seletivo, which ${ncmText} requires.`,
    };
    return notOnDocument;
  }

  if (isResolved && !item.selectiveTax) {
    const groupMissing: SelectiveTaxViolation = {
      ruleCode: "REG-013",
      field: "selectiveTax",
      message: `The Imposto Seletivo group is required for ${ncmText} on ${date}.`,
    };
    return groupMissing;
  }

  const { adValorem, adRem } = facts.selectiveTax.rates;
  const hasIncidence = adValorem !== null || adRem !== null;
  const year = Number(date.slice(0, 4));

  if (isResolved || year < SELECTIVE_TAX_FROM_YEAR || !hasIncidence) {
    return null;
  }

  const violation: SelectiveTaxViolation = item.selectiveTax
    ? {
        ruleCode: "REG-035",
        field: "selectiveTax",
        message: `The Imposto Seletivo rate must be typed for ${ncmText} on ${date}, since no law has set it yet.`,
      }
    : {
        ruleCode: "REG-013",
        field: "selectiveTax",
        message: `The Imposto Seletivo group is required for ${ncmText} on ${date}.`,
      };
  return violation;
}

function checkAdRemQuantity(context: SelectiveTaxContext) {
  const { item, facts } = context;
  const { adRem } = resolveSelectiveTaxRates(item, facts.selectiveTax.rates);
  const group = item.selectiveTax;

  if (!adRem || !group) {
    return null;
  }

  const quantityViolation = describeQuantityViolation(group.quantity);

  if (quantityViolation) {
    return quantityViolation;
  }

  if (group.unit) {
    return null;
  }

  const unitMissing: SelectiveTaxViolation = {
    ruleCode: "REG-023",
    message: "The Imposto Seletivo unit is required for an ad rem rate.",
  };
  return unitMissing;
}

// why: upstream reports these at the item, with no field, as the golden fixture pins.
function describeQuantityViolation(quantity: string | undefined) {
  if (quantity === undefined) {
    const missing: SelectiveTaxViolation = {
      ruleCode: "REG-023",
      message: "The Imposto Seletivo quantity is required for an ad rem rate.",
    };
    return missing;
  }

  if (!ZERO_QUANTITY.test(quantity)) {
    return null;
  }

  const zero: SelectiveTaxViolation = {
    ruleCode: "REG-023",
    message: "The Imposto Seletivo quantity must be greater than zero for an ad rem rate.",
  };
  return zero;
}

export type { SelectiveTaxContext, SelectiveTaxViolation };
export { checkSelectiveTaxRules };
