// Shapes a Simples result for the screen, and the comparison of both regimes: Brazilian money and
// percent notation, a label and a tone per status, and the rules in Portuguese. Pure, so it is
// tested without rendering.

import type { CalculationResult } from "@/features/calculations/calculation.dto.ts";
import type { StatusTone } from "@/features/calculations/calculation.view.ts";
import {
  type CalculationMemoryView,
  type SourceLinkView,
  type TaxTone,
  toSourceLink,
} from "@/shared/format/calculation.memory.ts";
import { formatMoney, formatPercent } from "@/shared/format/decimal.brazil.ts";
import { presentStep } from "@/shared/format/formula.present.ts";
import { tellTaxStory } from "@/shared/format/memory.story.ts";
import {
  addDecimals,
  compareDecimals,
  type Decimal,
  formatDecimal,
  parseDecimal,
  subtractDecimals,
} from "@/shared/math/decimal.ts";
import { MONEY } from "./simples.calculate.ts";
import type {
  NotCalculatedReason,
  SimplesCalculatedItem,
  SimplesCalculationResult,
  SimplesItemResult,
  SimplesTax,
} from "./simples.dto.ts";

interface AmountLine {
  label: string;
  amount: string;
}

interface SimplesTaxLineView {
  label: string;
  tone: TaxTone;
  rate: string;
  dueAmount: string;
  pendingAmount: string;
}

interface SimplesItemView {
  itemNumber: number;
  statusLabel: string;
  tone: StatusTone;
  revenueType: string | null;
  grossRevenue: string | null;
  baseAmount: string | null;
  taxLines: SimplesTaxLineView[];
  itemTotal: string | null;
  violations: { ruleCode: string; field: string; explanation: string }[];
  notice: string | null;
  helpLink: SourceLinkView | null;
  memory: CalculationMemoryView | null;
}

// why: the comparison column shows these even while the regular calculation is still loading.
interface SimplesView {
  summaryLines: AmountLine[];
  totals: AmountLine[];
  itemViews: SimplesItemView[];
  dataVersion: string;
}

type RegularColumnView =
  | { kind: "ready"; lines: AmountLine[] }
  | { kind: "loading" }
  | { kind: "failed" };

interface ComparisonView {
  regularLines: AmountLine[];
  difference: string;
  pendingNote: string | null;
  coverageNote: string | null;
  sublimitNote: string | null;
}

const NO_VALUE = "-";

// why: in the Simples the rate is never looked up; the PGDAS-D publishes it for the company.
const GIVEN_RATE_ORIGIN = "Alíquota efetiva do extrato do PGDAS-D, informada por você.";
const SHIFTED_RATE_ORIGIN =
  "Alíquota efetiva do PGDAS-D, deslocada porque o comprador é um ente público (arts. 372 e 473 da LC 214/2025).";
const PENDING_OUTCOME =
  "Neste regime o valor calculado fica pendente (suspenso): não é devido nesta nota.";
const DROPPED_OUTCOME = "Neste regime o valor calculado não é cobrado: fica zerado.";

const SIMPLES_FORMULAS_LABEL = "Regras do Simples: calculadora oficial do Simples Nacional";
const REGULAR_CALCULATED_STATUSES = new Set(["calculated", "simulated"]);
const SUBLIMIT_NOTE =
  "Com o sublimite excedido, o IBS sai do Simples e é recolhido pelo regime regular, fora deste total.";
const COVERAGE_NOTE =
  "Algum item não foi calculado em um dos regimes; a comparação soma só os itens calculados.";
const ZERO = "0.00";

const STATUS_LABELS: Record<SimplesItemResult["status"], { label: string; tone: StatusTone }> = {
  calculated: { label: "Calculado", tone: "success" },
  notCalculated: { label: "Não calculado", tone: "warning" },
  rejected: { label: "Rejeitado", tone: "destructive" },
  notImplemented: { label: "Fora do escopo", tone: "warning" },
};

