// Fictitious operations a visitor can load into the form in one click. Each one is a golden fixture
// case (fixtures/regime-regular, fixtures/simples-nacional), so its codes exist in the open data on
// its date. Labels repeat what the searches return for those codes.

import type { ClassificationOption } from "@/features/classifications/classifications.service.ts";
import {
  createSimplesDraft,
  type SimplesDraft,
} from "@/features/simples-nacional/simples.draft.ts";
import { REFORM_STATUS } from "@/shared/content/reform.status.ts";
import type { SearchOption } from "@/shared/data/search.option.ts";
import { createDraft, type OperationDraft, type ProductOption } from "./operation.draft.ts";
import {
  DEFAULT_SELECTIVE_TAX_CLASSIFICATION,
  type SelectiveTaxDraft,
} from "./selective.tax.draft.ts";

type DemoId = "basicFoodBasket" | "cigars" | "preschool" | "simplesNotebook";

interface DemoOperation {
  demoId: DemoId;
  label: string;
  draft: OperationDraft;
  simplesDraft: SimplesDraft;
}

interface DemoItem {
  product: ProductOption;
  description: string;
  classification: ClassificationOption;
  baseAmount: string;
  selectiveTax?: SelectiveTaxDraft;
}

const PORTO_ALEGRE: SearchOption = { code: "4314902", label: "Porto Alegre", hint: "RS" };
const DEMO_UF = "RS";
const DEMO_ITEM_ID = 1;
const DEMO_DATE = "2027-03-10";
// why: the IBS is the one LC 214/2025, art. 344, fixes for 2027; the CBS is the 11,3% reference
// the TCU calculated, minus the 0,1 point of art. 347, while the Senate has not voted (reform.status.ts).
const DEMO_NOMINAL_RATES = {
  cbsRate: REFORM_STATUS.cbsTransitionRate2027.replace("%", ""),
  ibsUfRate: "0,05",
  ibsMunRate: "0,05",
};

const POLISHED_RICE: DemoItem = {
  product: {
    code: "10063021",
    label: "Polido ou brunido",
    hint: "Arroz. › Arroz semibranqueado ou branqueado, mesmo polido ou brunido (glaciado*) › Não parboilizado",
  },
  description: "Arroz branco polido, pacote de 5 kg",
  classification: {
    code: "200003",
    label: "Vendas de produtos destinados à alimentação humana (Anexo I)",
    hint: "CST 200 · alíquota padrão",
    cstCode: "200",
  },
  baseAmount: "100,00",
};

const PRESCHOOL: DemoItem = {
  product: {
    code: "122011200",
    label: "Serviços de pré-escola",
    hint: "Serviços de educação básica › Serviços de educação infantil",
  },
  description: "Mensalidade da pré-escola",
  classification: {
    code: "200028",
    label: "Fornecimento dos serviços de educação (Anexo II)",
    hint: "CST 200 · alíquota padrão",
    cstCode: "200",
  },
  baseAmount: "1.000,00",
};

const NOTEBOOK: DemoItem = {
  product: {
    code: "84713012",
    label: "De peso inferior a 3,5kg, com tela de área superior a 140cm2, mas inferior a 560cm2",
    hint: "Máquinas automáticas para processamento de dados, portáteis",
  },
  description: "Notebook 14 polegadas",
  classification: {
    code: "000001",
    label: "Situações tributadas integralmente pelo IBS e CBS.",
    hint: "CST 000 · alíquota padrão",
    cstCode: "000",
  },
  baseAmount: "1.000,00",
};

// why: the IS rates of the official calculator's test Teste_000001_2, typed: the open data holds none.
const CIGARS: DemoItem = {
  product: {
    code: "24021000",
    label: "Charutos e cigarrilhas, que contenham tabaco",
    hint: "Charutos, cigarrilhas e cigarros, de tabaco ou dos seus sucedâneos.",
    selectiveTaxWindows: [
      { rate: "adValorem", from: "2027-01-01", to: "2028-12-31", exceptions: [] },
      {
        rate: "adRem",
        from: "2027-01-01",
        to: "2033-12-31",
        unit: "VN",
        unitDescription: "Vintena de cigarro",
        exceptions: [],
      },
    ],
  },
  description: "Charutos, caixa com 10 vintenas",
  classification: {
    code: "000001",
    label: "Situações tributadas integralmente pelo IBS e CBS.",
    hint: "CST 000 · alíquota padrão",
    cstCode: "000",
  },
  baseAmount: "2.000,00",
  selectiveTax: {
    classification: DEFAULT_SELECTIVE_TAX_CLASSIFICATION,
    adValoremRate: "13",
    adRemRate: "21,30",
    quantity: "10",
    unit: "VN",
  },
};

const DEMO_OPERATIONS: DemoOperation[] = [
  {
    demoId: "basicFoodBasket",
    label: "Arroz da cesta básica (NF-e, 2027)",
    draft: buildDemoDraft({ documentKind: "nfe", item: POLISHED_RICE }),
    simplesDraft: createSimplesDraft(),
  },
  {
    demoId: "simplesNotebook",
    label: "Notebook no Simples Nacional (NF-e, 2027)",
    draft: buildDemoDraft({ documentKind: "nfe", item: NOTEBOOK }),
    simplesDraft: { ...createSimplesDraft(), cbsRate: "2,3591", ibsRate: "0,0260" },
  },
  {
    demoId: "cigars",
    label: "Charutos com Imposto Seletivo (NF-e, 2027)",
    draft: buildDemoDraft({ documentKind: "nfe", item: CIGARS }),
    simplesDraft: createSimplesDraft(),
  },
  {
    demoId: "preschool",
    label: "Pré-escola, redução de 60% (NFS-e, 2027)",
    draft: buildDemoDraft({ documentKind: "nfse", item: PRESCHOOL }),
    simplesDraft: createSimplesDraft(),
  },
];

// why: every demo carries the same 2027 rates, which the visitor may change; the demos block says
// where each one comes from.
function buildDemoDraft(input: { documentKind: OperationDraft["documentKind"]; item: DemoItem }) {
  const { documentKind, item } = input;
  const draft: OperationDraft = {
    ...createDraft(DEMO_DATE),
    nominalRates: DEMO_NOMINAL_RATES,
    uf: DEMO_UF,
    municipality: PORTO_ALEGRE,
    documentKind,
    operationItems: [{ draftId: DEMO_ITEM_ID, ...item, selectiveTax: item.selectiveTax ?? null }],
  };
  return draft;
}

function findDemoOperation(demoId: DemoId) {
  const demo = DEMO_OPERATIONS.find((entry) => entry.demoId === demoId) ?? null;
  return demo;
}

export type { DemoId, DemoOperation };
export { DEMO_OPERATIONS, findDemoOperation };
