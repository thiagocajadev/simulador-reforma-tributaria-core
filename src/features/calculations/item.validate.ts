// The upstream item rules, in the order ProcessamentoItemService.processarItem applies them. The
// first rule an item breaks decides its verdict, as upstream, where each rule throws. Rule codes
// and fields come from ProblemType.java; treatments the port leaves out end as notImplemented.

import type { NotImplementedReason, OperationItem, RuleViolation } from "./calculation.dto.ts";
import type {
  AnnexFacts,
  ClassificationFacts,
  CstFacts,
  DocumentTypeFacts,
  ItemFacts,
  TreatmentFacts,
} from "./calculation.facts.ts";
import { checkSelectiveTaxRules } from "./selective.tax.validate.ts";

interface ItemContext {
  position: number;
  item: OperationItem;
  facts: ItemFacts;
  date: string;
  documentType: DocumentTypeFacts | null;
}

type ItemVerdict =
  | { kind: "rejected"; violation: RuleViolation }
  | { kind: "notImplemented"; reason: NotImplementedReason };

interface CalculableItem {
  kind: "calculable";
  cst: CstFacts;
  classification: ClassificationFacts;
  treatment: TreatmentFacts;
}

type ItemAssessment = ItemVerdict | CalculableItem;

type ItemCheck = (context: ItemContext) => ItemVerdict | null;

type Nomenclature = "NCM" | "NBS";

type NomenclatureRequirement = "NCM" | "NBS" | "EITHER" | "NONE";

const NOMINAL_RATES_FROM_YEAR = 2027;
const FULL_CODE_LENGTH: Record<Nomenclature, number> = { NCM: 8, NBS: 9 };
const CODE_FIELD: Record<Nomenclature, "ncmCode" | "nbsCode"> = { NCM: "ncmCode", NBS: "nbsCode" };
const NOT_LINKED_RULE: Record<Nomenclature, string> = { NCM: "REG-011", NBS: "REG-012" };
const INCOMPLETE_RULE: Record<Nomenclature, string> = { NCM: "REG-015", NBS: "REG-016" };
const STRICT_DOCUMENTS = new Set(["NFE", "NFCE", "NFSE"]);
const NCM_DOCUMENTS = new Set(["NFE", "NFCE", "NFSE"]);
const NBS_DOCUMENTS = new Set(["NFSE"]);
const GOODS_DOCUMENTS = new Set(["NFE", "NFCE"]);
const SERVICE_DOCUMENT = "NFSE";
const SUPPORTED_RATE_TYPES = new Set([
  "Padrão",
  "Uniforme nacional (referência)",
  "Uniforme setorial",
  "Fixa",
  "Sem alíquota",
]);

// why: Anexo IX of LC 214/2025 lists NCM and NBS, but NF-e takes only NCM and NFS-e only NBS
// (NomenclaturaService.EXCEPTION_CLASSIFICACOES).
const SPLIT_ANNEX_CLASSIFICATIONS = new Set(["200038", "515001"]);

const ITEM_CHECKS: ItemCheck[] = [
  checkNomenclatureCodes,
  checkCst,
  checkNominalRates,
  checkClassification,
  checkTreatment,
  checkTaxRelief,
  checkNomenclatureAnnex,
  checkSelectiveTax,
  checkCalculationSupport,
];

function assessItem(context: ItemContext): ItemAssessment {
  for (const check of ITEM_CHECKS) {
    const verdict = check(context);

    if (verdict) {
      return verdict;
    }
  }

  const { cst, classification, treatment } = context.facts;

  if (!cst || !classification || !treatment) {
    throw new Error(`Item ${context.item.itemNumber} passed the rules without its facts`);
  }

  const calculable: CalculableItem = { kind: "calculable", cst, classification, treatment };
  return calculable;
}

