// What the open data says about one item on the operation date: the facts the rules and the
// calculation read. The repository gathers them; validation and calculation never touch D1.

import type { TaxName } from "@/features/rates/rates.dto.ts";
import type { LegalGround } from "./calculation.dto.ts";

interface CstFacts {
  hasTaxGroup: boolean;
}

// why: the reduction group follows the classification's own CST, not the one the item sends
// (ClassificacaoTributariaRepository.buscarClassificacaoTributariaCalculo).
interface ClassificationFacts {
  cstCode: string;
  hasReductionGroup: boolean;
  rateType: string;
  linkedDocumentTypeIds: number[];
}

interface TreatmentFormulas {
  rate: string | null;
  effectiveRate: string | null;
  base: string;
  calculatedTax: string;
  taxDue: string | null;
}

interface TreatmentFacts {
  description: string;
  formulas: TreatmentFormulas;
  hasReduction: boolean;
  hasAdjustment: boolean;
  hasDeferral: boolean;
  isMonophasic: boolean;
  requiresTaxRelief: boolean;
}

// why: NCM_APLICAVEL and NBS_APLICAVEL list codes by prefix, with exceptions per listed code.
interface AnnexFacts {
  hasAnnex: boolean;
  isListed: boolean;
  hasException: boolean;
  isListedWithoutException: boolean;
}

type TaxPercents = Record<TaxName, string | null>;

interface SelectiveTaxTreatmentFacts {
  description: string;
  formulas: Pick<TreatmentFormulas, "base" | "calculatedTax" | "taxDue">;
}

// why: an IS classification is looked up under tribute 1, so its CST is the IS one.
interface SelectiveTaxClassificationFacts {
  cstCode: string;
  treatment: SelectiveTaxTreatmentFacts | null;
}

// A rate row of the NCM: null when none applies; a row with a null value still means the IS applies.
interface SelectiveTaxRatesFacts {
  adValorem: { percent: string | null } | null;
  adRem: { amount: string | null; unit: string } | null;
}

interface SelectiveTaxFacts {
  isCstFound: boolean;
  classification: SelectiveTaxClassificationFacts | null;
  rates: SelectiveTaxRatesFacts;
}

interface ItemFacts {
  isNcmFound: boolean;
  isNbsFound: boolean;
  cst: CstFacts | null;
  classification: ClassificationFacts | null;
  treatment: TreatmentFacts | null;
  reductionPercents: TaxPercents;
  classificationRates: TaxPercents;
  ncmAnnex: AnnexFacts;
  nbsAnnex: AnnexFacts;
  selectiveTax: SelectiveTaxFacts;
  legalGround: LegalGround | null;
}

interface DocumentTypeFacts {
  id: number;
  acronym: string;
  allowsZeroNcm: boolean;
  isSupported: boolean;
}

export type {
  AnnexFacts,
  ClassificationFacts,
  CstFacts,
  DocumentTypeFacts,
  ItemFacts,
  SelectiveTaxClassificationFacts,
  SelectiveTaxFacts,
  SelectiveTaxRatesFacts,
  SelectiveTaxTreatmentFacts,
  TaxPercents,
  TreatmentFacts,
  TreatmentFormulas,
};
