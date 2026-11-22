// How many golden cases, captured once from the official calculators, the engine reproduces value by
// value (fixtures/*/manifest.json). The README states them;
// validation.cases.test.ts fails when a fixture is added or removed and this file was not updated.

const REGULAR_REGIME_CASES = 20;
const SIMPLES_GOODS_CASES = 16;
const SIMPLES_SERVICE_CASES = 20;

const VALIDATION_CASES = {
  regularRegime: REGULAR_REGIME_CASES,
  simplesGoods: SIMPLES_GOODS_CASES,
  simplesServices: SIMPLES_SERVICE_CASES,
  total: REGULAR_REGIME_CASES + SIMPLES_GOODS_CASES + SIMPLES_SERVICE_CASES,
};

export { VALIDATION_CASES };
