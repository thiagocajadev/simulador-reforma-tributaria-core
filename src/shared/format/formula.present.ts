// Turns a calculation step (docs/calculation.md, Calculation steps) into what a newcomer reads: the
// formula with words instead of variable names, the same formula with the values the engine used,
// and the result in Brazilian notation. Values arrive as the formulas consume them: rates and
// percentages as fractions, money in reais.

import type {
  CalculationStep,
  CalculationStepName,
} from "@/features/calculations/calculation.dto.ts";
import { formatDecimal, parseDecimal, shiftDecimalPoint } from "@/shared/math/decimal.ts";
import { formatMoney, formatPercent } from "./decimal.brazil.ts";

type ValueKind = "money" | "fraction" | "number";

interface VariableMeaning {
  label: string;
  kind: ValueKind;
}

type CalculationRegime = "regular" | "simples";

interface StepContext {
  origin: string | null;
  regime: CalculationRegime;
}

interface StepView {
  title: string;
  plainFormula: string | null;
  substitutedFormula: string | null;
  rawFormula: string | null;
  result: string;
  note: string | null;
  origin: string | null;
}

const VARIABLE_MEANINGS: Record<string, VariableMeaning> = {
  aliquota: { label: "alíquota", kind: "fraction" },
  aliquotaEfetiva: { label: "alíquota efetiva", kind: "fraction" },
  aliquotaAdValorem: { label: "alíquota ad valorem", kind: "fraction" },
  aliquotaAdRem: { label: "alíquota ad rem (R$ por unidade)", kind: "money" },
  percentualReducao: { label: "redução", kind: "fraction" },
  pRedutorCompraGov: { label: "redutor de compra governamental (%)", kind: "number" },
  baseCalculoInformada: { label: "valor informado", kind: "money" },
  baseCalculo: { label: "base de cálculo", kind: "money" },
  impostoSeletivoInformado: { label: "Imposto Seletivo informado", kind: "money" },
  impostoSeletivoCalculado: { label: "Imposto Seletivo calculado", kind: "money" },
  tributoCalculado: { label: "tributo calculado", kind: "money" },
  quantidade: { label: "quantidade", kind: "number" },
  receitaBruta: { label: "receita bruta", kind: "money" },
  fatorReceita: { label: "fator da receita", kind: "number" },
  aliquotaCbs: { label: "alíquota de CBS", kind: "fraction" },
  aliquotaIbs: { label: "alíquota de IBS", kind: "fraction" },
  fatorCompraGov: { label: "fator de compra governamental", kind: "number" },
};

const STEP_MEANINGS: Record<
  CalculationStepName,
  { title: string; resultKind: ValueKind; note: string | null }
> = {
  rate: { title: "Alíquota", resultKind: "fraction", note: "Publicada com até 4 casas decimais." },
  effectiveRate: {
    title: "Alíquota efetiva",
    resultKind: "fraction",
    note: "Publicada com até 4 casas decimais; é ela que multiplica a base.",
  },
  base: {
    title: "Base de cálculo",
    resultKind: "money",
    note: "Arredondada para 2 casas e nunca abaixo de zero.",
  },
  calculatedTax: {
    title: "Tributo calculado",
    resultKind: "money",
    note: "Arredondado uma única vez, para 2 casas decimais.",
  },
  taxDue: { title: "Tributo devido", resultKind: "money", note: null },
};

// why: "*" for multiplication, as the open data writes it, so the two formulas read alike.
const OPERATOR_SYMBOLS: Record<string, string> = { "*": "*", "/": "÷", "-": "−", "+": "+" };
const FORMULA_TOKEN = /[A-Za-z]\w*|\d+(?:\.\d+)?|[-+*/()]/g;
// why: "aliquota" or "tributoCalculado" alone only repeats the result; the raw formula still shows.
const SINGLE_TOKEN = /^(?:[A-Za-z]\w*|\d+(?:\.\d+)?)$/;
const EXACT = { minPlaces: 0, maxPlaces: 40 };
const FRACTION_TO_PERCENT = 2;

// `origin` says where a rate came from; only the rate step carries it.
function presentStep(step: CalculationStep, context: StepContext) {
  const { origin } = context;
  const meaning = STEP_MEANINGS[step.step];
  const { formula } = step;
  const writable = formula !== null && !SINGLE_TOKEN.test(formula.trim()) ? formula : null;
  const stepView: StepView = {
    title: meaning.title,
    plainFormula: writable ? writeFormula(writable, toLabel) : null,
    substitutedFormula: writable
      ? writeFormula(writable, (name) => formatVariable(name, step.values[name]))
      : null,
    rawFormula: step.formula,
    result: formatStepValue(step.result, meaning.resultKind),
    note: describeNote(step, context.regime),
    origin: step.step === "rate" ? origin : null,
  };
  return stepView;
}

// why: "published at 4 places" is the regular regime's rule; the Simples rate is the PGDAS-D one,
// rounded only by the NFS-e layout.
function describeNote(step: CalculationStep, regime: CalculationRegime) {
  if (step.roundedToPlaces !== undefined) {
    const layoutNote = `Arredondada para ${step.roundedToPlaces} casas decimais, como a NFS-e imprime.`;
    return layoutNote;
  }

  const isSimplesRate = regime === "simples" && step.step === "rate";
  const note = step.formula === null || isSimplesRate ? null : STEP_MEANINGS[step.step].note;
  return note;
}

function writeFormula(formula: string, writeVariable: (name: string) => string) {
  const tokens = formula.match(FORMULA_TOKEN) ?? [];
  const words = tokens.map((token) => writeToken(token, writeVariable));
  const written = words.join(" ").replaceAll("( ", "(").replaceAll(" )", ")");
  return written;
}

function writeToken(token: string, writeVariable: (name: string) => string) {
  const symbol = OPERATOR_SYMBOLS[token];

  if (symbol) {
    return symbol;
  }

  if (/^[A-Za-z]/.test(token)) {
    const variable = writeVariable(token);
    return variable;
  }

  const literal = token === "(" || token === ")" ? token : token.replace(".", ",");
  return literal;
}

function toLabel(name: string) {
  const label = VARIABLE_MEANINGS[name]?.label ?? name;
  return label;
}

function formatVariable(name: string, value: string | undefined) {
  const kind = VARIABLE_MEANINGS[name]?.kind ?? "number";
  const formatted = formatStepValue(value ?? "0", kind);
  return formatted;
}

function formatStepValue(value: string, kind: ValueKind) {
  switch (kind) {
    case "money": {
      const money = formatMoney(value);
      return money;
    }
    case "fraction": {
      const percent = formatPercent(
        formatDecimal(shiftDecimalPoint(parseDecimal(value), FRACTION_TO_PERCENT), EXACT),
      );
      return percent;
    }
    case "number": {
      const plain = value.replace(".", ",");
      return plain;
    }
  }
}

export type { CalculationRegime, StepView, ValueKind };
export { formatStepValue, presentStep };
