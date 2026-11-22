// Code 128 set C, the barcode of the NF-e access key (MOC 7.0, Anexo II, section 2 and Anexo
// III.01): Start C, one symbol per pair of digits, the mod 103 check symbol, Stop. Returns the
// element widths in modules, starting with a bar and alternating bar and space, so the renderer
// draws vector rectangles. Pure and free of jsPDF.

interface Code128Symbols {
  values: number[];
  checkValue: number;
  widths: number[];
  moduleCount: number;
}

const START_C_VALUE = 105;
const CHECK_MODULUS = 103;
const START_C_PATTERN = "211232";
const STOP_PATTERN = "2331112";
const EVEN_DIGITS = /^(?:\d{2})+$/;

// why: index = symbol value 0 to 102 (100 to 102 only ever as the check symbol), each six widths (bar, space, bar, space, bar, space).
const SET_C_PATTERNS = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
];

function encodeCode128C(digits: string) {
  if (!EVEN_DIGITS.test(digits)) {
    throw new Error(`Code 128C takes an even count of digits, got "${digits}".`);
  }

  const values = (digits.match(/\d{2}/g) ?? []).map(Number);
  const checkValue = computeCheckValue(values);
  const patterns = [
    START_C_PATTERN,
    ...values.map(readPattern),
    readPattern(checkValue),
    STOP_PATTERN,
  ];
  const widths = [...patterns.join("")].map(Number);
  const symbols: Code128Symbols = {
    values,
    checkValue,
    widths,
    moduleCount: widths.reduce((sum, width) => sum + width, 0),
  };
  return symbols;
}

// why: the Start C value weighs 1, and each data symbol weighs its position from 1.
function computeCheckValue(values: number[]) {
  const weightedSum = values.reduce(
    (sum, value, position) => sum + value * (position + 1),
    START_C_VALUE,
  );
  const checkValue = weightedSum % CHECK_MODULUS;
  return checkValue;
}

function readPattern(value: number) {
  const pattern = SET_C_PATTERNS[value];

  if (!pattern) {
    throw new Error(`Code 128C has no symbol ${value}; expected 0 to 102.`);
  }

  return pattern;
}

export type { Code128Symbols };
export { encodeCode128C };
