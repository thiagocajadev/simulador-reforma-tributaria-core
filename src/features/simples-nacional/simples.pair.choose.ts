// Picks the rate pair of an NFS-e item from the company's effective rate line, as
// EscolhaParAliquotasService does: the pair without the ISS redistribution when the ISS stays out
// of the Simples calculation for that operation (Solução de Consulta Cosit 298/2019), otherwise the
// pair with it. Pure: the line, the activity and the ISS situations arrive ready.

import type { Decimal } from "@/shared/math/decimal.ts";
import type { SimplesOperationItem } from "./simples.dto.ts";
import type {
  IssSituationFacts,
  IssSituationField,
  RatePairRule,
  SimplesActivityFacts,
} from "./simples.facts.ts";
import type { ViolationInput } from "./simples.nomenclature.ts";

type Annex = "I" | "II" | "III" | "IV" | "V";

interface RatePairValues {
  cbsRate: Decimal | null;
  ibsRate: Decimal | null;
}

interface AnnexRateValues {
  pair: RatePairValues;
  withoutIssRedistribution: RatePairValues | null;
}

// The effective rate line read from the request, in percentage points with every place sent.
interface EffectiveRateLine {
  isFatorRAtLeast28: boolean | null;
  isSublimitExceeded: boolean;
  annexes: Partial<Record<Annex, AnnexRateValues>>;
}

type PairFacts = Partial<Record<IssSituationField, number>>;

// why: path is where the pair sits in effectiveRates, for the pointer of a missing rate.
type RatePairChoice =
  | { kind: "notAllowed" }
  | { kind: "fatorRMissing" }
  | { kind: "zero" }
  | {
      kind: "chosen";
      annex: Annex;
      rule: RatePairRule | "ANEXO_SEM_ISS" | "PADRAO";
      pair: RatePairValues | null;
      path: string;
    };

interface PairRule {
  rule: RatePairRule | "PADRAO";
  isWithoutRedistribution: boolean;
}

interface IssFieldsInput {
  item: SimplesOperationItem;
  activity: SimplesActivityFacts;
  reject: (input: ViolationInput) => void;
}

interface PairChoiceInput {
  activity: SimplesActivityFacts;
  rateLine: EffectiveRateLine;
  facts: PairFacts;
  situations: IssSituationFacts[];
}

const ISS_TAXATION_CODES = new Set([1, 2, 3, 4]);
const ISS_WITHHOLDING_CODES = new Set([1, 2, 3]);
const MUNICIPAL_BENEFIT_CODES = new Set([1, 2, 3, 4]);
const TAXABLE_OPERATION = 1;
const ISS_ANNEXES = new Set<Annex>(["III", "IV", "V"]);
const ISS_SITUATION_RULES: RatePairRule[] = ["ISS_NAO_INCIDE", "ISENCAO_MUNICIPAL", "ISS_RETIDO"];
const WITHOUT_REDISTRIBUTION = "SEM_REDISTRIBUICAO";
const WITHOUT_REDISTRIBUTION_PATH = "withoutIssRedistribution";
const DEFAULT_PAIR_RULE: PairRule = { rule: "PADRAO", isWithoutRedistribution: false };
const SUBLIMIT_PAIR_RULE: PairRule = { rule: "ISS_FORA_DO_SIMPLES", isWithoutRedistribution: true };
const NO_ISS_ACTIVITY_PAIR_RULE: PairRule = {
  rule: "ATIVIDADE_SEM_ISS",
  isWithoutRedistribution: true,
};

// why: avaliarCamposIss; a code the item does not use is dropped (a warning upstream), not refused.
function assessIssFields(input: IssFieldsInput) {
  const { item, activity, reject } = input;
  const issTaxation = readIssTaxation(input);
  const isWithholdingDropped =
    item.issWithholding !== undefined && issTaxation !== null && issTaxation !== TAXABLE_OPERATION;
  const issWithholding = isWithholdingDropped ? null : readIssWithholding(input, issTaxation);
  const isBenefitDropped = item.municipalBenefit !== undefined && !activity.allowsMunicipalBenefit;
  const municipalBenefit = isBenefitDropped
    ? null
    : readCode(item.municipalBenefit, MUNICIPAL_BENEFIT_CODES);

  if (!isBenefitDropped && item.municipalBenefit !== undefined && municipalBenefit === null) {
    reject({
      ruleCode: "VSN-038",
      field: "municipalBenefit",
      message: `Must be 1, 2, 3 or 4, got ${item.municipalBenefit}.`,
    });
  }

  const facts: PairFacts = withPresent({ issTaxation, issWithholding, municipalBenefit });
  return facts;
}

function readIssTaxation(input: IssFieldsInput) {
  const { item, activity, reject } = input;
  const issTaxation = readCode(item.issTaxation, ISS_TAXATION_CODES);

  if (item.issTaxation !== undefined && issTaxation === null) {
    reject({
      ruleCode: "VSN-036",
      field: "issTaxation",
      message: `Must be 1, 2, 3 or 4, got ${item.issTaxation}.`,
    });
  }

  if (item.issTaxation === undefined && activity.hasIssInSimples) {
    reject({
      ruleCode: "VSN-036",
      field: "issTaxation",
      message: `Required for activity ${activity.code}, which has the ISS in the Simples.`,
    });
  }

  return issTaxation;
}

