const HEALTHY_STATUS = "ok";

interface HealthReport {
  status: typeof HEALTHY_STATUS;
  version: string;
}

export type { HealthReport };
export { HEALTHY_STATUS };