function checkNomenclatureCodes(context: ItemContext) {
  const { item, facts, date } = context;

  if (item.ncmCode && item.nbsCode) {
    const both = reject(context, {
      ruleCode: "REG-001",
      message: "Send either ncmCode or nbsCode, not both.",
    });
    return both;
  }

  if (item.ncmCode && !facts.isNcmFound) {
    const ncmMissing = reject(context, {
      ruleCode: "REG-002",
      field: "ncmCode",
      message: `NCM ${item.ncmCode} is not in force on ${date}.`,
    });
    return ncmMissing;
  }

  if (item.nbsCode && !facts.isNbsFound) {
    const nbsMissing = reject(context, {
      ruleCode: "REG-003",
      field: "nbsCode",
      message: `NBS ${item.nbsCode} is not in force on ${date}.`,
    });
    return nbsMissing;
  }

  return null;
}

function checkCst(context: ItemContext) {
  const { item, facts, date } = context;

  if (facts.cst) {
    return null;
  }

  const cstMissing = reject(context, {
    ruleCode: "REG-004",
    field: "cstCode",
    message: `CST ${item.cstCode} does not exist for CBS and IBS on ${date}.`,
  });
  return cstMissing;
}

function checkNominalRates(context: ItemContext) {
  const { item, facts, date } = context;
  const year = Number(date.slice(0, 4));

  const hasTypedSelectiveTaxRate =
    item.selectiveTax?.adValoremRate !== undefined || item.selectiveTax?.adRemRate !== undefined;

  if (year < NOMINAL_RATES_FROM_YEAR && (item.nominalRates || hasTypedSelectiveTaxRate)) {
    const tooEarly = reject(context, {
      ruleCode: "REG-036",
      field: item.nominalRates ? "nominalRates" : "selectiveTax",
      message: `Nominal rates are accepted only from ${NOMINAL_RATES_FROM_YEAR}; the database holds the rates of ${year}.`,
    });
    return tooEarly;
  }

  if (year >= NOMINAL_RATES_FROM_YEAR && facts.cst?.hasTaxGroup && !item.nominalRates) {
    const missing = reject(context, {
      ruleCode: "REG-037",
      field: "nominalRates",
      message: `From ${NOMINAL_RATES_FROM_YEAR}, CST ${item.cstCode} requires nominal CBS, IBS UF and IBS Mun rates.`,
    });
    return missing;
  }

  return null;
}

function checkClassification(context: ItemContext) {
  const { item, facts, date, documentType } = context;
  const { classification } = facts;

  if (!classification) {
    const missing = reject(context, {
      ruleCode: "REG-005",
      field: "cClassTrib",
      message: `cClassTrib ${item.cClassTrib} does not exist for CBS and IBS on ${date}.`,
    });
    return missing;
  }

  const hasNomenclature = Boolean(item.ncmCode || item.nbsCode);

  if (hasNomenclature && classification.cstCode !== item.cstCode) {
    const otherCst = reject(context, {
      ruleCode: "REG-006",
      field: "cClassTrib",
      message: `cClassTrib ${item.cClassTrib} belongs to CST ${classification.cstCode}, not ${item.cstCode}.`,
    });
    return otherCst;
  }

  if (documentType && !classification.linkedDocumentTypeIds.includes(documentType.id)) {
    const notAllowed = reject(context, {
      ruleCode: "REG-029",
      field: "cClassTrib",
      message: `cClassTrib ${item.cClassTrib} is not allowed on document type ${documentType.acronym}.`,
    });
    return notAllowed;
  }

  return null;
}

function checkTreatment(context: ItemContext) {
  const { item, facts, date } = context;

  if (facts.treatment) {
    return null;
  }

  const missing = reject(context, {
    ruleCode: "REG-008",
    field: "cClassTrib",
    message: `cClassTrib ${item.cClassTrib} has no tax treatment on ${date}.`,
  });
  return missing;
}

function checkTaxRelief(context: ItemContext) {
  const verdict = context.facts.treatment?.requiresTaxRelief ? leaveOut("taxRelief") : null;
  return verdict;
}

