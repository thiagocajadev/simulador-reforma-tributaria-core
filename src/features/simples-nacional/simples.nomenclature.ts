// The NCM and NBS rules of a Simples item: the structural check of ValidacaoNomenclaturaAdapter,
// then ValidacaoNomenclaturaService.validar against the classification's annex. The service is the
// same class in both upstreams; only the split annex list differs (NomenclaturaService).

import type { AnnexFacts } from "@/features/calculations/calculation.facts.ts";
import type { SimplesItemContext } from "./simples.validate.ts";

type Nomenclature = "NCM" | "NBS";

type NomenclatureRequirement = "NCM" | "NBS" | "EITHER" | "NONE";

// why: isOperationField marks a field outside the item, such as the NFS-e rate line.
interface ViolationInput {
  ruleCode: string;
  field?: string;
  isOperationField?: boolean;
  message: string;
}

interface NomenclatureCodes {
  ncmCode?: string;
  nbsCode?: string;
}

interface NomenclatureInput {
  context: SimplesItemContext;
  codes: NomenclatureCodes;
  reject: (input: ViolationInput) => void;
}

const FULL_CODE_LENGTH: Record<Nomenclature, number> = { NCM: 8, NBS: 9 };
const CODE_FIELD: Record<Nomenclature, "ncmCode" | "nbsCode"> = { NCM: "ncmCode", NBS: "nbsCode" };
const FULL_CODE: Record<Nomenclature, RegExp> = { NCM: /^\d{8}$/, NBS: /^\d{9}$/ };
const SERVICE_DOCUMENT = "NFS-e";
const STRICT_DOCUMENTS = new Set(["NF-e", "NFC-e", SERVICE_DOCUMENT]);
const NCM_DOCUMENTS = new Set(["NF-e", "NFC-e", SERVICE_DOCUMENT]);
const NBS_DOCUMENTS = new Set([SERVICE_DOCUMENT]);
const SPLIT_REQUIREMENT_BY_DOCUMENT: Record<string, NomenclatureRequirement> = {
  "NF-e": "NCM",
  "NFC-e": "NCM",
  [SERVICE_DOCUMENT]: "NBS",
};

// why: the Simples copy of NomenclaturaService lists only 200038, unlike the regular regime's.
const SPLIT_ANNEX_CLASSIFICATIONS = new Set(["200038"]);

const NOT_LINKED_RULE: Record<Nomenclature, string> = { NCM: "VSN-047", NBS: "VSN-048" };
const INCOMPLETE_RULE: Record<Nomenclature, string> = { NCM: "VSN-042", NBS: "VSN-043" };
const NOT_FOUND_RULE: Record<Nomenclature, string> = { NCM: "VSN-049", NBS: "VSN-050" };

// why: ValidacaoNomenclaturaAdapter.validarEstrutural; the first broken rule stops the checks.
function checkNomenclatureStructure(input: NomenclatureInput) {
  const { context, codes, reject } = input;

  if (codes.ncmCode && codes.nbsCode) {
    reject({ ruleCode: "VSN-041", field: "ncmCode", message: "Send an NCM or an NBS, not both." });
    return false;
  }

  const sentNomenclature = findSentNomenclature(codes);

  if (sentNomenclature === null) {
    return true;
  }

  const field = CODE_FIELD[sentNomenclature];
  const code = codes[field] ?? "";

  if (!FULL_CODE[sentNomenclature].test(code)) {
    reject({
      ruleCode: "VSN-051",
      field,
      message: `${sentNomenclature} must have exactly ${FULL_CODE_LENGTH[sentNomenclature]} digits.`,
    });
    return false;
  }

  const isFound = sentNomenclature === "NCM" ? context.facts.isNcmFound : context.facts.isNbsFound;

  if (!isFound) {
    reject({
      ruleCode: NOT_FOUND_RULE[sentNomenclature],
      field,
      message: `${sentNomenclature} ${code} does not exist on the operation date.`,
    });
  }

  return isFound;
}

function findSentNomenclature(codes: NomenclatureCodes): Nomenclature | null {
  if (codes.ncmCode) {
    return "NCM";
  }

  const sentNomenclature = codes.nbsCode ? "NBS" : null;
  return sentNomenclature;
}

// why: ValidacaoNomenclaturaService.validar in the PERMISSIVO mode, after the document link held.
function checkClassificationNomenclature(input: NomenclatureInput) {
  const { context, codes, reject } = input;
  const requirement = findRequirement(context);
  const violation = findNomenclatureViolation({ context, codes, requirement });

  if (violation) {
    reject(violation);
  }
}

