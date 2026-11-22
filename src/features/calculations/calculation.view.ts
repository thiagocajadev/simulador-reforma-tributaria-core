// Shapes a calculation result for the screen: Brazilian money and percent notation, a label and a
// tone per status, the rules and out-of-scope reasons in Portuguese, and the calculation memory of
// each item: its formulas, the legal ground and the official sources. Pure, so it is tested without
// rendering.

import { linkLegalGround } from "@/shared/content/lc214.anchors.ts";
import {
  type CalculationMemoryView,
  type SourceLinkView,
  type TaxMemoryView,
  type TaxTone,
  toSourceLink,
} from "@/shared/format/calculation.memory.ts";
import { formatMoney, formatPercent } from "@/shared/format/decimal.brazil.ts";
import { presentStep } from "@/shared/format/formula.present.ts";
import { tellTaxStory } from "@/shared/format/memory.story.ts";
import {
  addDecimals,
  formatDecimal,
  parseDecimal,
  subtractDecimals,
} from "@/shared/math/decimal.ts";
import type {
  CalculatedItem,
  CalculationResult,
  ItemResult,
  LegalGround,
  NotImplementedReason,
  RateSource,
  RuleViolation,
  SelectiveTaxRateSource,
  SelectiveTaxResult,
  TaxResult,
} from "./calculation.dto.ts";

type StatusTone = "success" | "highlight" | "destructive" | "warning";

interface TaxLineView {
  label: string;
  tone: TaxTone;
  hasReduction: boolean;
  rate: string;
  reduction: string;
  effectiveRate: string;
  amount: string;
}

interface SelectiveTaxLineView {
  amount: string;
  details: string[];
}

interface ViolationView {
  ruleCode: string;
  explanation: string;
}

interface ItemView {
  itemNumber: number;
  statusLabel: string;
  tone: StatusTone;
  classification: string | null;
  treatment: string | null;
  legalGround: SourceLinkView | null;
  baseAmount: string | null;
  valueAmount: string | null;
  taxLines: TaxLineView[];
  selectiveTax: SelectiveTaxLineView | null;
  ibsAmount: string | null;
  taxAmount: string | null;
  totalAmount: string | null;
  violations: ViolationView[];
  notice: string | null;
  helpLink: SourceLinkView | null;
  memory: CalculationMemoryView | null;
}

interface TotalView {
  label: string;
  amount: string;
}

interface CalculationView {
  totals: TotalView[];
  baseTotal: string;
  selectiveTaxTotal: string | null;
  taxTotal: string;
  grandTotal: string;
  itemViews: ItemView[];
  dataVersion: string;
}

const NO_VALUE = "-";

const RATE_ORIGINS: Record<RateSource, string> = {
  nominal:
    "Informada no formulário: os dados abertos ainda não trazem as alíquotas de 2027 em diante.",
  standard:
    "Alíquota de referência do ano, ajustada pela UF ou pelo município quando eles fixam a sua.",
  reference: "Alíquota de referência nacional do ano.",
  classification: "Alíquota própria desta classificação tributária, nos dados abertos.",
  none: "Esta classificação não tem alíquota.",
};

const SELECTIVE_RATE_ORIGINS: Record<SelectiveTaxRateSource, string> = {
  nominal: "Informada no formulário: os dados abertos ainda não trazem as alíquotas do IS.",
  official: "Alíquota do Imposto Seletivo nos dados abertos da calculadora oficial.",
};

// why: the same codes mean the IS group when the rule is about it, so they read differently.
const SELECTIVE_TAX_RULE_EXPLANATIONS: Record<string, string> = {
  "REG-004": "O CST do Imposto Seletivo não existe nessa data. O IS começa em 2027.",
  "REG-005": "A classificação do Imposto Seletivo não existe nessa data.",
  "REG-006": "A classificação do Imposto Seletivo pertence a outro CST.",
  "REG-008": "Não há tratamento para a classificação do Imposto Seletivo nessa data.",
  "REG-013":
    "Este NCM paga Imposto Seletivo nessa data: preencha o bloco do IS. Se ele não apareceu, escolha o NCM de novo.",
  "REG-023":
    "A alíquota ad rem do Imposto Seletivo pede a quantidade, maior que zero, e a unidade.",
  "REG-032": "Este tipo de documento não aceita Imposto Seletivo; só a NF-e e a NFC-e.",
  "REG-035":
    "Informe a alíquota do Imposto Seletivo: a lei ainda não a fixou, e os dados abertos não a trazem.",
  "REG-036": "As alíquotas do Imposto Seletivo só são aceitas a partir de 2027.",
};