function checkNomenclatureAnnex(context: ItemContext) {
  const { item, documentType } = context;

  if (documentType) {
    const requirement = findRequirement(context, documentType.acronym);
    const documentVerdict = checkDocumentNomenclature(context, requirement);
    return documentVerdict;
  }

  if (item.ncmCode) {
    const ncmVerdict = checkAnnex(context, "NCM");
    return ncmVerdict;
  }

  if (item.nbsCode) {
    const nbsVerdict = checkAnnex(context, "NBS");
    return nbsVerdict;
  }

  const verdict = checkAnnex(context, "NCM") ?? checkAnnex(context, "NBS");
  return verdict;
}

// why: NomenclaturaService.determinarNomenclatura, after the document type link already held.
function findRequirement(context: ItemContext, acronym: string): NomenclatureRequirement {
  const { item, facts } = context;

  if (SPLIT_ANNEX_CLASSIFICATIONS.has(item.cClassTrib)) {
    const splitRequirement = findSplitRequirement(acronym);
    return splitRequirement;
  }

  const hasNcmAnnex = NCM_DOCUMENTS.has(acronym) && facts.ncmAnnex.hasAnnex;
  const hasNbsAnnex = NBS_DOCUMENTS.has(acronym) && facts.nbsAnnex.hasAnnex;
  const requirementByAnnex: Record<string, NomenclatureRequirement> = {
    "true,true": "EITHER",
    "true,false": "NCM",
    "false,true": "NBS",
    "false,false": "NONE",
  };
  const requirement = requirementByAnnex[`${hasNcmAnnex},${hasNbsAnnex}`] ?? "NONE";
  return requirement;
}

function findSplitRequirement(acronym: string): NomenclatureRequirement {
  if (GOODS_DOCUMENTS.has(acronym)) {
    return "NCM";
  }

  const requirement = acronym === SERVICE_DOCUMENT ? "NBS" : "NONE";
  return requirement;
}

// why: ValidacaoNomenclaturaService.validar in the PERMISSIVO mode upstream fixes for now.
function checkDocumentNomenclature(context: ItemContext, requirement: NomenclatureRequirement) {
  const { item } = context;

  switch (requirement) {
    case "NCM": {
      const ncmVerdict =
        refuseNomenclature(context, item.nbsCode, "NBS") ?? checkListedCode(context, "NCM");
      return ncmVerdict;
    }
    case "NBS": {
      const nbsVerdict =
        refuseNomenclature(context, item.ncmCode, "NCM") ?? checkListedCode(context, "NBS");
      return nbsVerdict;
    }
    case "EITHER": {
      const eitherVerdict = checkEitherNomenclature(context);
      return eitherVerdict;
    }
    case "NONE": {
      const unrequiredVerdict = checkUnrequiredNomenclature(context);
      return unrequiredVerdict;
    }
  }
}

function checkEitherNomenclature(context: ItemContext) {
  const { item, documentType } = context;

  if (item.ncmCode) {
    const ncmVerdict = checkListedCode(context, "NCM");
    return ncmVerdict;
  }

  if (item.nbsCode) {
    const nbsVerdict = checkListedCode(context, "NBS");
    return nbsVerdict;
  }

  const missing = reject(context, {
    ruleCode: "REG-033",
    message: `cClassTrib ${item.cClassTrib} requires a full NCM or NBS on ${documentType?.acronym}.`,
  });
  return missing;
}

function checkUnrequiredNomenclature(context: ItemContext) {
  const { item, documentType } = context;
  const acronym = documentType?.acronym ?? "";

  if (!item.ncmCode && !item.nbsCode) {
    return null;
  }

  if (STRICT_DOCUMENTS.has(acronym)) {
    const refused =
      acronym === SERVICE_DOCUMENT
        ? refuseNomenclature(context, item.ncmCode, "NCM")
        : refuseNomenclature(context, item.nbsCode, "NBS");
    return refused;
  }

  const verdict = item.ncmCode ? checkAnnex(context, "NCM") : checkAnnex(context, "NBS");
  return verdict;
}

function refuseNomenclature(
  context: ItemContext,
  code: string | undefined,
  nomenclature: Nomenclature,
) {
  if (!code) {
    return null;
  }

  const refused = reject(context, {
    ruleCode: "REG-030",
    message: `${nomenclature} is not accepted for cClassTrib ${context.item.cClassTrib} on ${context.documentType?.acronym}.`,
  });
  return refused;
}

