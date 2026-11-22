// The NFS-e part of the Simples Nacional form, and its conversion into the NFS-e body of
// POST /api/simples-nacional-calculations: the provider's option and assessment regimes, the
// company's rates in the annex of the chosen activity, and the ISS facts of the one service.
// Field meanings: docs/simples-nacional.md, NFS-e path; docs/glossary.md.

import type { Operation } from "@/features/calculations/calculation.dto.ts";
import type { FieldErrors } from "@/features/calculations/operation.draft.ts";
import type { SimplesActivity } from "@/features/simples-activities/simples-activities.dto.ts";
import type {
  NfseSimplesOperation,
  SimplesAnnexRates,
  SimplesEffectiveRates,
} from "./simples.dto.ts";
import { findRateError, readRate } from "./simples.rate.read.ts";

type SimplesOption = "3" | "4";

type IbsCbsAssessmentRegime = "1" | "2";

type SimplesTaxesAssessmentRegime = "1" | "2" | "3";

type AnnexKey = "annexI" | "annexII" | "annexIII" | "annexIV" | "annexV";

interface NfseSimplesFields {
  simplesOption: SimplesOption;
  ibsCbsAssessmentRegime: IbsCbsAssessmentRegime;
  simplesTaxesAssessmentRegime: SimplesTaxesAssessmentRegime;
  isFatorRAtLeast28: boolean;
  cbsRateWithoutIss: string;
  ibsRateWithoutIss: string;
  issTaxation: string;
  issWithholding: string;
  municipalBenefit: string;
}

interface NfseDraftInput {
  fields: NfseSimplesFields;
  activity: SimplesActivity | null;
  cbsRate: string | null;
  ibsRate: string | null;
}

const NFSE_DOCUMENT_TYPE = 91;
const TAXABLE_ISS = "1";
const ANNEXES_WITH_ISS = new Set<AnnexKey>(["annexIII", "annexIV", "annexV"]);
const ANNEX_KEYS: Record<string, AnnexKey> = {
  I: "annexI",
  II: "annexII",
  III: "annexIII",
  IV: "annexIV",
  V: "annexV",
};

const NFSE_FIELD_KEYS = {
  cbsRateWithoutIss: "simples.cbsRateWithoutIss",
  ibsRateWithoutIss: "simples.ibsRateWithoutIss",
} as const;

const SIMPLES_OPTION_LABELS: Record<SimplesOption, string> = {
  "3": "Optante pelo Simples Nacional (ME ou EPP)",
  "4": "Opção pelo Simples pendente",
};

const IBS_CBS_REGIME_LABELS: Record<IbsCbsAssessmentRegime, string> = {
  "1": "IBS e CBS pelo Simples Nacional",
  "2": "Sublimite excedido: só a CBS pelo Simples",
};

const TAXES_REGIME_LABELS: Record<SimplesTaxesAssessmentRegime, string> = {
  "1": "Tributos federais e ISS pelo Simples",
  "2": "Tributos federais pelo Simples, ISS fora dele",
  "3": "Tributos federais e ISS fora do Simples",
};

const ISS_TAXATION_LABELS: Record<string, string> = {
  "1": "Operação tributável",
  "2": "Imunidade",
  "3": "Exportação de serviço",
  "4": "Não incidência",
};

const ISS_WITHHOLDING_LABELS: Record<string, string> = {
  "1": "Não retido",
  "2": "Retido pelo tomador",
  "3": "Retido pelo intermediário",
};

const MUNICIPAL_BENEFIT_LABELS: Record<string, string> = {
  "1": "Isenção",
  "2": "Redução da base em percentual",
  "3": "Redução da base em reais",
  "4": "Alíquota diferenciada",
};

function createNfseSimplesFields() {
  const fields: NfseSimplesFields = {
    simplesOption: "3",
    ibsCbsAssessmentRegime: "1",
    simplesTaxesAssessmentRegime: "1",
    isFatorRAtLeast28: false,
    cbsRateWithoutIss: "",
    ibsRateWithoutIss: "",
    issTaxation: TAXABLE_ISS,
    issWithholding: "1",
    municipalBenefit: "",
  };
  return fields;
}

function isNfseDocument(documentType: number) {
  const isNfse = documentType === NFSE_DOCUMENT_TYPE;
  return isNfse;
}

// why: with the sublimit exceeded the IBS leaves the Simples, so only the CBS rate is asked.
function needsNfseIbsRate(fields: NfseSimplesFields) {
  const isNeeded = fields.ibsCbsAssessmentRegime !== "2";
  return isNeeded;
}

// why: an activity subject to the Fator R moves to annexWithFatorR when the Fator R reaches 28%.
function resolveAnnexKey(activity: SimplesActivity | null, isFatorRAtLeast28: boolean) {
  const usesFatorRAnnex = isFatorRAtLeast28 && activity?.annexWithFatorR;
  const annex = usesFatorRAnnex ? activity?.annexWithFatorR : activity?.annexWithoutFatorR;
  const annexKey = ANNEX_KEYS[annex ?? ""] ?? null;
  return annexKey;
}