const TAX_MEMORY_LABELS: Array<{
  key: "cbs" | "ibsUf" | "ibsMun";
  taxName: string;
  tone: TaxTone;
}> = [
  { key: "cbs", taxName: "CBS", tone: "cbs" },
  { key: "ibsUf", taxName: "IBS estadual", tone: "ibsUf" },
  { key: "ibsMun", taxName: "IBS municipal", tone: "ibsMun" },
];

const REJECTED_HELP: SourceLinkView = {
  label: "Por que um item é rejeitado?",
  url: "/duvidas/#item-rejeitado",
};

const OUT_OF_SCOPE_HELP: SourceLinkView = {
  label: "O que o simulador não calcula?",
  url: "/duvidas/#fora-do-escopo",
};

const LAW_NAME = "LC 214/2025";

const OFFICIAL_CALCULATOR_LABEL =
  "Calculadora oficial da Receita, para conferir com a sua operação";

const CBS_STANDARD_ORIGIN = "Alíquota de referência do ano.";

const FORMULAS_SOURCE_LABEL = "Fórmulas e alíquotas: dados abertos da calculadora oficial";

const STATUS_LABELS: Record<ItemResult["status"], { label: string; tone: StatusTone }> = {
  calculated: { label: "Calculado", tone: "success" },
  simulated: { label: "Simulado com alíquotas informadas", tone: "highlight" },
  rejected: { label: "Rejeitado", tone: "destructive" },
  notImplemented: { label: "Fora do escopo", tone: "warning" },
};

const NOT_IMPLEMENTED_NOTICES: Record<NotImplementedReason, string> = {
  taxRelief: "Este tratamento exige o grupo de tributação regular, que o simulador não preenche.",
  adjustment: "Este tratamento tem ajuste, que a calculadora oficial também não implementa.",
  monophasic: "Tributação monofásica de combustíveis ainda não está liberada na calculadora.",
  deferral: "Tratamentos com diferimento ainda não têm caso de referência para conferir.",
  combinedRates: "Alíquota ad valorem com ad rem é exclusiva do Imposto Seletivo.",
};

const NO_TAX_GROUP_NOTICE =
  "Este CST não tem o grupo IBS/CBS, como imunidade ou não incidência, e por isso não gera valores.";

const RULE_EXPLANATIONS: Record<string, string> = {
  "REG-001": "NCM e NBS foram informados juntos no mesmo item.",
  "REG-002": "O NCM não está em vigor na data do fato gerador.",
  "REG-003": "O NBS não está em vigor na data do fato gerador.",
  "REG-004": "O CST não existe para CBS e IBS nessa data.",
  "REG-005": "A classificação tributária não existe para CBS e IBS nessa data.",
  "REG-006": "A classificação tributária pertence a outro CST.",
  "REG-008": "Não há tratamento tributário para a classificação nessa data.",
  "REG-011": "O NCM não está no anexo da classificação tributária.",
  "REG-012": "O NBS não está no anexo da classificação tributária.",
  "REG-015": "O anexo da classificação exige o NCM completo, com 8 dígitos.",
  "REG-016": "O anexo da classificação exige o NBS completo, com 9 dígitos.",
  "REG-023": "Não há alíquota setorial ou fixa para a classificação nessa data.",
  "REG-029": "A classificação tributária não é permitida neste tipo de documento.",
  "REG-030": "O tipo de documento não aceita NCM ou NBS neste item.",
  "REG-033": "O anexo da classificação exige um NCM ou NBS que não foi informado.",
  "REG-036": "Alíquotas nominais só são aceitas a partir de 2027.",
  "REG-037": "A partir de 2027 as alíquotas nominais são obrigatórias.",
};

function toCalculationView(result: CalculationResult) {
  const { totals } = result;
  const hasSelectiveTax = result.items.some(
    (itemResult) => "selectiveTax" in itemResult && itemResult.selectiveTax !== null,
  );
  const selectiveTaxTotal = hasSelectiveTax ? formatMoney(totals.selectiveTaxAmount) : null;
  const view: CalculationView = {
    totals: [
      { label: "Base de cálculo", amount: formatMoney(totals.baseAmount) },
      { label: "CBS", amount: formatMoney(totals.cbsAmount) },
      { label: "IBS estadual", amount: formatMoney(totals.ibsUfAmount) },
      { label: "IBS municipal", amount: formatMoney(totals.ibsMunAmount) },
      { label: "IBS total", amount: formatMoney(totals.ibsAmount) },
      ...(selectiveTaxTotal ? [{ label: "IS", amount: selectiveTaxTotal }] : []),
    ],
    baseTotal: formatMoney(subtractAmount(totals.baseAmount, sumSelectiveTaxInBase(result.items))),
    selectiveTaxTotal,
    taxTotal: formatMoney(sumAmounts([totals.cbsAmount, totals.ibsAmount])),
    grandTotal: formatMoney(sumAmounts([totals.baseAmount, totals.cbsAmount, totals.ibsAmount])),
    itemViews: result.items.map(toItemView),
    dataVersion: result.dataVersion,
  };
  return view;
}