// why: NcmAplicavelService.validarNcmAplicavel; a classification without annex takes any code.
function checkAnnex(context: ItemContext, nomenclature: Nomenclature) {
  const code = context.item[CODE_FIELD[nomenclature]];
  const annex = annexOf(context, nomenclature);
  const isComplete = code?.length === FULL_CODE_LENGTH[nomenclature];

  if (annex.hasAnnex && !isComplete) {
    const incomplete = rejectIncomplete(context, nomenclature);
    return incomplete;
  }

  const verdict = isComplete ? criticizeCode(context, nomenclature) : null;
  return verdict;
}

function checkListedCode(context: ItemContext, nomenclature: Nomenclature) {
  const code = context.item[CODE_FIELD[nomenclature]];

  if (code?.length !== FULL_CODE_LENGTH[nomenclature]) {
    const incomplete = rejectIncomplete(context, nomenclature);
    return incomplete;
  }

  const verdict = criticizeCode(context, nomenclature);
  return verdict;
}

// why: rejects when the code is not listed, or when an exception covers it and no listing
// without exceptions does (NcmAplicavelService.criticar, truth table).
function criticizeCode(context: ItemContext, nomenclature: Nomenclature) {
  const annex = annexOf(context, nomenclature);
  const isExcepted = annex.hasException && !annex.isListedWithoutException;

  if (!annex.hasAnnex || (annex.isListed && !isExcepted)) {
    return null;
  }

  const notLinked = reject(context, {
    ruleCode: NOT_LINKED_RULE[nomenclature],
    field: CODE_FIELD[nomenclature],
    message: `${nomenclature} ${context.item[CODE_FIELD[nomenclature]]} is not linked to cClassTrib ${context.item.cClassTrib}.`,
  });
  return notLinked;
}

function rejectIncomplete(context: ItemContext, nomenclature: Nomenclature) {
  const incomplete = reject(context, {
    ruleCode: INCOMPLETE_RULE[nomenclature],
    field: CODE_FIELD[nomenclature],
    message: `cClassTrib ${context.item.cClassTrib} requires a full ${FULL_CODE_LENGTH[nomenclature]}-digit ${nomenclature}.`,
  });
  return incomplete;
}

function annexOf(context: ItemContext, nomenclature: Nomenclature): AnnexFacts {
  const annex = nomenclature === "NCM" ? context.facts.ncmAnnex : context.facts.nbsAnnex;
  return annex;
}

function checkSelectiveTax(context: ItemContext) {
  const { item, facts, date, documentType } = context;
  const violation = checkSelectiveTaxRules({
    item,
    facts,
    date,
    documentAcronym: documentType?.acronym ?? null,
  });
  const verdict = violation ? reject(context, violation) : null;
  return verdict;
}

function checkCalculationSupport(context: ItemContext) {
  const { treatment, classification } = context.facts;

  if (treatment?.hasAdjustment) {
    const adjustment = leaveOut("adjustment");
    return adjustment;
  }

  if (treatment?.isMonophasic) {
    const monophasic = leaveOut("monophasic");
    return monophasic;
  }

  if (treatment?.hasDeferral) {
    const deferral = leaveOut("deferral");
    return deferral;
  }

  const isRateTypeSupported = SUPPORTED_RATE_TYPES.has(classification?.rateType ?? "");
  const verdict = isRateTypeSupported ? null : leaveOut("combinedRates");
  return verdict;
}

function reject(
  context: ItemContext,
  input: { ruleCode: string; field?: string; message: string },
) {
  const { ruleCode, field, message } = input;
  const itemPath = `items[${context.position}]`;
  const verdict: ItemVerdict = {
    kind: "rejected",
    violation: { ruleCode, field: field ? `${itemPath}.${field}` : itemPath, message },
  };
  return verdict;
}

function leaveOut(reason: NotImplementedReason) {
  const verdict: ItemVerdict = { kind: "notImplemented", reason };
  return verdict;
}

export type { CalculableItem, ItemAssessment, ItemContext };
export { assessItem };
