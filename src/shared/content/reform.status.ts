// The legal facts still pending while the reform is regulated, as they stood on the day they were
// checked at the official sources (docs/content-audit.md). Every page that says what stood on a
// date reads it here, so one recheck updates the whole site and no page keeps a stale date.
// On that day the Senate had not voted the 2027 CBS rate and MP 1.399/2026 was not yet law; when
// either changes, the copy that says so changes with this file.

const REFORM_STATUS_CHECKED_ON = "2026-11-22";

// why: the TCU rate (TC 006.529/2026-7) awaits the Senate resolution, and LC 214, art. 347, takes
// 0,1 point off it in 2027 and 2028; MP 1.399/2026, art. 19, takes effect after the 90 days.
const REFORM_STATUS = {
  checkedOn: REFORM_STATUS_CHECKED_ON,
  cbsTcuRate2027: "11,3%",
  cbsTcuDecidedOn: "2026-10-28",
  cbsTransitionRate2027: "11,2%",
  selectiveTaxEffectiveFrom: "2027-02-02",
} as const;

function formatStatusDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  const brazilianDate = `${day}/${month}/${year}`;
  return brazilianDate;
}

const REFORM_STATUS_DATE = formatStatusDate(REFORM_STATUS.checkedOn);
const CBS_TCU_DATE = formatStatusDate(REFORM_STATUS.cbsTcuDecidedOn);

export {
  CBS_TCU_DATE,
  formatStatusDate,
  REFORM_STATUS,
  REFORM_STATUS_CHECKED_ON,
  REFORM_STATUS_DATE,
};
