// A page of search-as-you-type results. Repositories fetch one row past the limit, so hasMore
// is known without a count query (which would read every matching row).

interface SearchPage<Entry> {
  items: Entry[];
  hasMore: boolean;
}

interface SearchOutcome<Entry> {
  page: SearchPage<Entry>;
  rowsRead: number;
}

function toSearchOutcome<Entry>(input: { rows: Entry[]; limit: number; rowsRead: number }) {
  const { rows, limit, rowsRead } = input;
  const page: SearchPage<Entry> = { items: rows.slice(0, limit), hasMore: rows.length > limit };
  const outcome: SearchOutcome<Entry> = { page, rowsRead };
  return outcome;
}

export type { SearchOutcome, SearchPage };
export { toSearchOutcome };