function toItemView(itemResult: ItemResult) {
  const { label, tone } = STATUS_LABELS[itemResult.status];
  const emptyView: ItemView = {
    itemNumber: itemResult.itemNumber,
    statusLabel: label,
    tone,
    classification: null,
    treatment: null,
    legalGround: null,
    baseAmount: null,
    valueAmount: null,
    taxLines: [],
    selectiveTax: null,
    ibsAmount: null,
    taxAmount: null,
    totalAmount: null,
    violations: [],
    notice: null,
    helpLink: null,
    memory: null,
  };

  if (itemResult.status === "rejected") {
    const rejectedView: ItemView = {
      ...emptyView,
      violations: itemResult.violations.map((violation) => ({
        ruleCode: violation.ruleCode,
        explanation: explainViolation(violation),
      })),
      helpLink: REJECTED_HELP,
    };
    return rejectedView;
  }

  if (itemResult.status === "notImplemented") {
    const notImplementedView: ItemView = {
      ...emptyView,
      notice: NOT_IMPLEMENTED_NOTICES[itemResult.reason],
      helpLink: OUT_OF_SCOPE_HELP,
    };
    return notImplementedView;
  }

  const calculatedView: ItemView = { ...emptyView, ...toCalculatedFields(itemResult) };
  return calculatedView;
}

function toCalculatedFields(itemResult: CalculatedItem) {
  const { taxes, legalGround, selectiveTax } = itemResult;
  const fields: Partial<ItemView> = {
    classification: describeClassification(itemResult),
    treatment: itemResult.treatmentDescription,
    legalGround: legalGround ? toLegalGroundLink(legalGround) : null,
    baseAmount: taxes ? formatMoney(taxes.baseAmount) : null,
    valueAmount: taxes
      ? formatMoney(subtractAmount(taxes.baseAmount, selectiveTax?.amount ?? "0"))
      : null,
    selectiveTax: selectiveTax ? toSelectiveTaxLine(selectiveTax) : null,
    taxLines: taxes
      ? [
          toTaxLine("CBS", "cbs", taxes.cbs),
          toTaxLine("IBS estadual", "ibsUf", taxes.ibsUf),
          toTaxLine("IBS municipal", "ibsMun", taxes.ibsMun),
        ]
      : [],
    ibsAmount: taxes ? formatMoney(taxes.ibsAmount) : null,
    taxAmount: taxes ? formatMoney(sumAmounts([taxes.cbs.amount, taxes.ibsAmount])) : null,
    totalAmount: taxes
      ? formatMoney(sumAmounts([taxes.baseAmount, taxes.cbs.amount, taxes.ibsAmount]))
      : null,
    notice: taxes ? null : NO_TAX_GROUP_NOTICE,
    memory: taxes ? toCalculationMemory(itemResult) : null,
  };
  return fields;
}

// why: only an item with CBS/IBS values has the IS inside the base the totals add up.
function sumSelectiveTaxInBase(itemResults: ItemResult[]) {
  const amounts = itemResults.flatMap((itemResult) =>
    "taxes" in itemResult && itemResult.taxes && itemResult.selectiveTax
      ? [itemResult.selectiveTax.amount]
      : [],
  );
  const sum = sumAmounts(["0", ...amounts]);
  return sum;
}

function explainViolation(violation: RuleViolation) {
  const isAboutSelectiveTax =
    violation.field.includes(".selectiveTax") || violation.message.includes("Imposto Seletivo");
  const explanation =
    (isAboutSelectiveTax ? SELECTIVE_TAX_RULE_EXPLANATIONS[violation.ruleCode] : undefined) ??
    RULE_EXPLANATIONS[violation.ruleCode] ??
    violation.message;
  return explanation;
}

function describeClassification(itemResult: CalculatedItem) {
  const { selectiveTax } = itemResult;
  const cbsIbs = `CST ${itemResult.cstCode} · cClassTrib ${itemResult.cClassTrib}`;
  const description = selectiveTax
    ? `${cbsIbs}; IS: CST ${selectiveTax.cstCode} · cClassTrib ${selectiveTax.cClassTrib}`
    : cbsIbs;
  return description;
}

function toSelectiveTaxLine(selectiveTax: SelectiveTaxResult) {
  const { adValoremRate, adRemRate, quantity, unit } = selectiveTax;
  const adValorem = adValoremRate ? [`Alíq. ${formatPercent(adValoremRate)}`] : [];
  const adRem = adRemRate ? [`${formatMoney(adRemRate)} × ${quantity ?? ""} ${unit ?? ""}`] : [];
  const line: SelectiveTaxLineView = {
    amount: formatMoney(selectiveTax.amount),
    details: [...adValorem, ...adRem],
  };
  return line;
}

