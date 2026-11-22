// One entry of a search picker: the code the API takes, the label people read, and an optional
// line of context (an NCM's parent headings, a classification's CST).

interface SearchOption {
  code: string;
  label: string;
  hint: string | null;
}

export type { SearchOption };