const NOT_CALCULATED_NOTICES: Record<NotCalculatedReason, string> = {
  activityMissing: "Sem a atividade do Simples Nacional, a CBS e o IBS do item não são calculados.",
  activityUnknown: "A atividade não existe na data do fato gerador; a receita entra só no total.",
  activityNotAllowed: "A atividade não é admitida neste documento; a receita entra só no total.",
  revenueOnlyRegime:
    "O emitente apura a CBS e o IBS pelo regime regular; o item leva só a receita.",
};

const NOT_IMPLEMENTED_NOTICE =
  "Este tratamento tem ajuste, que a calculadora oficial também não implementa.";

const RULE_EXPLANATIONS: Record<string, string> = {
  "VSN-004": "Falta a alíquota efetiva de CBS do Simples.",
  "VSN-005": "A alíquota efetiva de CBS do Simples não é um percentual válido.",
  "VSN-006": "Falta a alíquota efetiva de IBS do Simples.",
  "VSN-007": "A alíquota efetiva de IBS do Simples não é um percentual válido.",
  "VSN-021": "A classificação tributária não existe nessa data.",
  "VSN-022": "A classificação tributária não é permitida neste tipo de documento.",
  "VSN-023": "A atividade de operações não tributáveis não combina com esta classificação.",
  "VSN-042": "O anexo da classificação exige o NCM completo, com 8 dígitos.",
  "VSN-044": "O anexo da classificação exige um NCM ou NBS que não foi informado.",
  "VSN-045": "O tipo de documento não aceita este NCM ou NBS.",
  "VSN-047": "O NCM não está no anexo da classificação tributária.",
  "VSN-049": "O NCM não está em vigor na data do fato gerador.",
};

function toSimplesView(result: SimplesCalculationResult) {
  const totals = result.totals;
  const view: SimplesView = {
    summaryLines: toSimplesLines(result),
    totals: [
      { label: "Receita bruta", amount: formatMoney(totals?.grossRevenue ?? ZERO) },
      { label: "CBS devida", amount: formatMoney(totals?.cbsDueAmount ?? ZERO) },
      { label: "IBS devido", amount: formatOptionalMoney(totals?.ibsDueAmount) },
      { label: "Pendente ou suspenso", amount: formatMoney(sumPending(result)) },
    ],
    itemViews: result.items.map(toSimplesItemView),
    dataVersion: result.dataVersion,
  };
  return view;
}

function toSimplesItemView(itemResult: SimplesItemResult) {
  const { label, tone } = STATUS_LABELS[itemResult.status];
  const emptyView: SimplesItemView = {
    itemNumber: itemResult.itemNumber,
    statusLabel: label,
    tone,
    revenueType: null,
    grossRevenue: null,
    baseAmount: null,
    taxLines: [],
    itemTotal: null,
    violations: [],
    notice: null,
    helpLink: null,
    memory: null,
  };

  switch (itemResult.status) {
    case "calculated": {
      const calculatedView: SimplesItemView = { ...emptyView, ...toCalculatedFields(itemResult) };
      return calculatedView;
    }
    case "notCalculated": {
      const notCalculatedView: SimplesItemView = {
        ...emptyView,
        revenueType: itemResult.revenueType.description,
        grossRevenue: formatMoney(itemResult.grossRevenue),
        notice: NOT_CALCULATED_NOTICES[itemResult.reason],
      };
      return notCalculatedView;
    }
    case "rejected": {
      const rejectedView: SimplesItemView = {
        ...emptyView,
        violations: itemResult.violations.map((violation) => ({
          ruleCode: violation.ruleCode,
          field: violation.field,
          explanation: RULE_EXPLANATIONS[violation.ruleCode] ?? violation.message,
        })),
        helpLink: { label: "Por que um item é rejeitado?", url: "/duvidas/#item-rejeitado" },
      };
      return rejectedView;
    }
    case "notImplemented": {
      const notImplementedView: SimplesItemView = {
        ...emptyView,
        notice: NOT_IMPLEMENTED_NOTICE,
        helpLink: { label: "O que o simulador não calcula?", url: "/duvidas/#fora-do-escopo" },
      };
      return notImplementedView;
    }
  }
}

