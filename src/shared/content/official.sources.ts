// Every external link the site shows, with the day it was opened and checked: the single list the
// pages and the calculation memory read, so no page carries a link of its own. A link enters only
// after it was opened and its content matched its label (docs/design.md, Sources).

import { REFORM_STATUS_CHECKED_ON } from "./reform.status.ts";

type OfficialSourceId =
  | "lc214"
  | "ec132"
  | "receitaReformProgram"
  | "receitaServicesPortal"
  | "regularRegimeCalculator"
  | "simplesCalculator"
  | "danfseGenerator"
  | "openSourceAnnouncement"
  | "nfsePortal"
  | "nfeTaxReformNote"
  | "nfeDanfeNote"
  | "nfeDanfeManual"
  | "nfeSchemaPackage"
  | "cfopTable"
  | "nfseTechnicalDocs"
  | "nfseDanfseNote"
  | "officialCalculatorData"
  | "openDataScripts"
  | "sefazRsValidator"
  | "mp1399"
  | "tcuCbsReferenceRate";

interface OfficialSource {
  label: string;
  publisher: string;
  url: string;
  checkedOn: string;
}

const CHECKED_ON = "2026-11-21";
const NFE_CHECKED_ON = "2026-11-22";

const OFFICIAL_SOURCES: Record<OfficialSourceId, OfficialSource> = {
  lc214: {
    label: "Lei Complementar nº 214/2025, texto compilado",
    publisher: "Planalto",
    url: "https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214compilado.htm",
    checkedOn: CHECKED_ON,
  },
  ec132: {
    label: "Emenda Constitucional nº 132/2023",
    publisher: "Planalto",
    url: "https://www.planalto.gov.br/ccivil_03/constituicao/emendas/emc/emc132.htm",
    checkedOn: CHECKED_ON,
  },
  receitaReformProgram: {
    label: "Programa da Reforma Tributária do Consumo",
    publisher: "Receita Federal",
    url: "https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/reforma-tributaria-do-consumo",
    checkedOn: CHECKED_ON,
  },
  receitaServicesPortal: {
    label: "Portal de Serviços Digitais da Reforma, onde fica a calculadora oficial",
    publisher: "Receita Federal",
    url: "https://consumo.tributos.gov.br/",
    checkedOn: CHECKED_ON,
  },
  regularRegimeCalculator: {
    label: "Calculadora do regime regular (código aberto)",
    publisher: "Receita Federal no GitHub",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular",
    checkedOn: CHECKED_ON,
  },
  simplesCalculator: {
    label: "Calculadora do Simples Nacional (código aberto)",
    publisher: "Receita Federal no GitHub",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional",
    checkedOn: CHECKED_ON,
  },
  danfseGenerator: {
    label: "Gerador do DANFSe (código aberto)",
    publisher: "Receita Federal no GitHub",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-gerador-danfse",
    checkedOn: CHECKED_ON,
  },
  openSourceAnnouncement: {
    label: "Receita abre o código-fonte da calculadora de tributos",
    publisher: "Agência Gov, 16/11/2026",
    url: "https://agenciagov.ebc.com.br/noticias/202611/receita-federal-publica-primeiro-codigo-fonte-aberto-no-github-e-amplia-transparencia-da-reforma-tributaria-1",
    checkedOn: CHECKED_ON,
  },
  nfsePortal: {
    label: "Portal da Nota Fiscal de Serviço eletrônica",
    publisher: "Governo Federal",
    url: "https://www.gov.br/nfse/pt-br",
    checkedOn: CHECKED_ON,
  },
  nfeTaxReformNote: {
    label: "Nota Técnica 2025.002 v1.53, o leiaute da NF-e com IBS, CBS e IS",
    publisher: "Portal Nacional da NF-e",
    url: "https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=BMcHSMEoepU=",
    checkedOn: NFE_CHECKED_ON,
  },
  nfeDanfeNote: {
    label: "Nota Técnica 2026.010 v1.00, o DANFE da Reforma Tributária",
    publisher: "Portal Nacional da NF-e",
    url: "https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=ugn4MYF5PLg=",
    checkedOn: NFE_CHECKED_ON,
  },
  nfeDanfeManual: {
    label: "Manual do DANFE e do código de barras (MOC 7.0, Anexo II)",
    publisher: "Portal Nacional da NF-e",
    url: "https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=f%20NhsSn3/5M=",
    checkedOn: NFE_CHECKED_ON,
  },
  nfeSchemaPackage: {
    label: "Esquemas XML da NF-e, Pacote de Liberação nº 010h v1.03, com que o site valida a nota",
    publisher: "Portal Nacional da NF-e",
    url: "https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w=",
    checkedOn: NFE_CHECKED_ON,
  },
  cfopTable: {
    label: "Tabela de CFOP vigente (Convênio SINIEF s/nº de 1970)",
    publisher: "Confaz",
    url: "https://www.confaz.fazenda.gov.br/legislacao/ajustes/sinief/copy_of_cfop_cvsn_70_nova",
    checkedOn: NFE_CHECKED_ON,
  },
  nfseTechnicalDocs: {
    label:
      "Documentação técnica da NFS-e na Reforma Tributária: notas técnicas, leiautes e indicadores",
    publisher: "Portal da NFS-e",
    url: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc",
    checkedOn: NFE_CHECKED_ON,
  },
  nfseDanfseNote: {
    label: "Nota Técnica SE/CGNFS-e nº 008 v1.02, o leiaute do DANFSe",
    publisher: "Portal da NFS-e",
    url: "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/rtc/nt-008-se-cgnfse-danfse-20260714-v1-02.pdf",
    checkedOn: NFE_CHECKED_ON,
  },
  officialCalculatorData: {
    label:
      "Dados da calculadora oficial: classificações tributárias, alíquotas, fundamentações legais, NCM e NBS",
    publisher: "Receita Federal",
    url: "https://consumo.tributos.gov.br/servico/calcular-tributos-consumo/calculadora",
    checkedOn: NFE_CHECKED_ON,
  },
  openDataScripts: {
    label: "Scripts SQL dos dados abertos, na calculadora do regime regular",
    publisher: "Receita Federal no GitHub",
    url: "https://github.com/ReceitaFederal/calculadora-rtc-regime-regular/tree/main/flyway/sql",
    checkedOn: NFE_CHECKED_ON,
  },
  sefazRsValidator: {
    label: "Validador de Mensagens do Projeto NF-e",
    publisher: "Sefaz-RS",
    url: "https://www.sefaz.rs.gov.br/NFE/NFE-VAL.aspx",
    checkedOn: NFE_CHECKED_ON,
  },
  mp1399: {
    label: "Medida Provisória nº 1.399/2026, as alíquotas do Imposto Seletivo para 2027",
    publisher: "Planalto",
    url: "https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/mpv/mpv1399.htm",
    checkedOn: REFORM_STATUS_CHECKED_ON,
  },
  tcuCbsReferenceRate: {
    label: "Alíquota de referência da CBS para 2027, calculada pelo TCU",
    publisher: "Tribunal de Contas da União",
    url: "https://portal.tcu.gov.br/imprensa/noticias/tcu-calcula-aliquota-de-referencia-de-113-para-novo-tributo-sobre-consumo",
    checkedOn: REFORM_STATUS_CHECKED_ON,
  },
};

function readOfficialSource(id: OfficialSourceId) {
  const source = OFFICIAL_SOURCES[id];
  return source;
}

export type { OfficialSource, OfficialSourceId };
export { OFFICIAL_SOURCES, readOfficialSource };
