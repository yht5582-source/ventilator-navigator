export type ClinicalWarning = {
  level: "danger" | "attention" | "info";
  title: string;
  detail: string;
};

export type DerivedMetrics = {
  bmi: number | null;
  pbw: number | null;
  vtPerPbw: number | null;
  pfRatio: number | null;
  drivingPressure: number | null;
  staticCompliance: number | null;
};

export type ClinicalAnalysis = {
  metrics: DerivedMetrics;
  strategy: string;
  preferredMode: string;
  confidence: string;
  alternatives: string[];
  reasoning: string[];
  warnings: ClinicalWarning[];
  missingData: string[];
  invalidData: string[];
  monitorNext: string[];
  avoid: string[];
};

export function calculatePredictedBodyWeight(
  sex: string | null,
  heightCm: number | null,
): number | null;
export function calculateDerivedMetrics(
  patient: Record<string, unknown>,
): DerivedMetrics;
export function analyzePatient(
  patient: Record<string, unknown>,
): ClinicalAnalysis;
export function validatePatientInputs(
  patient: Record<string, unknown>,
): string[];
export const clinicalRules: Array<{
  id: string;
  population: string;
  label: string;
  source: string;
  year: number;
  evidenceLevel: string;
  url: string;
  doi: string | null;
  lastReviewed: string;
}>;
