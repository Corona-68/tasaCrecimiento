export type Direction = 'S1' | 'S2' | 'S0';

export interface TrafficData {
  road: string;
  section: string;
  station: string;
  km: string;
  direction: Direction;
  latestYear: number;
  rawVolumes: string; // The textarea input
}

export interface DataPoint {
  year: number;
  volume: number;
  growthRate?: number; // Calculated percentage change from previous year
}

export interface RegressionResult {
  type: 'Lineal' | 'Exponencial' | 'Logarítmica';
  formula: string;
  rSquared: number;
  growthRate: number; // Average annual growth rate derived from model
  points: { x: number; y: number; yPred: number }[];
  params: { a: number; b: number }; // Generic params for formulas
}

export type ViewState = 'HOME' | 'DATA' | 'LINEAR' | 'EXPONENTIAL' | 'LOGARITHMIC' | 'INTERPRETATION';
