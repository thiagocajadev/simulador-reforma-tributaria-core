// Evaluates the formulas of TRATAMENTO_TRIBUTARIO, which the upstream calculator runs through JEXL
// (AvaliadorExpressaoAritmetica.java). The grammar is the whole of what the 43 rows use:
// + - * /, parentheses, decimal literals and 17 variable names. A variable without a value counts
// as zero (CalculoCbsIbsService.java:710); a name outside the 17 is a broken formula.

import {
  addDecimals,
  type Decimal,
  divideDecimals,
  multiplyDecimals,
  parseDecimal,
  subtractDecimals,
} from "@/shared/math/decimal.ts";

const FORMULA_VARIABLES = [
  "aliquota",
  "aliquotaAdRem",
  "aliquotaAdRemPrincipal",
  "aliquotaAdRemSecundaria",
  "aliquotaAdValorem",
  "aliquotaEfetiva",
  "baseCalculo",
  "baseCalculoInformada",
  "impostoSeletivoCalculado",
  "impostoSeletivoInformado",
  "pBio",
  "pRedutorCompraGov",
  "percentualDiferimento",
  "percentualReducao",
  "quantidade",
  "tributoCalculado",
  "variacaoPontoPercentual",
] as const;

type FormulaVariable = (typeof FORMULA_VARIABLES)[number];

type FormulaValues = Partial<Record<FormulaVariable, Decimal>>;

type Operator = "+" | "-" | "*" | "/";

type FormulaNode =
  | { kind: "literal"; value: Decimal }
  | { kind: "variable"; name: FormulaVariable }
  | { kind: "negation"; operand: FormulaNode }
  | { kind: "binary"; operator: Operator; left: FormulaNode; right: FormulaNode };

type Token =
  | { kind: "literal"; text: string }
  | { kind: "name"; text: string }
  | { kind: "symbol"; text: string };

interface TokenCursor {
  formula: string;
  tokens: Token[];
  position: number;
}

const TOKEN_PATTERN = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z]\w*)|([-+*/()]))\s*/y;
const KNOWN_VARIABLES = new Set<string>(FORMULA_VARIABLES);
const ZERO = parseDecimal("0");

function calculateFormula(formula: string, values: FormulaValues) {
  const tree = parseFormula(formula);
  const result = evaluateFormula(tree, values);
  return result;
}

function parseFormula(formula: string) {
  const cursor: TokenCursor = { formula, tokens: tokenize(formula), position: 0 };
  const tree = parseSum(cursor);

  if (cursor.position < cursor.tokens.length) {
    throw new Error(`Unexpected "${peek(cursor)?.text}" in formula "${formula}"`);
  }

  return tree;
}

// The variables a formula names, once each, in reading order.
function listFormulaVariables(formula: string) {
  const names = collectVariables(parseFormula(formula));
  const unique = [...new Set(names)];
  return unique;
}

function collectVariables(tree: FormulaNode): FormulaVariable[] {
  switch (tree.kind) {
    case "literal": {
      const none: FormulaVariable[] = [];
      return none;
    }
    case "variable": {
      const own = [tree.name];
      return own;
    }
    case "negation": {
      const nested = collectVariables(tree.operand);
      return nested;
    }
    case "binary": {
      const both = [...collectVariables(tree.left), ...collectVariables(tree.right)];
      return both;
    }
  }
}

function evaluateFormula(tree: FormulaNode, values: FormulaValues): Decimal {
  switch (tree.kind) {
    case "literal": {
      return tree.value;
    }
    case "variable": {
      const value = values[tree.name] ?? ZERO;
      return value;
    }
    case "negation": {
      const negated = subtractDecimals(ZERO, evaluateFormula(tree.operand, values));
      return negated;
    }
    case "binary": {
      const result = applyOperator({
        operator: tree.operator,
        left: evaluateFormula(tree.left, values),
        right: evaluateFormula(tree.right, values),
      });
      return result;
    }
  }
}

