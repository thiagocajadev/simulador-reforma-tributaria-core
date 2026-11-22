// What an NFS-e issuer may declare for one NBS and cClassTrib on a date: the LC 116 service items
// the pair maps to and, for each, the operation indicators (cIndOp) allowed. An empty list means
// the open data maps no NFS-e service to the pair.

interface OperationIndicator {
  indicatorCode: string;
  incidencePlace: string;
  operationType: string;
}

interface ServiceItem {
  lc116Code: string;
  nationalTaxCode: string;
  description: string;
  indicators: OperationIndicator[];
}

interface OperationIndicatorsResult {
  nbsCode: string;
  cClassTrib: string;
  serviceItems: ServiceItem[];
}

export type { OperationIndicator, OperationIndicatorsResult, ServiceItem };