function findRequirement(context: SimplesItemContext): NomenclatureRequirement {
  const { item, facts, document } = context;
  const { acronym } = document;

  if (SPLIT_ANNEX_CLASSIFICATIONS.has(item.cClassTrib)) {
    const splitRequirement = SPLIT_REQUIREMENT_BY_DOCUMENT[acronym] ?? "NONE";
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

function findNomenclatureViolation(input: {
  context: SimplesItemContext;
  codes: NomenclatureCodes;
  requirement: NomenclatureRequirement;
}): ViolationInput | null {
  const { context, codes, requirement } = input;

  switch (requirement) {
    case "NCM": {
      const ncmViolation =
        refuseNomenclature(context, codes.nbsCode, "NBS") ?? checkListedCode(context, codes, "NCM");
      return ncmViolation;
    }
    case "NBS": {
      const nbsViolation =
        refuseNomenclature(context, codes.ncmCode, "NCM") ?? checkListedCode(context, codes, "NBS");
      return nbsViolation;
    }
    case "EITHER": {
      const eitherViolation = checkEitherNomenclature(context, codes);
      return eitherViolation;
    }
    case "NONE": {
      const unrequiredViolation = checkUnrequiredNomenclature(context, codes);
      return unrequiredViolation;
    }
  }
}

function checkEitherNomenclature(context: SimplesItemContext, codes: NomenclatureCodes) {
  const sentNomenclature = findSentNomenclature(codes);

  if (sentNomenclature) {
    const listedViolation = checkListedCode(context, codes, sentNomenclature);
    return listedViolation;
  }

  const missing: ViolationInput = {
    ruleCode: "VSN-044",
    message: `cClassTrib ${context.item.cClassTrib} requires a full NCM or NBS on ${context.document.acronym}.`,
  };
  return missing;
}

function checkUnrequiredNomenclature(context: SimplesItemContext, codes: NomenclatureCodes) {
  const { acronym } = context.document;
  const sentNomenclature = findSentNomenclature(codes);

  if (sentNomenclature === null) {
    return null;
  }

  if (STRICT_DOCUMENTS.has(acronym)) {
    const refused =
      acronym === SERVICE_DOCUMENT
        ? refuseNomenclature(context, codes.ncmCode, "NCM")
        : refuseNomenclature(context, codes.nbsCode, "NBS");
    return refused;
  }

  const violation = checkAnnex(context, codes, sentNomenclature);
  return violation;
}

function refuseNomenclature(
  context: SimplesItemContext,
  code: string | undefined,
  nomenclature: Nomenclature,
): ViolationInput | null {
  if (!code) {
    return null;
  }

  const refused: ViolationInput = {
    ruleCode: "VSN-045",
    field: CODE_FIELD[nomenclature],
    message: `${nomenclature} is not accepted for cClassTrib ${context.item.cClassTrib} on ${context.document.acronym}.`,
  };
  return refused;
}

// why: NcmAplicavelService.validarNcmAplicavel; a classification without annex takes any code.
function checkAnnex(
  context: SimplesItemContext,
  codes: NomenclatureCodes,
  nomenclature: Nomenclature,
) {
  const code = codes[CODE_FIELD[nomenclature]];
  const annex = annexOf(context, nomenclature);
  const isComplete = code?.length === FULL_CODE_LENGTH[nomenclature];

  if (annex.hasAnnex && !isComplete) {
    const incomplete = toIncomplete(context, nomenclature);
    return incomplete;
  }

  const violation = isComplete ? criticizeCode(context, codes, nomenclature) : null;
  return violation;
}

function checkListedCode(
  context: SimplesItemContext,
  codes: NomenclatureCodes,
  nomenclature: Nomenclature,
) {
  const code = codes[CODE_FIELD[nomenclature]];

  if (code?.length !== FULL_CODE_LENGTH[nomenclature]) {
    const incomplete = toIncomplete(context, nomenclature);
    return incomplete;
  }

  const violation = criticizeCode(context, codes, nomenclature);
  return violation;
}

// why: NcmAplicavelService.criticar: not listed, or excepted with no listing free of exceptions.
function criticizeCode(
  context: SimplesItemContext,
  codes: NomenclatureCodes,
  nomenclature: Nomenclature,
): ViolationInput | null {
  const annex = annexOf(context, nomenclature);
  const isExcepted = annex.hasException && !annex.isListedWithoutException;

  if (!annex.hasAnnex || (annex.isListed && !isExcepted)) {
    return null;
  }

  const notLinked: ViolationInput = {
    ruleCode: NOT_LINKED_RULE[nomenclature],
    field: CODE_FIELD[nomenclature],
    message: `${nomenclature} ${codes[CODE_FIELD[nomenclature]]} is not linked to cClassTrib ${context.item.cClassTrib}.`,
  };
  return notLinked;
}

function toIncomplete(context: SimplesItemContext, nomenclature: Nomenclature) {
  const incomplete: ViolationInput = {
    ruleCode: INCOMPLETE_RULE[nomenclature],
    field: CODE_FIELD[nomenclature],
    message: `cClassTrib ${context.item.cClassTrib} requires a full ${FULL_CODE_LENGTH[nomenclature]}-digit ${nomenclature}.`,
  };
  return incomplete;
}

function annexOf(context: SimplesItemContext, nomenclature: Nomenclature): AnnexFacts {
  const annex = nomenclature === "NCM" ? context.facts.ncmAnnex : context.facts.nbsAnnex;
  return annex;
}

export type { NomenclatureCodes, ViolationInput };
export { checkClassificationNomenclature, checkNomenclatureStructure };