function toCalculatedFields(itemResult: SimplesCalculatedItem) {
  const taxLines = [toTaxLine("CBS", "cbs", itemResult.cbs)];

  if (itemResult.ibs) {
    taxLines.push(toTaxLine("IBS", "ibs", itemResult.ibs));
  }

  const fields: Partial<SimplesItemView> = {
    revenueType: itemResult.revenueType.description,
    grossRevenue: formatMoney(itemResult.grossRevenue),
    baseAmount: formatMoney(itemResult.baseAmount),
    taxLines,
    itemTotal: formatMoney(itemResult.itemTotal),
    memory: toSimplesMemory(itemResult),
  };
  return fields;
}

function toSimplesMemory(itemResult: SimplesCalculatedItem) {
  const taxes: Array<{ taxName: string; tone: TaxTone; tax: SimplesTax | null }> = [
    { taxName: "CBS", tone: "cbs", tax: itemResult.cbs },
    { taxName: "IBS", tone: "ibs", tax: itemResult.ibs },
  ];
  const memory: CalculationMemoryView = {
    taxes: taxes
      .filter(({ tax }) => tax !== null && tax.calculationSteps.length > 0)
      .map(({ taxName, tone, tax }) => ({
        taxName,
        tone,
        steps: (tax?.calculationSteps ?? []).map((step) =>
          presentStep(step, {
            origin: step.formula === null ? GIVEN_RATE_ORIGIN : SHIFTED_RATE_ORIGIN,
            regime: "simples",
          }),
        ),
        story: tellTaxStory(tax?.calculationSteps ?? [], "simples"),
        outcome: tax ? describeOutcome(tax) : null,
      })),
    formulaOrigin: "Regra da calculadora do Simples, como o simulador a aplica:",
    legalText: null,
    sourceLinks: [toSourceLink("simplesCalculator", SIMPLES_FORMULAS_LABEL), toSourceLink("lc214")],
  };
  return memory;
}

// why: the steps end at the calculated value; the regime then sends it to due, pending or nowhere.
function describeOutcome(tax: SimplesTax) {
  const lastResult = tax.calculationSteps.at(-1)?.result ?? "0";
  const hasCalculatedValue = compareDecimals(parseDecimal(lastResult), parseDecimal(ZERO)) !== 0;
  const isDue = compareDecimals(parseDecimal(tax.dueAmount), parseDecimal(ZERO)) !== 0;
  const isPending = compareDecimals(parseDecimal(tax.pendingAmount), parseDecimal(ZERO)) !== 0;

  if (!hasCalculatedValue || isDue) {
    return null;
  }

  const outcome = isPending ? PENDING_OUTCOME : DROPPED_OUTCOME;
  return outcome;
}

function toTaxLine(label: string, tone: TaxTone, tax: SimplesTax) {
  const taxLine: SimplesTaxLineView = {
    label,
    tone,
    rate: tax.rate ? formatPercent(tax.rate) : NO_VALUE,
    dueAmount: formatMoney(tax.dueAmount),
    pendingAmount: formatMoney(tax.pendingAmount),
  };
  return taxLine;
}

// why: with CRT 2 the Simples has no IBS; a dash says so where R$ 0,00 would say it was zero.
function formatOptionalMoney(amount: string | null | undefined) {
  const text = amount ? formatMoney(amount) : NO_VALUE;
  return text;
}

function sumPending(result: SimplesCalculationResult) {
  const pending = [result.totals?.cbsPendingAmount, result.totals?.ibsPendingAmount]
    .map((amount) => parseDecimal(amount ?? ZERO))
    .reduce(addDecimals);
  const total = formatDecimal(pending, MONEY);
  return total;
}

