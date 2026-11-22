interface CstEntry {
  cstCode: string;
  description: string;
}

interface CstListResult {
  items: CstEntry[];
}

export type { CstEntry, CstListResult };
