// Splits a written formula ("alíquota * (1 − redução)", "R$ 100,00 * 0,36%") into the pieces the
// calculation memory draws: each term or value becomes a chip, the operators and brackets stay text.

type FormulaToken = { kind: "term"; text: string } | { kind: "symbol"; text: string };

const OPERATOR_PATTERN = /( [*÷+−=] )/;
const RAW_TOKEN = /[A-Za-z]\w*|\d+(?:\.\d+)?|[-+*/()]/g;
const RAW_TERM = /^[A-Za-z\d]/;

function tokenizeFormula(formula: string) {
  const tokens = formula
    .split(OPERATOR_PATTERN)
    .filter((piece) => piece.length > 0)
    .flatMap((piece) =>
      OPERATOR_PATTERN.test(piece) ? [symbolOf(piece.trim())] : splitBrackets(piece),
    );
  return tokens;
}

function symbolOf(text: string) {
  const token: FormulaToken = { kind: "symbol", text };
  return token;
}

// why: a term may carry its own brackets ("redutor de compra governamental (%)"); only the
// brackets it does not close or open itself belong to the formula around it.
function splitBrackets(piece: string) {
  const opening = countUnmatched(piece, "(", ")");
  const closing = countUnmatched(piece, ")", "(");
  const text = piece.slice(opening, piece.length - closing);
  const term: FormulaToken = { kind: "term", text };
  const tokens = [
    ...Array.from({ length: opening }, () => symbolOf("(")),
    term,
    ...Array.from({ length: closing }, () => symbolOf(")")),
  ];
  return tokens;
}

function countUnmatched(piece: string, bracket: string, partner: string) {
  const surplus = countOf(piece, bracket) - countOf(piece, partner);
  const unmatched = Math.max(surplus, 0);
  return unmatched;
}

function countOf(piece: string, character: string) {
  const count = piece.split(character).length - 1;
  return count;
}

// The open data expression as it is stored ("aliquota*(1-percentualReducao)"): names and numbers
// become terms, operators and brackets stay symbols, written as the data writes them.
function tokenizeRawFormula(formula: string) {
  const tokens = (formula.match(RAW_TOKEN) ?? []).map((text) => {
    const token: FormulaToken = RAW_TERM.test(text) ? { kind: "term", text } : symbolOf(text);
    return token;
  });
  return tokens;
}

// why: a narrow screen should break a formula between its top-level pieces ("alíquota",
// "* (1 − redução)", "= 3,52%"), never inside a bracket; each group starts at an operator outside
// every bracket and runs to the next one.
function groupFormulaTokens(tokens: FormulaToken[]) {
  const groups: FormulaToken[][] = [];
  let depth = 0;

  for (const token of tokens) {
    const isBracket = token.text === "(" || token.text === ")";
    const startsGroup = token.kind === "symbol" && !isBracket && depth === 0;
    const current = groups.at(-1);

    if (!current || startsGroup) {
      groups.push([token]);
    } else {
      current.push(token);
    }

    depth += token.text === "(" ? 1 : token.text === ")" ? -1 : 0;
  }

  return groups;
}

export type { FormulaToken };
export { groupFormulaTokens, tokenizeFormula, tokenizeRawFormula };
