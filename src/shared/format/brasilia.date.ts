// Today's date in Brasília, shared by the routes (default reference date) and the form (default
// tax event date).

// why: Brazil has had no daylight saving time since 2019, so Brasília time is a fixed UTC-3.
const BRASILIA_OFFSET_MILLISECONDS = -3 * 60 * 60 * 1000;
const ISO_DATE_LENGTH = 10;

function deriveBrasiliaDate(now: Date) {
  const brasiliaTime = new Date(now.getTime() + BRASILIA_OFFSET_MILLISECONDS);
  const isoDate = brasiliaTime.toISOString().slice(0, ISO_DATE_LENGTH);
  return isoDate;
}

export { deriveBrasiliaDate };
