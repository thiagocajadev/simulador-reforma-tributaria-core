// Validity periods in the open data come as "2026-01-01" or "2026-01-01T00:00:00", and an open
// end is either NULL or "9999-12-31". The SQL filter accepts both shapes; the wire shape is a
// plain date and null for an open end.

interface ValidityPeriod {
  validFrom: string;
  validTo: string | null;
}

interface ValidOnClauseInput {
  startColumn: string;
  endColumn: string;
  dateParameter: string;
}

const OPEN_END_DATE = "9999-12-31";
const ISO_DATE_LENGTH = 10;

// why: "2026-01-01T00:00:00" > "2026-01-01" as text, so the start is compared to the end of the day.
function buildValidOnClause(input: ValidOnClauseInput) {
  const { startColumn, endColumn, dateParameter } = input;
  const clause = `${startColumn} <= ${dateParameter} || 'T23:59:59' AND
  (${endColumn} IS NULL OR ${endColumn} >= ${dateParameter})`;
  return clause;
}

function toValidityPeriod(start: string, end: string | null) {
  const validTo = end === null ? null : end.slice(0, ISO_DATE_LENGTH);
  const period: ValidityPeriod = {
    validFrom: start.slice(0, ISO_DATE_LENGTH),
    validTo: validTo === OPEN_END_DATE ? null : validTo,
  };
  return period;
}

export type { ValidityPeriod };
export { buildValidOnClause, toValidityPeriod };
