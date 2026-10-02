export interface PublisherProfile {
  name: string;
  type: string;
  baseCtr: number;
  baseCpc: number;
  appRate: number;
  qualityRate: number;
  interviewRate: number;
  hireRate: number;
  saturation: number;
  driftPerDay: number;
}

export interface SimulationDayParams {
  publisher: PublisherProfile;
  bid: number;
  budget: number;
  jobContext?: {
    category?: string;
    location?: string;
    experienceLevel?: number;
  };
  rng: () => number;
  dayIndex: number;
}

export interface SimulatedDayResult {
  impressions: number;
  clicks: number;
  applications: number;
  qualified: number;
  interviews: number;
  hires: number;
  spend: number;
}
