// The Simples Nacional activities (cAtivSN) a document admits on a date, for the activity picker.

interface SimplesActivity {
  activityCode: string;
  description: string;
  annex: string | null;
  isNonTaxable: boolean;
  annexWithoutFatorR: string | null;
  // why: only the activities subject to the Fator R have it; with a Fator R of 28% or more they use it.
  annexWithFatorR: string | null;
  hasIssInSimples: boolean;
  allowsMunicipalBenefit: boolean;
}

interface SimplesActivityListResult {
  items: SimplesActivity[];
}

export type { SimplesActivity, SimplesActivityListResult };