function describeNfseFields(activity: SimplesActivity | null, fields: NfseSimplesFields) {
  const annexKey = resolveAnnexKey(activity, fields.isFatorRAtLeast28);
  const hasIss = activity?.hasIssInSimples ?? false;
  const shownFields = {
    needsFatorR: Boolean(activity?.annexWithFatorR),
    needsPairWithoutIss: annexKey !== null && ANNEXES_WITH_ISS.has(annexKey),
    needsIssTaxation: hasIss,
    needsIssWithholding: hasIss && fields.issTaxation === TAXABLE_ISS,
    needsMunicipalBenefit: activity?.allowsMunicipalBenefit ?? false,
  };
  return shownFields;
}

// why: a pair typed on another activity and now hidden must not block the submit.
function findNfseFieldErrors(fields: NfseSimplesFields, isPairWithoutIssShown: boolean) {
  const fieldErrors: FieldErrors = {};
  const typedWithoutIss = [fields.cbsRateWithoutIss, fields.ibsRateWithoutIss];
  const isPairBlank = typedWithoutIss.every((typed) => typed.trim() === "");

  if (!isPairWithoutIssShown || isPairBlank) {
    return fieldErrors;
  }

  const cbsError = findRateError(fields.cbsRateWithoutIss);
  const ibsError = needsNfseIbsRate(fields) ? findRateError(fields.ibsRateWithoutIss) : null;

  if (cbsError) {
    fieldErrors[NFSE_FIELD_KEYS.cbsRateWithoutIss] = cbsError;
  }

  if (ibsError) {
    fieldErrors[NFSE_FIELD_KEYS.ibsRateWithoutIss] = ibsError;
  }

  return fieldErrors;
}

function toNfseSimplesOperation(operation: Operation, date: string, input: NfseDraftInput) {
  const { fields, activity } = input;
  const shownFields = describeNfseFields(activity, fields);
  const nfseOperation: NfseSimplesOperation = {
    taxEventDate: date,
    documentType: NFSE_DOCUMENT_TYPE,
    simplesOption: Number(fields.simplesOption),
    ibsCbsAssessmentRegime: Number(fields.ibsCbsAssessmentRegime),
    simplesTaxesAssessmentRegime: Number(fields.simplesTaxesAssessmentRegime),
    effectiveRates: toEffectiveRates(input, shownFields.needsPairWithoutIss),
    items: operation.items.map((operationItem) => ({
      itemNumber: operationItem.itemNumber,
      activityCode: activity?.activityCode ?? "",
      cClassTrib: operationItem.cClassTrib,
      nbsCode: operationItem.nbsCode,
      baseAmount: operationItem.baseAmount,
      issTaxation: shownFields.needsIssTaxation ? Number(fields.issTaxation) : undefined,
      issWithholding: shownFields.needsIssWithholding ? Number(fields.issWithholding) : undefined,
      municipalBenefit:
        shownFields.needsMunicipalBenefit && fields.municipalBenefit !== ""
          ? Number(fields.municipalBenefit)
          : undefined,
    })),
  };
  return nfseOperation;
}

function toEffectiveRates(input: NfseDraftInput, needsPairWithoutIss: boolean) {
  const { fields, activity, cbsRate, ibsRate } = input;
  const annexKey = resolveAnnexKey(activity, fields.isFatorRAtLeast28);
  const isIbsNeeded = needsNfseIbsRate(fields);
  const cbsRateWithoutIss = readRate(fields.cbsRateWithoutIss);
  const annexRates: SimplesAnnexRates = {
    cbsSimplesRate: cbsRate ?? undefined,
    ibsSimplesRate: isIbsNeeded ? (ibsRate ?? undefined) : undefined,
    withoutIssRedistribution:
      needsPairWithoutIss && cbsRateWithoutIss !== null
        ? {
            cbsSimplesRate: cbsRateWithoutIss,
            ibsSimplesRate: isIbsNeeded
              ? (readRate(fields.ibsRateWithoutIss) ?? undefined)
              : undefined,
          }
        : undefined,
  };
  const baseRates: SimplesEffectiveRates = {
    isFatorRAtLeast28: fields.isFatorRAtLeast28,
    isSublimitExceeded: !isIbsNeeded,
  };
  const effectiveRates: SimplesEffectiveRates = annexKey
    ? { ...baseRates, [annexKey]: annexRates }
    : baseRates;
  return effectiveRates;
}

export type {
  IbsCbsAssessmentRegime,
  NfseSimplesFields,
  SimplesOption,
  SimplesTaxesAssessmentRegime,
};
export {
  createNfseSimplesFields,
  describeNfseFields,
  findNfseFieldErrors,
  IBS_CBS_REGIME_LABELS,
  ISS_TAXATION_LABELS,
  ISS_WITHHOLDING_LABELS,
  isNfseDocument,
  MUNICIPAL_BENEFIT_LABELS,
  NFSE_FIELD_KEYS,
  needsNfseIbsRate,
  SIMPLES_OPTION_LABELS,
  TAXES_REGIME_LABELS,
  toNfseSimplesOperation,
};