function tokenize(formula: string) {
  const tokens: Token[] = [];
  TOKEN_PATTERN.lastIndex = 0;

  while (TOKEN_PATTERN.lastIndex < formula.length) {
    const start = TOKEN_PATTERN.lastIndex;
    const match = TOKEN_PATTERN.exec(formula);

    if (!match) {
      throw new Error(`Unexpected character at ${start} in formula "${formula}"`);
    }

    tokens.push(toToken(match));
  }

  return tokens;
}

function toToken(match: RegExpExecArray) {
  const [, literal, name, symbol] = match;

  if (literal !== undefined) {
    const literalToken: Token = { kind: "literal", text: literal };
    return literalToken;
  }

  if (name !== undefined) {
    const nameToken: Token = { kind: "name", text: name };
    return nameToken;
  }

  const symbolToken: Token = { kind: "symbol", text: symbol ?? "" };
  return symbolToken;
}

function parseSum(cursor: TokenCursor) {
  let tree = parseProduct(cursor);

  while (isSymbolAhead(cursor, ["+", "-"])) {
    const operator = consume(cursor).text as Operator;
    tree = { kind: "binary", operator, left: tree, right: parseProduct(cursor) };
  }

  return tree;
}

function parseProduct(cursor: TokenCursor) {
  let tree = parseFactor(cursor);

  while (isSymbolAhead(cursor, ["*", "/"])) {
    const operator = consume(cursor).text as Operator;
    tree = { kind: "binary", operator, left: tree, right: parseFactor(cursor) };
  }

  return tree;
}

function parseFactor(cursor: TokenCursor): FormulaNode {
  const token = consume(cursor);

  if (token.kind === "literal") {
    const literal: FormulaNode = { kind: "literal", value: parseDecimal(token.text) };
    return literal;
  }

  if (token.kind === "name") {
    const variable = toVariable(token.text, cursor.formula);
    return variable;
  }

  if (token.text === "-") {
    const negation: FormulaNode = { kind: "negation", operand: parseFactor(cursor) };
    return negation;
  }

  if (token.text === "(") {
    const grouped = parseGroup(cursor);
    return grouped;
  }

  throw new Error(`Unexpected "${token.text}" in formula "${cursor.formula}"`);
}

function parseGroup(cursor: TokenCursor) {
  const grouped = parseSum(cursor);
  const closing = consume(cursor);

  if (closing.text !== ")") {
    throw new Error(`Missing ")" in formula "${cursor.formula}"`);
  }

  return grouped;
}

function toVariable(name: string, formula: string) {
  if (!KNOWN_VARIABLES.has(name)) {
    throw new Error(`Unknown variable "${name}" in formula "${formula}"`);
  }

  const variable: FormulaNode = { kind: "variable", name: name as FormulaVariable };
  return variable;
}

function applyOperator(input: { operator: Operator; left: Decimal; right: Decimal }) {
  const { operator, left, right } = input;

  switch (operator) {
    case "+": {
      const sum = addDecimals(left, right);
      return sum;
    }
    case "-": {
      const difference = subtractDecimals(left, right);
      return difference;
    }
    case "*": {
      const product = multiplyDecimals(left, right);
      return product;
    }
    case "/": {
      const quotient = divideDecimals(left, right);
      return quotient;
    }
  }
}

function isSymbolAhead(cursor: TokenCursor, symbols: string[]) {
  const token = peek(cursor);
  const isAhead = token?.kind === "symbol" && symbols.includes(token.text);
  return isAhead;
}

function peek(cursor: TokenCursor) {
  const token = cursor.tokens[cursor.position];
  return token;
}

function consume(cursor: TokenCursor) {
  const token = peek(cursor);

  if (!token) {
    throw new Error(`Formula ends too early: "${cursor.formula}"`);
  }

  cursor.position += 1;
  return token;
}

export type { FormulaNode, FormulaValues, FormulaVariable };
export { calculateFormula, evaluateFormula, FORMULA_VARIABLES, listFormulaVariables, parseFormula };