// why: the IS enters the CBS/IBS base (CF art. 153 §6º IV), so the item's own value is the base
// less the IS; an item without IS has the two equal.
function subtractAmount(minuend: string, subtrahend: string) {
  const difference = subtractDecimals(parseDecimal(minuend), parseDecimal(subtrahend));
  const text = formatDecimal(difference, { minPlaces: 2, maxPlaces: 2 });
  return text;
}

// why: the CBS and the IBS are not part of their own base, so they add to the price for the total.
function sumAmounts(amounts: string[]) {
  const sum = amounts.map(parseDecimal).reduce(addDecimals);
  const text = formatDecimal(sum, { minPlaces: 2, maxPlaces: 2 });
  return text;
}

// why: two open-data grounds read only "LC 214/2025"; naming the law twice reads as a typo.
// why: the CBS is federal; no UF or municipality adjusts its rate.
function describeRateOrigin(rateSource: RateSource, tone: TaxTone) {
  const isFederalStandard = rateSource === "standard" && tone === "cbs";
  const origin = isFederalStandard ? CBS_STANDARD_ORIGIN : RATE_ORIGINS[rateSource];
  return origin;
}

function toLegalGroundLink(legalGround: LegalGround) {
  const { shortReference } = legalGround;
  const namesTheLaw = shortReference.includes(LAW_NAME);
  const link: SourceLinkView = {
    label: namesTheLaw ? shortReference : `${shortReference} da ${LAW_NAME}`,
    url: linkLegalGround(shortReference),
  };
  return link;
}

function toCalculationMemory(itemResult: CalculatedItem) {
  const { taxes, legalGround } = itemResult;
  const lawLink = legalGround ? [toLegalGroundLink(legalGround)] : [];
  const cbsIbsMemory = TAX_MEMORY_LABELS.flatMap(({ key, taxName, tone }) => {
    const taxResult = taxes?.[key];
    const origin = taxResult ? describeRateOrigin(taxResult.rateSource, tone) : null;
    const taxMemory = taxResult
      ? [
          {
            taxName,
            tone,
            steps: taxResult.calculationSteps.map((step) =>
              presentStep(step, { origin, regime: "regular" }),
            ),
            story: tellTaxStory(taxResult.calculationSteps, "regular"),
            outcome: null,
          },
        ]
      : [];
    return taxMemory;
  });
  const memory: CalculationMemoryView = {
    taxes: [...toSelectiveTaxMemory(itemResult.selectiveTax), ...cbsIbsMemory],
    formulaOrigin: "Nos dados abertos:",
    legalText: legalGround ? describeLegalGround(legalGround) : null,
    sourceLinks: [
      ...lawLink,
      toSourceLink("regularRegimeCalculator", FORMULAS_SOURCE_LABEL),
      toSourceLink("receitaServicesPortal", OFFICIAL_CALCULATOR_LABEL),
    ],
  };
  return memory;
}

// why: the IS comes first, since its amount enters the CBS/IBS base the other sections show.
function toSelectiveTaxMemory(selectiveTax: SelectiveTaxResult | null) {
  if (!selectiveTax) {
    return [];
  }

  const { adValorem, adRem } = selectiveTax.rateSources;
  const source = adValorem ?? adRem;
  const origin = source ? SELECTIVE_RATE_ORIGINS[source] : null;
  const taxMemory: TaxMemoryView = {
    taxName: "Imposto Seletivo",
    tone: "selective",
    steps: selectiveTax.calculationSteps.map((step) =>
      presentStep(step, { origin, regime: "regular" }),
    ),
    story: tellTaxStory(selectiveTax.calculationSteps, "regular"),
    outcome: null,
  };
  return [taxMemory];
}

// why: most descriptions already open with their reference ("Art. 129. Ficam reduzidas...").
function describeLegalGround(legalGround: LegalGround) {
  const { shortReference, description } = legalGround;
  const repeatsReference = description.startsWith(shortReference);
  const text = repeatsReference ? description : `${shortReference}: ${description}`;
  return text;
}

function toTaxLine(label: string, tone: TaxTone, taxResult: TaxResult) {
  const taxLine: TaxLineView = {
    label,
    tone,
    hasReduction: taxResult.reductionPercent !== null,
    rate: formatPercent(taxResult.rate),
    reduction: taxResult.reductionPercent ? formatPercent(taxResult.reductionPercent) : NO_VALUE,
    effectiveRate: taxResult.effectiveRate ? formatPercent(taxResult.effectiveRate) : NO_VALUE,
    amount: formatMoney(taxResult.amount),
  };
  return taxLine;
}

export type { CalculationView, ItemView, SelectiveTaxLineView, StatusTone, TaxLineView };
export { toCalculationView };