function readIssWithholding(input: IssFieldsInput, issTaxation: number | null) {
  const { item, activity, reject } = input;

  if (item.issWithholding !== undefined) {
    const issWithholding = readCode(item.issWithholding, ISS_WITHHOLDING_CODES);

    if (issWithholding === null) {
      reject({
        ruleCode: "VSN-037",
        field: "issWithholding",
        message: `Must be 1, 2 or 3, got ${item.issWithholding}.`,
      });
    }

    return issWithholding;
  }

  if (activity.hasIssInSimples && issTaxation === TAXABLE_OPERATION) {
    reject({
      ruleCode: "VSN-037",
      field: "issWithholding",
      message: `Required with issTaxation 1 for activity ${activity.code}, which has the ISS in the Simples.`,
    });
  }

  return null;
}

function readCode(value: number | undefined, allowed: Set<number>) {
  const code = value !== undefined && allowed.has(value) ? value : null;
  return code;
}

function withPresent(values: Record<string, number | null>) {
  const present: PairFacts = Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null),
  );
  return present;
}

// why: escolher; the first rule that applies decides, in the order of RegraAliquotaSimplesEnum.
function chooseRatePair(input: PairChoiceInput): RatePairChoice {
  const { activity, rateLine } = input;

  if (!activity.isAllowedOnDocument) {
    const notAllowed: RatePairChoice = { kind: "notAllowed" };
    return notAllowed;
  }

  if (activity.annexWithFatorR === null && activity.annexWithoutFatorR === null) {
    const zero: RatePairChoice = { kind: "zero" };
    return zero;
  }

  if (activity.annexWithFatorR !== null && rateLine.isFatorRAtLeast28 === null) {
    const fatorRMissing: RatePairChoice = { kind: "fatorRMissing" };
    return fatorRMissing;
  }

  const annex = (
    rateLine.isFatorRAtLeast28 && activity.annexWithFatorR !== null
      ? activity.annexWithFatorR
      : activity.annexWithoutFatorR
  ) as Annex;
  const choice = choosePairOfAnnex(input, annex);
  return choice;
}

function choosePairOfAnnex(input: PairChoiceInput, annex: Annex): RatePairChoice {
  const annexRates = input.rateLine.annexes[annex];
  const annexPath = `annex${annex}`;
  const pair = annexRates?.pair ?? null;

  if (!ISS_ANNEXES.has(annex)) {
    const singlePair: RatePairChoice = {
      kind: "chosen",
      annex,
      rule: "ANEXO_SEM_ISS",
      pair,
      path: annexPath,
    };
    return singlePair;
  }

  const { rule, isWithoutRedistribution } = findPairRule(input);
  const withoutPair = annexRates?.withoutIssRedistribution ?? null;

  if (!isWithoutRedistribution || withoutPair === null) {
    const withPair: RatePairChoice = { kind: "chosen", annex, rule, pair, path: annexPath };
    return withPair;
  }

  const chosen: RatePairChoice = {
    kind: "chosen",
    annex,
    rule,
    pair: withoutPair,
    path: `${annexPath}.${WITHOUT_REDISTRIBUTION_PATH}`,
  };
  return chosen;
}

// why: the sublimit impediment comes from the rate line; every other rule from the ISS situations.
function findPairRule(input: PairChoiceInput): PairRule {
  const { activity, rateLine } = input;

  if (rateLine.isSublimitExceeded) {
    return SUBLIMIT_PAIR_RULE;
  }

  const outsideSimples = findSituation(input, "ISS_FORA_DO_SIMPLES");

  if (outsideSimples) {
    const outsideRule = toPairRule(outsideSimples);
    return outsideRule;
  }

  if (!activity.hasIssInSimples) {
    return NO_ISS_ACTIVITY_PAIR_RULE;
  }

  const situation = ISS_SITUATION_RULES.map((rule) => findSituation(input, rule)).find(
    (candidate) => candidate !== undefined,
  );
  const pairRule = situation ? toPairRule(situation) : DEFAULT_PAIR_RULE;
  return pairRule;
}

function findSituation(input: PairChoiceInput, rule: RatePairRule) {
  const { facts, situations } = input;
  const situation = situations.find(
    (candidate) => candidate.rule === rule && facts[candidate.field] === candidate.value,
  );
  return situation;
}

function toPairRule(situation: IssSituationFacts) {
  const pairRule: PairRule = {
    rule: situation.rule,
    isWithoutRedistribution: situation.pairType === WITHOUT_REDISTRIBUTION,
  };
  return pairRule;
}

export type {
  Annex,
  AnnexRateValues,
  EffectiveRateLine,
  PairFacts,
  RatePairChoice,
  RatePairValues,
};
export { assessIssFields, chooseRatePair };
