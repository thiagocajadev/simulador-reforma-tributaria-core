// What the open data says about one Simples operation and its items on the operation date. The
// repository gathers them; validation and calculation never touch D1.

import type { AnnexFacts } from "@/features/calculations/calculation.facts.ts";

type ValueDestination = "DEVIDO" | "PENDENTE_SUSPENSO" | "ZERO";

// why: TDCS_VOCABULARIO_REGIME says which regime fields a document speaks: CRT or the NFS-e ones.
type RegimeVocabulary = "CRT" | "NFSE";

type RatePairRule =
  | "ISS_FORA_DO_SIMPLES"
  | "ATIVIDADE_SEM_ISS"
  | "ISS_NAO_INCIDE"
  | "ISENCAO_MUNICIPAL"
  | "ISS_RETIDO";

type RatePairType = "SEM_REDISTRIBUICAO" | "COM_REDISTRIBUICAO";

// why: the NFS-e facts SITUACAO_ISS_PAR_ALIQUOTA_SIMPLES_NACIONAL matches, by request field name.
type IssSituationField =
  | "crt"
  | "ibsCbsAssessmentRegime"
  | "simplesTaxesAssessmentRegime"
  | "issTaxation"
  | "issWithholding"
  | "municipalBenefit";

// why: TIPO_DFE_CALCULO_SIMPLES_NACIONAL gives the NFS-e its own rate places, item cap and no IS.
interface SimplesDocumentFacts {
  acronym: string;
  allowsZeroNcm: boolean;
  hasCalculatorTreatment: boolean;
  isEnabled: boolean;
  regimeVocabulary: RegimeVocabulary | null;
  rateDecimalPlaces: number | null;
  maxItems: number | null;
  allowsSelectiveTax: boolean;
}

// why: REGIME_APURACAO_SIMPLES_NACIONAL decides which taxes exist and where each value goes.
interface SimplesRegimeFacts {
  vocabulary: RegimeVocabulary;
  hasTaxCalculation: boolean;
  hasIbs: boolean;
  dueDestination: ValueDestination;
  pendingDestination: ValueDestination;
}

interface RevenueTypeFacts {
  code: number;
  description: string;
  isRevenue: boolean;
  isSelectiveTaxRevenue: boolean;
  revenueFactor: string;
  isPending: boolean;
  needsRates: boolean;
  isNonTaxableActivityRefused: boolean;
}

interface IssSituationFacts {
  field: IssSituationField;
  value: number;
  rule: RatePairRule;
  pairType: RatePairType;
}

interface SimplesOperationFacts {
  document: SimplesDocumentFacts | null;
  regime: SimplesRegimeFacts | null;
  governmentPurchaseFactor: string | null;
  revenueTypes: Map<number, RevenueTypeFacts>;
  nfseRevenueTypes: Map<number, RevenueTypeFacts>;
  issSituations: IssSituationFacts[];
  dataVersion: string;
}

interface SimplesClassificationFacts {
  revenueTypeCode: number;
  isAllowedOnDocument: boolean;
}

// why: an annex is a roman numeral (I to V); activity 09 has two, picked by the Fator R.
interface SimplesActivityFacts {
  code: string;
  isNonTaxable: boolean;
  isAllowedOnDocument: boolean;
  annexWithoutFatorR: string | null;
  annexWithFatorR: string | null;
  hasIssInSimples: boolean;
  allowsMunicipalBenefit: boolean;
}

interface SimplesItemFacts {
  hasAdjustment: boolean;
  isNcmFound: boolean;
  isNbsFound: boolean;
  classification: SimplesClassificationFacts | null;
  activity: SimplesActivityFacts | null;
  ncmAnnex: AnnexFacts;
  nbsAnnex: AnnexFacts;
}

export type {
  IssSituationFacts,
  IssSituationField,
  RatePairRule,
  RatePairType,
  RegimeVocabulary,
  RevenueTypeFacts,
  SimplesActivityFacts,
  SimplesClassificationFacts,
  SimplesDocumentFacts,
  SimplesItemFacts,
  SimplesOperationFacts,
  SimplesRegimeFacts,
  ValueDestination,
};
