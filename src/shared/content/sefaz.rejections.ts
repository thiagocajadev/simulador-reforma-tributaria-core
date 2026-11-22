// The rejections a simulated NF-e gets at the Sefaz, grouped by why, as the Sefaz-RS validator gave
// them for three notes on the day below (docs/nfe.md, Validation): a 2026 note with the official
// rates, a 2027 note with typed rates, and the cigars note with the Imposto Seletivo. Every one is
// by design or comes from a tax the simulator does not calculate; none questions how the IBS, CBS
// or IS were calculated, and 1037 refuses only the typed 2027 CBS rate. The NF-e section and the
// FAQ read this list, so they cannot drift apart.

import { REFORM_STATUS_DATE } from "./reform.status.ts";

interface SefazRejection {
  code: string;
  summary: string;
}

interface SefazRejectionCause {
  causeId: string;
  cause: string;
  rejections: SefazRejection[];
  reason: string;
}

const SEFAZ_REJECTIONS_CHECKED_ON = "2026-11-22";

const SEFAZ_REJECTION_CAUSES: SefazRejectionCause[] = [
  {
    causeId: "testSignature",
    cause: "Assinatura de teste",
    rejections: [
      { code: "297", summary: "Assinatura difere da calculada" },
      { code: "213", summary: "CNPJ do emitente difere do certificado" },
    ],
    reason:
      "A assinatura leva valores fictícios, de propósito: nenhum certificado digital real assina a nota.",
  },
  {
    causeId: "fictitiousParties",
    cause: "Chave e partes fictícias",
    rejections: [
      { code: "253", summary: "Dígito verificador da chave inválido" },
      { code: "897", summary: "Código numérico da chave em formato inválido" },
      { code: "209", summary: "IE do emitente inválida" },
      { code: "237", summary: "CPF do destinatário inválido" },
      { code: "245", summary: "CNPJ do emitente não cadastrado" },
    ],
    reason:
      "Emitente, destinatário e chave de acesso são inventados, para que a nota nunca se passe por uma real.",
  },
  {
    causeId: "noteDate",
    cause: "Data da nota",
    rejections: [
      { code: "703", summary: "Emissão depois do horário de recebimento" },
      { code: "504", summary: "Saída depois do horário de recebimento" },
      { code: "228", summary: "Emissão muito antiga" },
      { code: "505", summary: "Saída muito antiga" },
    ],
    reason:
      "A data da nota simulada não é a do envio. Uma data futura, como a de 2027 dos exemplos, recebe 703 e 504; uma data antiga, como março de 2026 conferida em novembro, recebe 228 e 505.",
  },
  {
    causeId: "notCalculated",
    cause: "Tributos não calculados",
    rejections: [
      { code: "745", summary: "Sem o grupo do PIS" },
      { code: "748", summary: "Sem o grupo da Cofins" },
      { code: "1002", summary: "Sem ICMS nem ISSQN" },
    ],
    reason:
      "O simulador calcula a CBS, o IBS e o IS. O esquema deixa os outros grupos opcionais, mas as regras os exigem.",
  },
  {
    causeId: "cbsRateNotOfficial",
    cause: "Alíquota da CBS ainda não oficial",
    rejections: [{ code: "1037", summary: "Alíquota da CBS inválida" }],
    reason: `De 2027 em diante a alíquota da CBS é digitada: em ${REFORM_STATUS_DATE}, o Senado ainda não tinha fixado a oficial. Uma nota de 2026, com as alíquotas oficiais, não recebe esta rejeição.`,
  },
  {
    causeId: "paymentTotal",
    cause: "Pode aparecer: pagamento e total",
    rejections: [{ code: "866", summary: "Pagamento maior que o total, sem troco" }],
    reason:
      "A regra compara o pagamento com o total da nota sem a CBS, o IBS e o IS. De 2027 em diante esses tributos são cobrados por fora e entram no pagamento, que passa a ser maior. O simulador não inventa um troco para escondê-la. A Sefaz aplicou a regra a uma nota de 2027 e não à nota com IS.",
  },
];

export type { SefazRejection, SefazRejectionCause };
export { SEFAZ_REJECTION_CAUSES, SEFAZ_REJECTIONS_CHECKED_ON };