function sumRegularTaxes(regular: CalculationResult) {
  const regularTotal = addDecimals(
    parseDecimal(regular.totals.cbsAmount),
    parseDecimal(regular.totals.ibsAmount),
  );
  return regularTotal;
}

// why: each column loads on its own, so the regular one has states of its own too.
function toRegularColumn(input: { result: CalculationResult | null; isLoading: boolean }) {
  const { result, isLoading } = input;

  if (result) {
    const ready: RegularColumnView = { kind: "ready", lines: toRegularLines(result) };
    return ready;
  }

  const pending: RegularColumnView = isLoading ? { kind: "loading" } : { kind: "failed" };
  return pending;
}

function toRegularLines(regular: CalculationResult) {
  const regularLines: AmountLine[] = [
    { label: "CBS", amount: formatMoney(regular.totals.cbsAmount) },
    { label: "IBS", amount: formatMoney(regular.totals.ibsAmount) },
    { label: "Total", amount: formatMoney(formatDecimal(sumRegularTaxes(regular), MONEY)) },
  ];
  return regularLines;
}

function toSimplesLines(simples: SimplesCalculationResult) {
  const simplesTotal = parseDecimal(simples.totals?.taxTotal ?? ZERO);
  const simplesLines: AmountLine[] = [
    { label: "CBS", amount: formatMoney(simples.totals?.cbsDueAmount ?? ZERO) },
    { label: "IBS", amount: formatOptionalMoney(simples.totals?.ibsDueAmount) },
    { label: "Total", amount: formatMoney(formatDecimal(simplesTotal, MONEY)) },
  ];
  return simplesLines;
}

// why: with CRT 2 the IBS leaves the Simples; the CRT says so, an empty IBS total does not.
function toComparisonView(input: {
  regular: CalculationResult;
  simples: SimplesCalculationResult;
  isSublimitExceeded: boolean;
}) {
  const { regular, simples, isSublimitExceeded } = input;
  const regularTotal = sumRegularTaxes(regular);
  const simplesTotal = parseDecimal(simples.totals?.taxTotal ?? ZERO);
  const pending = sumPending(simples);
  const comparison: ComparisonView = {
    regularLines: toRegularLines(regular),
    difference: describeDifference(subtractDecimals(regularTotal, simplesTotal)),
    pendingNote:
      compareDecimals(parseDecimal(pending), parseDecimal(ZERO)) > 0
        ? `Outros ${formatMoney(pending)} ficam pendentes ou suspensos no Simples Nacional.`
        : null,
    coverageNote: isEveryItemCalculated(regular, simples) ? null : COVERAGE_NOTE,
    sublimitNote: isSublimitExceeded ? SUBLIMIT_NOTE : null,
  };
  return comparison;
}

// why: an item left out on one side would make that regime look cheaper than it is.
function isEveryItemCalculated(regular: CalculationResult, simples: SimplesCalculationResult) {
  const isRegularComplete = regular.items.every((itemResult) =>
    REGULAR_CALCULATED_STATUSES.has(itemResult.status),
  );
  const isSimplesComplete = simples.items.every((itemResult) => itemResult.status === "calculated");
  const isComplete = isRegularComplete && isSimplesComplete;
  return isComplete;
}

function describeDifference(difference: Decimal) {
  const sign = compareDecimals(difference, parseDecimal(ZERO));
  const amount = formatMoney(formatDecimal(difference, MONEY).replace("-", ""));
  const sentences: Record<number, string> = {
    1: `No Simples Nacional, a operação recolhe ${amount} a menos de CBS e IBS.`,
    0: "Os dois regimes recolhem o mesmo valor de CBS e IBS.",
    [-1]: `No Simples Nacional, a operação recolhe ${amount} a mais de CBS e IBS.`,
  };
  const sentence = sentences[sign] ?? sentences[0] ?? "";
  return sentence;
}

export type {
  AmountLine,
  ComparisonView,
  RegularColumnView,
  SimplesItemView,
  SimplesTaxLineView,
  SimplesView,
};
export { toComparisonView, toRegularColumn, toSimplesView };
